/**
 * enrich_profile Tool + Profile Enrichment Agent
 *
 * PURPOSE:
 *   Wrap the lower-level enrichment client (fetchEnrichment / enrichMany) with:
 *     - Batched execution over a list of usernames
 *     - Structured result & lightweight error capture
 *     - Normalized tool-level error codes
 *
 * SPEC DECISIONS (Phase 2):
 *   - No caching
 *   - No concurrency limit (sequential for now; easy to add later)
 *   - Partial failures do NOT fail the entire step; we collect errors[]
 *   - Skips duplicates (first occurrence wins)
 *
 * INPUT (to agent runner):
 *   {
 *     stepId: string
 *     usernames: string[]            // required non-empty
 *     maxProfiles?: number           // optional safety clamp
 *     baseUrl?: string               // override enrichment endpoint
 *     timeoutMs?: number
 *   }
 *
 * OUTPUT (agent):
 *   {
 *     stepId: string
 *     enriched: { username, raw_text, fetched_at }[]
 *     errors: { username: string, code: string, message: string }[]
 *     meta: {
 *       requested: number
 *       attempted: number
 *       succeeded: number
 *       failed: number
 *       truncated: boolean
 *       maxProfiles?: number
 *       durationMs: number
 *     }
 *   }
 */

import {
  fetchEnrichment,
  EnrichmentResult,
  EnrichmentError,
} from '../../enrichment'

/* ---------------------------------- *
 * Tool Error Wrapper
 * ---------------------------------- */

export type EnrichToolErrorCode =
  | 'NO_USERNAMES'
  | 'INVALID_PARAM'
  | 'INTERNAL'

export class EnrichToolError extends Error {
  code: EnrichToolErrorCode
  constructor(code: EnrichToolErrorCode, message: string) {
    super(message)
    this.name = 'EnrichToolError'
    this.code = code
  }
}

/* ---------------------------------- *
 * Public Tool Parameters / Result
 * ---------------------------------- */

export interface EnrichProfileToolParams {
  usernames: string[]
  maxProfiles?: number
  baseUrl?: string
  timeoutMs?: number
}

export interface EnrichProfileToolResult {
  enriched: EnrichmentResult[]
  errors: {
    username: string
    code: string
    message: string
  }[]
  meta: {
    requested: number
    attempted: number
    succeeded: number
    failed: number
    truncated: boolean
    maxProfiles?: number
    durationMs: number
  }
}

/**
 * Core tool function (not tied to step orchestration).
 */
export async function enrichProfileTool(params: EnrichProfileToolParams): Promise<EnrichProfileToolResult> {
  if (!params || !Array.isArray(params.usernames)) {
    throw new EnrichToolError('INVALID_PARAM', 'params.usernames must be an array')
  }
  const unique = Array.from(new Set(params.usernames.map(u => (u || '').trim()).filter(Boolean)))
  if (unique.length === 0) {
    throw new EnrichToolError('NO_USERNAMES', 'No valid usernames provided')
  }

  let working = unique
  let truncated = false
  if (typeof params.maxProfiles === 'number' && params.maxProfiles > 0 && working.length > params.maxProfiles) {
    working = working.slice(0, params.maxProfiles)
    truncated = true
  }

  const start = Date.now()
  const enriched: EnrichmentResult[] = []
  const errors: { username: string; code: string; message: string }[] = []

  for (const username of working) {
    try {
      const res = await fetchEnrichment(username, {
        baseUrl: params.baseUrl,
        timeoutMs: params.timeoutMs,
      })
      enriched.push(res)
    } catch (err: any) {
      if (err instanceof EnrichmentError) {
        errors.push({
          username,
            code: err.code,
            message: err.message,
        })
      } else {
        errors.push({
          username,
          code: 'UNKNOWN',
          message: (err as Error)?.message || 'Unknown error',
        })
      }
    }
  }

  const end = Date.now()
  return {
    enriched,
    errors,
    meta: {
      requested: unique.length,
      attempted: working.length,
      succeeded: enriched.length,
      failed: errors.length,
      truncated,
      maxProfiles: params.maxProfiles,
      durationMs: end - start,
    },
  }
}

/* ---------------------------------- *
 * Agent Runner Wrapper
 * ---------------------------------- */

export interface ProfileEnrichmentAgentInput extends EnrichProfileToolParams {
  stepId: string
  usernameField?: string  // (for future dynamic extraction)
}

export interface ProfileEnrichmentAgentOutput extends EnrichProfileToolResult {
  stepId: string
}

function debugLog(...args: any[]) {
  if (process.env.AGENT_DEBUG === '1') {
    // eslint-disable-next-line no-console
    console.log('[AGENT_ENRICH]', ...args)
  }
}

export async function runProfileEnrichmentAgent(input: ProfileEnrichmentAgentInput): Promise<ProfileEnrichmentAgentOutput> {
  const { stepId, ...toolParams } = input
  debugLog('start', { stepId, usernames: toolParams.usernames.length })
  const result = await enrichProfileTool(toolParams)
  debugLog('done', { stepId, succeeded: result.enriched.length, failed: result.errors.length })
  return {
    stepId,
    ...result,
  }
}