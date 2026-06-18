/**
 * Agent Plan & Execution Type System
 *
 * The model does NOT support native tool/function calling. We therefore:
 *  1. Ask the model (planner prompt) to emit a JSON object with a strict schema.
 *  2. Validate with Zod before any execution.
 *  3. Store validated plan in an in-memory registry (see store.ts; not yet implemented).
 *  4. Orchestrator executes steps sequentially (Phase 2 scope) in defined order.
 *
 * Step Kinds (Phase 2):
 *  - QUERY_DATA: Use Data Query Agent (tool: query_local_database)
 *  - ENRICH_PROFILE: Use Profile Enrichment Agent (tool: enrich_profile) potentially over a list of usernames
 *  - REPORT: Use Reporting Agent (tool: generate_spreadsheet)
 *
 * Future extension:
 *  - PARALLEL groups (array of steps executed concurrently)
 *  - CONDITIONAL branches with simple boolean expressions referencing previous step outputs
 *  - RETRY policy per step
 */

import { z } from 'zod'

/* ------------------------------------ *
 * Enumerations
 * ------------------------------------ */

export enum StepKind {
  QUERY_DATA = 'QUERY_DATA',
  ENRICH_PROFILE = 'ENRICH_PROFILE',
  LINKEDIN_RESEARCH = 'LINKEDIN_RESEARCH',
  GENERATE_OUTREACH = 'GENERATE_OUTREACH',
  REPORT = 'REPORT',
}

export enum StepStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  SKIPPED = 'SKIPPED',
}

export interface ArtifactDescriptor {
  id: string               // UUID for download or reference
  type: 'CSV' | 'JSON' | 'TEXT'
  mime: string
  path?: string            // Filesystem path (server-side)
  meta?: Record<string, any>
}

/* ------------------------------------ *
 * Core Step Interfaces
 * ------------------------------------ */

export interface BaseStep {
  id: string
  kind: StepKind
  title: string
  description?: string
  // Inputs referencing prior step outputs by id (ex: ["step1.profiles"])
  inputRefs?: string[]
  // Arbitrary parameters specific to the step kind (validated by zod)
  params: Record<string, any>
  // Execution-time fields (not provided by planner)
  status?: StepStatus
  startedAt?: number
  endedAt?: number
  error?: string
  outputSummary?: string
  producedArtifactIds?: string[]        // IDs of artifacts registered in orchestrator
  resultSnippet?: any                   // Small portion of result for client display
}

/**
 * Specific parameter shapes we expect the planner to follow.
 * Only minimal guardrails now; orchestrator will perform deeper validation before executing.
 */
export const QueryDataParamsSchema = z.object({
  intent: z.string().min(1).max(200)
    .describe('High-level user intent or canonical query label'),
  limit: z.number().int().positive().max(100000).optional()
    .describe('Optional row limit hint'),
  filters: z.record(z.any()).optional()
    .describe('Structured filters extracted from NL (key-value)'),
})

export const EnrichProfileParamsSchema = z.object({
  sourceStepId: z.string()
    .describe('ID of a previous DATA step supplying usernames'),
  usernameField: z.string().default('current_username')
    .describe('Field name in previous step output containing username strings'),
  maxProfiles: z.number().int().positive().max(500).optional()
    .describe('Optional cap to avoid runaway enrichment'),
})

export const LinkedInResearchParamsSchema = z.object({
  sourceStepId: z.string()
    .describe('ID of a previous DATA step supplying usernames'),
  usernameField: z.string().default('current_username')
    .describe('Field name in previous step output containing username strings'),
  tags: z.union([z.string(), z.array(z.string())]).optional()
    .describe('Tags to include in LinkedIn API requests'),
  maxProfiles: z.number().int().positive().max(500).optional()
    .describe('Optional cap to avoid runaway LinkedIn requests'),
})

export const GenerateOutreachParamsSchema = z.object({
  sourceStepId: z.string()
    .describe('ID of a previous LINKEDIN_RESEARCH step supplying summaries'),
  purpose: z.string()
    .describe('Purpose of the outreach (collaboration, partnership, hiring, etc.)'),
  tone: z.string().default('professional')
    .describe('Message tone (professional, casual, friendly, etc.)'),
  companyName: z.string().optional()
    .describe('Sender company name for personalization'),
  senderName: z.string().optional()
    .describe('Sender name for personalization'),
  customPrompt: z.string().optional()
    .describe('Custom LLM prompt for specific messaging requirements'),
  maxMessages: z.number().int().positive().max(200).optional()
    .describe('Optional cap on number of messages to generate'),
})

export const ReportParamsSchema = z.object({
  sourceStepIds: z.array(z.string()).min(1)
    .describe('Step IDs whose outputs get merged / referenced for report'),
  columns: z.array(z.string()).min(1)
    .describe('Ordered list of column names for spreadsheet'),
  filename: z.string().optional()
    .describe('Optional custom filename (without path)'),
  format: z.enum(['CSV']).default('CSV')
    .describe('Currently only CSV supported in Phase 2'),
})

/* ------------------------------------ *
 * Zod Step Discriminated Union
 * ------------------------------------ */

const BaseStepSchema = z.object({
  id: z.string().min(1),
  kind: z.nativeEnum(StepKind),
  title: z.string().min(1),
  description: z.string().optional(),
  inputRefs: z.array(z.string()).optional(),

  // Runtime / execution-populated optional fields (not required from planner)
  status: z.nativeEnum(StepStatus).optional(),
  startedAt: z.number().int().optional(),
  endedAt: z.number().int().optional(),
  error: z.string().optional(),
  outputSummary: z.string().optional(),
  producedArtifactIds: z.array(z.string()).optional(),
  resultSnippet: z.any().optional(),
})

const QueryDataStepSchema = BaseStepSchema.extend({
  kind: z.literal(StepKind.QUERY_DATA),
  params: QueryDataParamsSchema,
})

const EnrichProfileStepSchema = BaseStepSchema.extend({
  kind: z.literal(StepKind.ENRICH_PROFILE),
  params: EnrichProfileParamsSchema,
})

const LinkedInResearchStepSchema = BaseStepSchema.extend({
  kind: z.literal(StepKind.LINKEDIN_RESEARCH),
  params: LinkedInResearchParamsSchema,
})

const GenerateOutreachStepSchema = BaseStepSchema.extend({
  kind: z.literal(StepKind.GENERATE_OUTREACH),
  params: GenerateOutreachParamsSchema,
})

const ReportStepSchema = BaseStepSchema.extend({
  kind: z.literal(StepKind.REPORT),
  params: ReportParamsSchema,
})

export const StepSchema = z.discriminatedUnion('kind', [
  QueryDataStepSchema,
  EnrichProfileStepSchema,
  LinkedInResearchStepSchema,
  GenerateOutreachStepSchema,
  ReportStepSchema,
])

export type ValidatedStep = z.infer<typeof StepSchema>

/* ------------------------------------ *
 * Plan Schema
 * ------------------------------------ */

export const PlanSchema = z.object({
  planId: z.string().min(1),
  objective: z.string().min(1).max(2000),
  createdAt: z.number().int().optional(), // if planner includes; else we set server-side
  steps: z.array(StepSchema).min(1),
  notes: z.string().optional(),
})

export type Plan = z.infer<typeof PlanSchema>

/* ------------------------------------ *
 * Validation Helpers
 * ------------------------------------ */

export function validatePlan(raw: unknown): Plan {
  const parsed = PlanSchema.parse(raw)
  // Additional semantic validations:
  const stepIds = new Set(parsed.steps.map(s => s.id))
  // Ensure referenced source steps exist
  for (const step of parsed.steps) {
    if (step.kind === StepKind.ENRICH_PROFILE) {
      if (!stepIds.has(step.params.sourceStepId)) {
        throw new Error(
          `ENRICH_PROFILE step "${step.id}" references missing sourceStepId "${step.params.sourceStepId}"`,
        )
      }
    }
    if (step.kind === StepKind.LINKEDIN_RESEARCH) {
      if (!stepIds.has(step.params.sourceStepId)) {
        throw new Error(
          `LINKEDIN_RESEARCH step "${step.id}" references missing sourceStepId "${step.params.sourceStepId}"`,
        )
      }
    }
    if (step.kind === StepKind.GENERATE_OUTREACH) {
      if (!stepIds.has(step.params.sourceStepId)) {
        throw new Error(
          `GENERATE_OUTREACH step "${step.id}" references missing sourceStepId "${step.params.sourceStepId}"`,
        )
      }
    }
    if (step.kind === StepKind.REPORT) {
      for (const sid of step.params.sourceStepIds) {
        if (!stepIds.has(sid)) {
          throw new Error(
            `REPORT step "${step.id}" references missing sourceStepId "${sid}"`,
          )
        }
      }
    }
  }
  return parsed
}

/**
 * Derive a quick dependency graph / adjacency list.
 * For this phase we only need a topological order check (steps are already sequential from planner).
 * If we later allow reordering or parallelism, we can expand this.
 */
export function deriveDependencies(plan: Plan): Record<string, Set<string>> {
  const deps: Record<string, Set<string>> = {}
  for (const s of plan.steps) {
    deps[s.id] = new Set()
  }
  for (const s of plan.steps) {
    if (s.kind === StepKind.ENRICH_PROFILE) {
      deps[s.id].add(s.params.sourceStepId)
    }
    if (s.kind === StepKind.LINKEDIN_RESEARCH) {
      deps[s.id].add(s.params.sourceStepId)
    }
    if (s.kind === StepKind.GENERATE_OUTREACH) {
      deps[s.id].add(s.params.sourceStepId)
    }
    if (s.kind === StepKind.REPORT) {
      for (const sid of s.params.sourceStepIds) {
        deps[s.id].add(sid)
      }
    }
    // Generic input refs (if any)
    if (s.inputRefs) {
      for (const ref of s.inputRefs) {
        const refRoot = ref.split('.')[0]
        if (deps[s.id] && refRoot !== s.id) {
          deps[s.id].add(refRoot)
        }
      }
    }
  }
  return deps
}

/**
 * Simple cycle detection (defensive; planner should not produce cycles).
 */
export function detectCycles(depMap: Record<string, Set<string>>): string[] {
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const cycle: string[] = []

  function dfs(node: string): boolean {
    if (visiting.has(node)) {
      cycle.push(node)
      return true
    }
    if (visited.has(node)) return false
    visiting.add(node)
    for (const dep of depMap[node] || []) {
      if (dfs(dep)) {
        cycle.push(node)
        return true
      }
    }
    visiting.delete(node)
    visited.add(node)
    return false
  }

  for (const node of Object.keys(depMap)) {
    if (dfs(node)) break
  }
  return cycle.reverse()
}

/**
 * Utility to initialize runtime status fields for a plan just after validation.
 */
export function initializeRuntimeState(plan: Plan): Plan {
  return {
    ...plan,
    createdAt: plan.createdAt || Date.now(),
    steps: plan.steps.map(s => ({
      ...s,
      status: StepStatus.PENDING,
    })),
  }
}