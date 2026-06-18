/**
 * In-Memory Plan & Artifact Store (Ephemeral)
 *
 * Spec decisions:
 *  - No persistence layer (ephemeral only).
 *  - No retention / TTL cleanup enforced (but we track createdAt for future use).
 *  - Simple Maps; not optimized for multi-process clustering.
 *
 * Responsibilities:
 *  - Store validated & runtime-initialized plans.
 *  - Provide mutation utilities for step status updates (orchestrator).
 *  - Register & retrieve artifact metadata (e.g., generated CSV files).
 *
 * NOTE: All functions are synchronous & minimal. If future scaling required, replace with
 * a repository interface and injectable backend (Redis, SQLite, etc.).
 */

import { Plan, StepStatus, validatePlan, initializeRuntimeState } from './types'

/* ---------------------------------- *
 * Types
 * ---------------------------------- */

export interface StoredPlan extends Plan {
  storedAt: number
  // Execution context object for passing data between steps
  // (Key: stepId, Value: arbitrary JSON serializable result or a subset)
  stepOutputs: Record<string, any>
}

export interface ArtifactRecord {
  id: string
  type: 'CSV' | 'JSON' | 'TEXT'
  filename: string
  path: string            // Server filesystem absolute or relative path
  mime: string
  createdAt: number
  bytes?: number
  meta?: Record<string, any>
}

/* ---------------------------------- *
 * Internal State
 * ---------------------------------- */

const planStore: Map<string, StoredPlan> = new Map()
const artifactStore: Map<string, ArtifactRecord> = new Map()

/* ---------------------------------- *
 * ID Utilities
 * ---------------------------------- */

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 14)}`
}

/* ---------------------------------- *
 * Logging Helper
 * ---------------------------------- */

function debugLog(...args: any[]) {
  if (process.env.AGENT_DEBUG) {
    // eslint-disable-next-line no-console
    console.log('[AGENT_STORE]', ...args)
  }
}

/* ---------------------------------- *
 * Public Plan APIs
 * ---------------------------------- */

/**
 * Validates & initializes a plan then stores it.
 * If the planId already exists, we suffix a random token to ensure uniqueness.
 */
export function saveNewPlan(rawPlan: unknown): StoredPlan {
  const validated = validatePlan(rawPlan)
  let planId = validated.planId
  if (planStore.has(planId)) {
    planId = `${planId}_${generateId('v')}`
  }

  const initialized = initializeRuntimeState({
    ...validated,
    planId,
  })

  const stored: StoredPlan = {
    ...initialized,
    storedAt: Date.now(),
    stepOutputs: {},
  }

  planStore.set(planId, stored)
  debugLog('Saved plan', planId)
  return stored
}

export function getPlan(planId: string): StoredPlan | undefined {
  return planStore.get(planId)
}

export function listPlans(): StoredPlan[] {
  return Array.from(planStore.values()).sort((a, b) => b.storedAt - a.storedAt)
}

/**
 * Update a plan in-place. Mutator receives a mutable clone (shallow) of the plan object.
 * Returns the updated plan or undefined if not found.
 */
export function updatePlan(planId: string, mutator: (draft: StoredPlan) => void): StoredPlan | undefined {
  const existing = planStore.get(planId)
  if (!existing) return undefined
  const draft: StoredPlan = { ...existing, steps: existing.steps.map(s => ({ ...s })), stepOutputs: { ...existing.stepOutputs } }
  mutator(draft)
  planStore.set(planId, draft)
  debugLog('Updated plan', planId)
  return draft
}

/**
 * Record a step output (full or partial) for later dependency resolution.
 * Optionally store a snippet (like first N rows) elsewhere if large; for now store raw.
 */
export function recordStepOutput(planId: string, stepId: string, output: any): void {
  updatePlan(planId, draft => {
    draft.stepOutputs[stepId] = output
  })
}

/**
 * Convenience for status transitions.
 */
export function setStepStatus(planId: string, stepId: string, status: StepStatus, extra?: {
  error?: string
  outputSummary?: string
  producedArtifactIds?: string[]
  resultSnippet?: any
}) {
  updatePlan(planId, draft => {
    const step = draft.steps.find(s => s.id === stepId)
    if (!step) return
    if (status === StepStatus.RUNNING) {
      step.startedAt = Date.now()
    }
    if ([StepStatus.SUCCESS, StepStatus.ERROR, StepStatus.SKIPPED].includes(status)) {
      step.endedAt = Date.now()
    }
    step.status = status
    if (extra?.error) step.error = extra.error
    if (extra?.outputSummary) step.outputSummary = extra.outputSummary
    if (extra?.producedArtifactIds) step.producedArtifactIds = extra.producedArtifactIds
    if (extra?.resultSnippet !== undefined) step.resultSnippet = extra.resultSnippet
  })
}

/* ---------------------------------- *
 * Artifact APIs
 * ---------------------------------- */

export function registerArtifact(record: Omit<ArtifactRecord, 'createdAt'>): ArtifactRecord {
  const rec: ArtifactRecord = {
    ...record,
    createdAt: Date.now(),
  }
  artifactStore.set(rec.id, rec)
  debugLog('Registered artifact', rec.id, rec.filename)
  return rec
}

export function getArtifact(id: string): ArtifactRecord | undefined {
  return artifactStore.get(id)
}

export function listArtifacts(): ArtifactRecord[] {
  return Array.from(artifactStore.values()).sort((a, b) => b.createdAt - a.createdAt)
}

/* ---------------------------------- *
 * Derived Helpers
 * ---------------------------------- */

/**
 * Produce a sanitized version of a plan safe for returning to clients
 * (e.g., exclude large stepOutputs).
 */
export function sanitizePlanForClient(plan: StoredPlan): any {
  return {
    planId: plan.planId,
    objective: plan.objective,
    createdAt: plan.createdAt,
    steps: plan.steps.map(s => ({
      id: s.id,
      kind: s.kind,
      title: s.title,
      description: s.description,
      params: s.params, // params already validated
      status: s.status,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      error: s.error,
      outputSummary: s.outputSummary,
      producedArtifactIds: s.producedArtifactIds,
      resultSnippet: s.resultSnippet,
    })),
    notes: plan.notes,
  }
}

/**
 * Get combined simple status counts for dashboard / debug.
 */
export function summarizePlanStatuses(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const plan of planStore.values()) {
    for (const step of plan.steps) {
      counts[step.status || StepStatus.PENDING] = (counts[step.status || StepStatus.PENDING] || 0) + 1
    }
  }
  return counts
}

/* ---------------------------------- *
 * Debug / Dev Helpers
 * ---------------------------------- */

export function resetAllAgentStores() {
  planStore.clear()
  artifactStore.clear()
  debugLog('Reset all in-memory agent stores')
}

/* ---------------------------------- *
 * Simple Guardrail Utility
 * ---------------------------------- */

/**
 * Quick rejection of obviously dangerous raw natural language input (prompt).
 * We do not attempt exhaustive sanitization here—just coarse filtering.
 */
export function isPromptDangerous(prompt: string): boolean {
  return /(drop\s+table|delete\s+from|alter\s+table|;--)/i.test(prompt)
}