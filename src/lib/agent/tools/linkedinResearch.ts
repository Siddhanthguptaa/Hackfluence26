/**
 * linkedin_research Tool + LinkedIn Research Agent
 *
 * PURPOSE:
 *   Wrap the lower-level LinkedIn client (fetchLinkedInSummary / fetchManyLinkedInSummaries) with:
 *     - Batched execution over a list of usernames
 *     - Structured result & lightweight error capture
 *     - Normalized tool-level error codes
 *     - Tag integration from database or manual specification
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
 *     tags?: string | string[]       // optional tags for LinkedIn API
 *     maxProfiles?: number           // optional safety clamp
 *     baseUrl?: string               // override LinkedIn endpoint
 *     timeoutMs?: number
 *   }
 *
 * OUTPUT (agent):
 *   {
 *     stepId: string
 *     summaries: { username, tags, summary, fetched_at }[]
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
  fetchLinkedInSummary,
  LinkedInSummaryResult,
  LinkedInError,
  normalizeTags,
} from '../../linkedin'

/* ---------------------------------- *
 * Tool Error Wrapper
 * ---------------------------------- */

export type LinkedInToolErrorCode =
  | 'NO_USERNAMES'
  | 'INVALID_PARAM'
  | 'INTERNAL'

export class LinkedInToolError extends Error {
  code: LinkedInToolErrorCode
  constructor(code: LinkedInToolErrorCode, message: string) {
    super(message)
    this.name = 'LinkedInToolError'
    this.code = code
  }
}

/* ---------------------------------- *
 * Public Tool Parameters / Result
 * ---------------------------------- */

export interface LinkedInResearchToolParams {
  usernames: string[]
  tags?: string | string[]
  maxProfiles?: number
  baseUrl?: string
  timeoutMs?: number
}

export interface LinkedInResearchToolResult {
  summaries: LinkedInSummaryResult[]
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
export async function linkedinResearchTool(params: LinkedInResearchToolParams): Promise<LinkedInResearchToolResult> {
  if (!params || !Array.isArray(params.usernames)) {
    throw new LinkedInToolError('INVALID_PARAM', 'params.usernames must be an array')
  }
  const unique = Array.from(new Set(params.usernames.map(u => (u || '').trim()).filter(Boolean)))
  if (unique.length === 0) {
    throw new LinkedInToolError('NO_USERNAMES', 'No valid usernames provided')
  }

  let working = unique
  let truncated = false
  if (typeof params.maxProfiles === 'number' && params.maxProfiles > 0 && working.length > params.maxProfiles) {
    working = working.slice(0, params.maxProfiles)
    truncated = true
  }

  // Normalize usernames for Instagram-based real name extraction:
  //  - strip leading '@'
  //  - remove surrounding whitespace (already trimmed above)
  //  - de-duplicate again after normalization
  const cleaned = Array.from(
    new Set(
      working
        .map(u => u.replace(/^@/, ''))
        .filter(Boolean),
    ),
  )

  const normalizedTags = normalizeTags(params.tags)
  const start = Date.now()
  const summaries: LinkedInSummaryResult[] = []
  const errors: { username: string; code: string; message: string }[] = []

  for (const rawUsername of cleaned) {
    try {
      const res = await fetchLinkedInSummary(rawUsername, normalizedTags, {
        baseUrl: params.baseUrl,
        timeoutMs: params.timeoutMs,
      })
      summaries.push(res)
    } catch (err: any) {
      if (err instanceof LinkedInError) {
        errors.push({
          username: rawUsername,
          code: err.code,
          message: err.message,
        })
      } else {
        errors.push({
          username: rawUsername,
          code: 'UNKNOWN',
          message: (err as Error)?.message || 'Unknown error',
        })
      }
    }
  }

  const end = Date.now()
  return {
    summaries,
    errors,
    meta: {
      requested: unique.length,
      attempted: cleaned.length,
      succeeded: summaries.length,
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

export interface LinkedInResearchAgentInput extends LinkedInResearchToolParams {
  stepId: string
  usernameField?: string  // (for future dynamic extraction)
}

export interface LinkedInResearchAgentOutput extends LinkedInResearchToolResult {
  stepId: string
}

function debugLog(...args: any[]) {
  if (process.env.AGENT_DEBUG === '1') {
    // eslint-disable-next-line no-console
    console.log('[AGENT_LINKEDIN]', ...args)
  }
}

export async function runLinkedInResearchAgent(input: LinkedInResearchAgentInput): Promise<LinkedInResearchAgentOutput> {
  const { stepId, ...toolParams } = input
  debugLog('start', { stepId, usernames: toolParams.usernames.length, tags: toolParams.tags })
  const result = await linkedinResearchTool(toolParams)
  debugLog('done', { stepId, succeeded: result.summaries.length, failed: result.errors.length })
  return {
    stepId,
    ...result,
  }
}