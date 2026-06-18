/**
 * Enrichment Client
 * Phase 2 Spec: no caching, no auth, no retention.
 * Endpoint: http://localhost:12728/enrich-profile/<username>
 * Returns: { username: string, raw_text: string }
 *
 * Responsibilities:
 *  - Provide a thin, typed wrapper around the mock enrichment API.
 *  - Enforce a timeout (default 5s) and a single retry on network / 5xx errors.
 *  - Normalize errors into EnrichmentError with a clear code.
 *  - Optional debug logging when AGENT_DEBUG=1.
 *
 * Non-responsibilities:
 *  - Caching (explicitly disabled per selected spec)
 *  - Rate limiting (none required)
 *  - Circuit breaking (not required for hackathon scope)
 */

export interface EnrichmentResult {
  username: string
  raw_text: string
  /**
   * Timestamp (ms) when fetched (added locally for downstream correlation / ordering)
   */
  fetched_at: number
}

export interface EnrichmentClientOptions {
  baseUrl?: string
  timeoutMs?: number
  retry?: boolean
}

export type EnrichmentErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'BAD_STATUS'
  | 'INVALID_JSON'
  | 'INVALID_SHAPE'
  | 'UNKNOWN'

export class EnrichmentError extends Error {
  public code: EnrichmentErrorCode
  public status?: number
  public causeError?: unknown

  constructor(code: EnrichmentErrorCode, message: string, opts?: { status?: number; cause?: unknown }) {
    super(message)
    this.name = 'EnrichmentError'
    this.code = code
    this.status = opts?.status
    this.causeError = opts?.cause
  }
}

const DEFAULT_BASE = 'http://localhost:12728'
const DEFAULT_TIMEOUT = 5000

interface InternalFetchAttemptParams {
  url: string
  timeoutMs: number
  attempt: number
  maxAttempts: number
}

/**
 * Perform a single fetch attempt with timeout using AbortController.
 */
async function fetchWithTimeout(params: InternalFetchAttemptParams): Promise<Response> {
  const { url, timeoutMs } = params
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store',
    })
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new EnrichmentError('TIMEOUT', `Enrichment request timed out after ${timeoutMs}ms`, { cause: err })
    }
    throw new EnrichmentError('NETWORK', 'Network error during enrichment fetch', { cause: err })
  } finally {
    clearTimeout(timer)
  }
}

function debugLog(...args: any[]) {
  if (process.env.AGENT_DEBUG === '1') {
    // eslint-disable-next-line no-console
    console.debug('[agent][enrichment]', ...args)
  }
}

/**
 * Fetch enrichment data for a single username.
 * Retries once (total attempts = 2) on:
 *   - NETWORK
 *   - TIMEOUT
 *   - 5xx status
 */
export async function fetchEnrichment(
  username: string,
  opts: EnrichmentClientOptions = {},
): Promise<EnrichmentResult> {
  if (!username || typeof username !== 'string') {
    throw new EnrichmentError('INVALID_SHAPE', 'Username must be a non-empty string')
  }

  const baseUrl = (opts.baseUrl || DEFAULT_BASE).replace(/\/+$/, '')
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT
  const maxAttempts = opts.retry === false ? 1 : 2

  const endpoint = `${baseUrl}/enrich-profile/${encodeURIComponent(username)}`

  let lastError: EnrichmentError | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptLabel = `${attempt}/${maxAttempts}`
    try {
      debugLog(`Fetching enrichment`, { username, endpoint, attempt: attemptLabel })

      const res = await fetchWithTimeout({
        url: endpoint,
        timeoutMs,
        attempt,
        maxAttempts,
      })

      if (!res.ok) {
        // Retry logic: only retry on 5xx for status-based errors
        if (res.status >= 500 && res.status < 600 && attempt < maxAttempts) {
          lastError = new EnrichmentError('BAD_STATUS', `Server error status=${res.status}`, { status: res.status })
          debugLog(`Retrying after server error`, { status: res.status, attempt: attemptLabel })
          continue
        }
        throw new EnrichmentError('BAD_STATUS', `Unexpected status ${res.status}`, { status: res.status })
      }

      let json: any
      try {
        json = await res.json()
      } catch (err: any) {
        throw new EnrichmentError('INVALID_JSON', 'Failed to parse JSON', { cause: err })
      }

      if (!json || typeof json !== 'object') {
        throw new EnrichmentError('INVALID_SHAPE', 'Response is not an object')
      }
      if (typeof json.username !== 'string' || typeof json.raw_text !== 'string') {
        throw new EnrichmentError(
          'INVALID_SHAPE',
          'Response missing required fields { username: string, raw_text: string }',
        )
      }

      const result: EnrichmentResult = {
        username: json.username,
        raw_text: json.raw_text,
        fetched_at: Date.now(),
      }

      debugLog(`Enrichment success`, { username, length: result.raw_text.length })
      return result
    } catch (err: any) {
      if (!(err instanceof EnrichmentError)) {
        lastError = new EnrichmentError('UNKNOWN', 'Unknown enrichment error', { cause: err })
      } else {
        lastError = err
      }

      // Retry only for specific transient codes
      const retryable = ['NETWORK', 'TIMEOUT'].includes(lastError.code)
      if (retryable && attempt < maxAttempts) {
        debugLog(`Retryable error encountered; will retry`, { code: lastError.code, attempt: attemptLabel })
        continue
      }
      // Non-retryable or last attempt
      debugLog(`Enrichment failed`, { code: lastError.code, message: lastError.message })
      throw lastError
    }
  }

  // Should never reach here because loop either returns or throws
  throw lastError ?? new EnrichmentError('UNKNOWN', 'Exhausted attempts with unknown error')
}

/**
 * Bulk helper: sequentially (or future concurrency) enrich multiple usernames.
 * Current spec: no concurrency/limit enforcement needed, but structure allows future extension.
 */
export async function enrichMany(usernames: string[], opts?: EnrichmentClientOptions): Promise<EnrichmentResult[]> {
  const results: EnrichmentResult[] = []
  for (const u of usernames) {
    try {
      const r = await fetchEnrichment(u, opts)
      results.push(r)
    } catch (err) {
      debugLog(`Skipping enrichment for username due to error`, { username: u, error: (err as any)?.message })
      // Decide policy: swallow errors for individual enrichments to allow partial success
      // Could push a placeholder entry or annotate an error array if desired.
    }
  }
  return results
}