/**
 * Orchestrator
 *
 * Sequential execution of a validated Plan (Phase 2 scope).
 * Responsibilities:
 *  - Load stored plan (already validated & runtime-initialized)
 *  - Execute each step in order (plan.steps array order is authoritative)
 *  - Respect explicit dependencies via semantic validation already done (we assume order is valid)
 *  - For each step:
 *      * mark RUNNING
 *      * invoke corresponding agent/tool
 *      * capture outputs (full or snippet) in plan store
 *      * mark SUCCESS / ERROR
 *  - Emit structured events via callback (to be bridged to SSE layer by API route)
 *
 * OUT OF SCOPE (Phase 2):
 *  - Parallel execution
 *  - Conditional branching
 *  - Dynamic re-planning / error recovery
 *  - Persistent artifact / plan storage
 *
 * Event Types (for SSE route mapping):
 *  - plan_started
 *  - step_started
 *  - step_result
 *  - artifact_ready
 *  - plan_completed
 *  - plan_error
 *
 * Safety:
 *  - Extraction helpers (e.g. usernames for enrichment) are defensive.
 *  - Steps referencing missing outputs throw early errors.
 */

import { Plan, StepKind, StepStatus, ValidatedStep } from './types'
import {
  getPlan,
  setStepStatus,
  recordStepOutput,
  sanitizePlanForClient,
  updatePlan,
} from './store'
import { runDataQueryAgent } from './tools/queryLocalDatabase'
import { runProfileEnrichmentAgent } from './tools/enrichProfile'
import { runLinkedInResearchAgent } from './tools/linkedinResearch'
import { runGenerateOutreachAgent } from './tools/generateOutreach'
import { runReportingAgent } from './tools/generateSpreadsheet'

/* ---------------------------------- *
 * Event Types
 * ---------------------------------- */

export type OrchestratorEvent =
  | {
      type: 'plan_started'
      planId: string
      objective: string
    }
  | {
      type: 'step_started'
      planId: string
      stepId: string
      kind: StepKind
      title: string
    }
  | {
      type: 'step_result'
      planId: string
      stepId: string
      kind: StepKind
      status: StepStatus
      resultSnippet?: any
      outputSummary?: string
      error?: string
    }
  | {
      type: 'artifact_ready'
      planId: string
      stepId: string
      artifactId: string
      filename: string
    }
  | {
      type: 'plan_completed'
      planId: string
      finalStatus: 'SUCCESS'
      totalSteps: number
      succeeded: number
      failed: number
      durationMs: number
    }
  | {
      type: 'plan_error'
      planId: string
      error: string
    }

/* ---------------------------------- *
 * Options
 * ---------------------------------- */

export interface OrchestratorRunOptions {
  onEvent?: (ev: OrchestratorEvent) => void
  signal?: AbortSignal
  /**
   * Limit for how many rows to keep in resultSnippet when storing / emitting step_result
   */
  rowSnippetLimit?: number
  /**
   * Limit for shape of enrichment snippet
   */
  enrichmentSnippetLimit?: number
}

/* ---------------------------------- *
 * Internal Helpers
 * ---------------------------------- */

function debugLog(...args: any[]) {
  if (process.env.AGENT_DEBUG === '1') {
    // eslint-disable-next-line no-console
    console.log('[ORCHESTRATOR]', ...args)
  }
}

function emit(opts: OrchestratorRunOptions | undefined, ev: OrchestratorEvent) {
  try {
    opts?.onEvent?.(ev)
  } catch (e) {
    debugLog('event_emit_error', (e as any)?.message)
  }
}

function ensureNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new Error('Execution aborted')
  }
}

interface StepExecutionContext {
  plan: Plan
  options: OrchestratorRunOptions
}

/* ---------------------------------- *
 * Data Extraction Helpers
 * ---------------------------------- */

function extractUsernamesFromSource(step: ValidatedStep, plan: Plan, sourceStepId: string, usernameField: string): string[] {
  // We rely on prior step outputs stored in planStore (stepOutputs). Instead of re-importing store's internal map,
  // we re-query full plan state (updatePlan wrapper ensures we always mutate sanitized copy).
  // To avoid leaking large payloads, orchestrator only stored entire output via recordStepOutput.
  // We re-fetch that here by adding a helper accessor; for simplicity we use an updatePlan no-op to retrieve current.
  let outputs: any
  updatePlan(plan.planId, draft => {
    outputs = draft.stepOutputs[sourceStepId]
  })
  if (!outputs) {
    throw new Error(`Source step "${sourceStepId}" output not found for enrichment step "${step.id}"`)
  }

  // Known possible shapes:
  //  - DataQueryAgentOutput: { rows: [{ current_username, ... }], rowCount, ... }
  //  - Custom user-provided future shapes
  const usernames: string[] = []
  if (Array.isArray(outputs?.rows)) {
    for (const r of outputs.rows) {
      const val = r?.[usernameField]
      if (typeof val === 'string' && val.trim()) {
        usernames.push(val.trim())
      }
    }
  } else if (Array.isArray(outputs)) {
    for (const r of outputs) {
      const val = r?.[usernameField]
      if (typeof val === 'string' && val.trim()) {
        usernames.push(val.trim())
      }
    }
  }
  return Array.from(new Set(usernames))
}

/* ---------------------------------- *
 * Step Executors
 * ---------------------------------- */

async function executeQueryData(step: ValidatedStep, ctx: StepExecutionContext, planId: string) {
  const params = step.params as any
  const intent = params.intent
  const limit = params.limit
  const filters = params.filters
  const start = Date.now()
  const result = await runDataQueryAgent({
    stepId: step.id,
    intent,
    limit,
    filters,
  })
  const duration = Date.now() - start
  const rows = result.rows || []
  const snippetLimit = ctx.options.rowSnippetLimit ?? 25
  const snippet = rows.slice(0, snippetLimit)
  const summary = `rows=${rows.length} intent=${intent} durationMs=${duration}`
  return {
    full: result,
    snippet,
    summary,
    artifacts: [] as string[],
  }
}

async function executeEnrichProfile(step: ValidatedStep, ctx: StepExecutionContext, planId: string) {
  const params = step.params as any
  const sourceStepId: string = params.sourceStepId
  const usernameField: string = params.usernameField || 'current_username'
  const maxProfiles: number | undefined = params.maxProfiles

  const usernames = extractUsernamesFromSource(step, ctx.plan, sourceStepId, usernameField)
  const start = Date.now()
  const result = await runProfileEnrichmentAgent({
    stepId: step.id,
    usernames,
    maxProfiles,
  })
  const duration = Date.now() - start
  const snippetLimit = ctx.options.enrichmentSnippetLimit ?? 15
  const snippet = result.enriched.slice(0, snippetLimit).map(e => ({
    username: e.username,
    raw_text_preview: e.raw_text.slice(0, 80),
  }))
  const summary = `enriched=${result.enriched.length} failed=${result.errors.length} durationMs=${duration}`
  return {
    full: result,
    snippet,
    summary,
    artifacts: [] as string[],
  }
}

async function executeLinkedInResearch(step: ValidatedStep, ctx: StepExecutionContext, planId: string) {
  const params = step.params as any
  const sourceStepId: string = params.sourceStepId
  const usernameField: string = params.usernameField || 'current_username'
  const tags: string | string[] | undefined = params.tags
  const maxProfiles: number | undefined = params.maxProfiles

  console.log(`[DEBUG] LinkedIn research step "${step.id}" extracting usernames from source step "${sourceStepId}"`)
  const usernames = extractUsernamesFromSource(step, ctx.plan, sourceStepId, usernameField)
  console.log(`[DEBUG] Extracted ${usernames.length} usernames:`, usernames)
  
  if (usernames.length === 0) {
    console.log(`[DEBUG] No usernames found in source step "${sourceStepId}" - this may indicate a data flow issue`)
  }
  const start = Date.now()
  const result = await runLinkedInResearchAgent({
    stepId: step.id,
    usernames,
    tags,
    maxProfiles,
  })
  const duration = Date.now() - start
  const snippetLimit = ctx.options.enrichmentSnippetLimit ?? 15
  const snippet = result.summaries.slice(0, snippetLimit).map(s => ({
    username: s.username,
    tags: s.tags,
    summary_preview: s.summary.slice(0, 100),
  }))
  const summary = `summaries=${result.summaries.length} failed=${result.errors.length} durationMs=${duration}`
  return {
    full: result,
    snippet,
    summary,
    artifacts: [] as string[],
  }
}

async function executeGenerateOutreach(step: ValidatedStep, ctx: StepExecutionContext, planId: string) {
  const params = step.params as any
  const sourceStepId: string = params.sourceStepId
  const tone: string = params.tone || 'professional'
  const companyName: string | undefined = params.companyName
  const senderName: string | undefined = params.senderName
  const customPrompt: string | undefined = params.customPrompt
  const maxMessages: number | undefined = params.maxMessages
  const purpose: string | undefined = params.purpose

  // Extract LinkedIn summaries from source step and try to find enrichment data
  let summaries: any[] = []
  let enrichmentData: Record<string, any> = {}
  
  updatePlan(planId, draft => {
    const sourceOutput = draft.stepOutputs[sourceStepId]
    console.log(`[DEBUG] Source output for step "${sourceStepId}":`, sourceOutput)
    if (sourceOutput?.summaries && Array.isArray(sourceOutput.summaries)) {
      summaries = sourceOutput.summaries
    }
    
    // Look for enrichment data from all previous steps
    for (const [stepId, output] of Object.entries(draft.stepOutputs)) {
      if (output?.enriched && Array.isArray(output.enriched)) {
        for (const enriched of output.enriched) {
          if (enriched?.username) {
            enrichmentData[enriched.username] = enriched
          }
        }
      }
    }
  })

  console.log(`[DEBUG] Found ${summaries.length} LinkedIn summaries for outreach generation`)
  console.log(`[DEBUG] Found enrichment data for ${Object.keys(enrichmentData).length} profiles`)
  
  if (summaries.length === 0) {
    throw new Error(`No LinkedIn summaries found in source step "${sourceStepId}" for outreach generation`)
  }
  
  // Enhance summaries with enrichment data
  const enhancedSummaries = summaries.map(summary => {
    const enriched = enrichmentData[summary.username]
    return {
      ...summary,
      enrichment: enriched || null
    }
  })

  const start = Date.now()
  const result = await runGenerateOutreachAgent({
    stepId: step.id,
    summaries: enhancedSummaries,
    tone,
    companyName,
    senderName,
    customPrompt,
    maxMessages,
    purpose,
  })
  const duration = Date.now() - start
  const snippetLimit = 10
  const snippet = result.messages.slice(0, snippetLimit).map(m => ({
    username: m.username,
    tone: m.tone,
    purpose: m.purpose,
    message_preview: m.outreach_message.slice(0, 80),
  }))
  const summary = `messages=${result.messages.length} failed=${result.errors.length} tone=${tone} purpose=${purpose || 'networking'} durationMs=${duration}`
  return {
    full: result,
    snippet,
    summary,
    artifacts: [] as string[],
  }
}

async function executeReport(step: ValidatedStep, ctx: StepExecutionContext, planId: string) {
  const params = step.params as any
  const sourceStepIds: string[] = params.sourceStepIds
  const columns: string[] = params.columns
  const filename: string | undefined = params.filename

  // Collect rows from referenced steps
  const combined: any[] = []
  updatePlan(planId, draft => {
    for (const sid of sourceStepIds) {
      const out = draft.stepOutputs[sid]
      if (!out) continue
      // Heuristic: if out has rows property use that, else if it's enrichment output use enriched
      if (Array.isArray(out.rows)) {
        combined.push(...out.rows)
      } else if (Array.isArray(out.enriched)) {
        combined.push(...out.enriched.map((e: any) => ({
          current_username: e.username,
          raw_text: e.raw_text,
          fetched_at: e.fetched_at,
        })))
      } else if (Array.isArray(out.summaries)) {
        // LinkedIn research output
        combined.push(...out.summaries.map((s: any) => ({
          current_username: s.username,
          linkedin_tags: s.tags,
          linkedin_summary: s.summary,
          fetched_at: s.fetched_at,
        })))
      } else if (Array.isArray(out.messages)) {
        // Outreach generation output
        combined.push(...out.messages.map((m: any) => ({
          current_username: m.username,
          real_name: m.real_name,
          linkedin_summary: m.linkedin_summary,
          outreach_message: m.outreach_message,
          message_tone: m.tone,
          message_purpose: m.purpose,
          generated_at: m.generated_at,
        })))
      }
    }
  })

  const start = Date.now()
  const result = await runReportingAgent({
    stepId: step.id,
    columns,
    rows: combined,
    filename,
  })
  const duration = Date.now() - start
  const summary = `report rows=${combined.length} columns=${columns.length} durationMs=${duration}`
  return {
    full: result,
    snippet: {
      artifactId: result.artifactId,
      filename: result.filename,
      rowCount: result.rowCount,
      previewColumns: columns.slice(0, 10),
    },
    summary,
    artifacts: [result.artifactId],
  }
}

/* ---------------------------------- *
 * Main Execution
 * ---------------------------------- */

export async function runPlanExecution(planId: string, options: OrchestratorRunOptions = {}) {
  ensureNotAborted(options.signal)
  const stored = getPlan(planId)
  if (!stored) {
    throw new Error(`Plan "${planId}" not found`)
  }

  const planStart = Date.now()

  emit(options, {
    type: 'plan_started',
    planId,
    objective: stored.objective,
  })

  let successCount = 0
  let failCount = 0

  for (const step of stored.steps) {
    ensureNotAborted(options.signal)

    emit(options, {
      type: 'step_started',
      planId,
      stepId: step.id,
      kind: step.kind,
      title: step.title,
    })
    setStepStatus(planId, step.id, StepStatus.RUNNING)

    try {
      let execResult:
        | Awaited<ReturnType<typeof executeQueryData>>
        | Awaited<ReturnType<typeof executeEnrichProfile>>
        | Awaited<ReturnType<typeof executeLinkedInResearch>>
        | Awaited<ReturnType<typeof executeGenerateOutreach>>
        | Awaited<ReturnType<typeof executeReport>>

      const ctx: StepExecutionContext = {
        plan: stored,
        options,
      }

      switch (step.kind) {
        case StepKind.QUERY_DATA:
          execResult = await executeQueryData(step, ctx, planId)
          break
        case StepKind.ENRICH_PROFILE:
          execResult = await executeEnrichProfile(step, ctx, planId)
          break
        case StepKind.LINKEDIN_RESEARCH:
          execResult = await executeLinkedInResearch(step, ctx, planId)
          break
        case StepKind.GENERATE_OUTREACH:
          execResult = await executeGenerateOutreach(step, ctx, planId)
          break
        case StepKind.REPORT:
          execResult = await executeReport(step, ctx, planId)
          break
      }

      // Persist full output (could be large; in future we might store only hashed pointer)
      recordStepOutput(planId, step.id, execResult.full)

      setStepStatus(planId, step.id, StepStatus.SUCCESS, {
        outputSummary: execResult.summary,
        producedArtifactIds: execResult.artifacts.length ? execResult.artifacts : undefined,
        resultSnippet: execResult.snippet,
      })
      successCount++

      emit(options, {
        type: 'step_result',
        planId,
        stepId: step.id,
        kind: step.kind,
        status: StepStatus.SUCCESS,
        resultSnippet: execResult.snippet,
        outputSummary: execResult.summary,
      })

      for (const artId of execResult.artifacts) {
        emit(options, {
          type: 'artifact_ready',
          planId,
            stepId: step.id,
            artifactId: artId,
            filename: (execResult.full as any).filename || 'artifact',
        })
      }
    } catch (err: any) {
      failCount++
      const message = err?.message || 'Unknown step error'
      setStepStatus(planId, step.id, StepStatus.ERROR, {
        error: message,
      })
      emit(options, {
        type: 'step_result',
        planId,
        stepId: step.id,
        kind: step.kind,
        status: StepStatus.ERROR,
        error: message,
      })
      // For Phase 2 we continue after an error? Decision: STOP on first error to simplify user mental model.
      emit(options, {
        type: 'plan_error',
        planId,
        error: `Execution halted due to step "${step.id}" failure: ${message}`,
      })
      const duration = Date.now() - planStart
      emit(options, {
        type: 'plan_completed',
        planId,
        finalStatus: 'SUCCESS', // partial success classification omitted; we may revise
        totalSteps: stored.steps.length,
        succeeded: successCount,
        failed: failCount,
        durationMs: duration,
      })
      return sanitizePlanForClient(getPlan(planId)!)
    }
  }

  const duration = Date.now() - planStart
  emit(options, {
    type: 'plan_completed',
    planId,
    finalStatus: 'SUCCESS',
    totalSteps: stored.steps.length,
    succeeded: successCount,
    failed: failCount,
    durationMs: duration,
  })

  return sanitizePlanForClient(getPlan(planId)!)
}