/**
 * LinkedIn Research Client
 * 
 * Provides a thin, typed wrapper around the LinkedIn summary API.
 * Endpoint: http://localhost:40209/summary?username=<name>&tags=<tags>
 * Returns: { username: string, tags: string, summary: string }
 *
 * Responsibilities:
 *  - Provide a thin, typed wrapper around the LinkedIn summary API
 *  - Enforce a timeout (default 10s) and a single retry on network / 5xx errors
 *  - Normalize errors into LinkedInError with a clear code
 *  - Optional debug logging when AGENT_DEBUG=1
 *
 * Non-responsibilities:
 *  - Caching (explicitly disabled per spec)
 *  - Rate limiting (none required)
 *  - Circuit breaking (not required for hackathon scope)
 */

export interface ProfileIdentificationResult {
  name: string
  handle: string
  status: string
  stats: {
    posts: number
    following: number
    followers: number
  }
  bio: string
  labels: string[]
  data: string
}

export interface LinkedInSummaryResult {
  username: string
  real_name?: string
  tags: string
  summary: string
  bio?: string
  labels?: string[]
  /**
   * Timestamp (ms) when fetched (added locally for downstream correlation / ordering)
   */
  fetched_at: number
}

export interface LinkedInClientOptions {
  baseUrl?: string
  timeoutMs?: number
  retry?: boolean
}

export type LinkedInErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'BAD_STATUS'
  | 'INVALID_JSON'
  | 'INVALID_SHAPE'
  | 'UNKNOWN'

export class LinkedInError extends Error {
  public code: LinkedInErrorCode
  public status?: number
  public causeError?: unknown

  constructor(code: LinkedInErrorCode, message: string, opts?: { status?: number; cause?: unknown }) {
    super(message)
    this.name = 'LinkedInError'
    this.code = code
    this.status = opts?.status
    this.causeError = opts?.cause
  }
}

const DEFAULT_BASE = 'https://7005d0347fac.ngrok-free.app'
const DEFAULT_LINKEDIN_BASE = 'http://localhost:40209'
const DEFAULT_TIMEOUT = 120000
const PROFILE_IDENTIFICATION_ENDPOINT = '/get-user-info'

interface InternalFetchAttemptParams {
  url: string
  timeoutMs: number
  attempt: number
  maxAttempts: number
  method?: string
  body?: string
  headers?: Record<string, string>
}

/**
 * Perform a single fetch attempt with timeout using AbortController.
 */
async function fetchWithTimeout(params: InternalFetchAttemptParams): Promise<Response> {
  const { url, timeoutMs, method = 'GET', body, headers = {} } = params
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  // Respect caller-provided Accept header (case-insensitive).
  // If caller did not provide any Accept header, default to application/json.
  const hasAccept = Object.keys(headers).some(k => k.toLowerCase() === 'accept')
  const mergedHeaders: Record<string, string> = {
    ...(hasAccept ? {} : { Accept: 'application/json' }),
    ...headers,
  }

  try {
    return await fetch(url, {
      method,
      signal: controller.signal,
      headers: mergedHeaders,
      body,
      cache: 'no-store',
    })
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new LinkedInError('TIMEOUT', `LinkedIn request timed out after ${timeoutMs}ms`, { cause: err })
    }
    throw new LinkedInError('NETWORK', 'Network error during LinkedIn fetch', { cause: err })
  } finally {
    clearTimeout(timer)
  }
}

function debugLog(...args: any[]) {
  if (process.env.AGENT_DEBUG === '1') {
    // eslint-disable-next-line no-console
    console.debug('[agent][linkedin]', ...args)
  }
}

/**
 * Extract real name from Instagram profile by fetching the page and parsing og:title.
 * This replaces the ProfileIdentification API call with a simpler approach.
 */
async function extractRealNameFromInstagram(
  instagramUsername: string,
  opts: LinkedInClientOptions = {},
): Promise<{ name: string; handle: string }> {
  if (!instagramUsername || typeof instagramUsername !== 'string') {
    throw new LinkedInError('INVALID_SHAPE', 'Instagram username must be a non-empty string')
  }

  // Clean username (remove @ if present)
  const cleanUsername = instagramUsername.replace(/^@/, '')
  const instagramUrl = `https://www.instagram.com/${cleanUsername}/`
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT
  const maxAttempts = opts.retry === false ? 1 : 2

  let lastError: LinkedInError | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptLabel = `${attempt}/${maxAttempts}`
    try {
      console.log(`[DEBUG] Fetching Instagram profile`, { instagramUsername: cleanUsername, url: instagramUrl, attempt: attemptLabel })

      const res = await fetchWithTimeout({
        url: instagramUrl,
        timeoutMs,
        attempt,
        maxAttempts,
        headers: {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-GB,en;q=0.9",
    "dpr": "1.5",
    "priority": "u=0, i",
    "sec-ch-prefers-color-scheme": "dark",
    "sec-ch-ua": "\"Chromium\";v=\"140\", \"Not=A?Brand\";v=\"24\", \"Microsoft Edge\";v=\"140\"",
    "sec-ch-ua-full-version-list": "\"Chromium\";v=\"140.0.7339.81\", \"Not=A?Brand\";v=\"24.0.0.0\", \"Microsoft Edge\";v=\"140.0.3485.54\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-model": "\"\"",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-ch-ua-platform-version": "\"19.0.0\"",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "viewport-width": "1168",
    "cookie": "csrftoken=T1d_-B3LnpLIIZvVmY30jy; datr=YcDGaPYlRfbzbrlJb1S-IY9V; ig_did=774A9ED1-941A-4556-BACC-D214835F992B; ig_nrcb=1; dpr=1.5; mid=aMbAYgALAAElJlptWN6-qHsoD5uP; ps_l=1; ps_n=1; wd=1168x941"
  },
      })
      
      console.log(`[DEBUG] Instagram page response status: ${res.status}`)

      if (!res.ok) {
        if (res.status >= 500 && res.status < 600 && attempt < maxAttempts) {
          lastError = new LinkedInError('BAD_STATUS', `Server error status=${res.status}`, { status: res.status })
          debugLog(`Retrying after server error`, { status: res.status, attempt: attemptLabel })
          continue
        }
        throw new LinkedInError('BAD_STATUS', `Instagram page returned status ${res.status}`, { status: res.status })
      }

      let html: string
      try {
        html = await res.text()
      } catch (err: any) {
        throw new LinkedInError('INVALID_JSON', 'Failed to read HTML content', { cause: err })
      }

      // Extract og:title from HTML
      const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
      if (!ogTitleMatch) {
        throw new LinkedInError('INVALID_SHAPE', 'Could not find og:title in Instagram page')
      }

      const ogTitle = ogTitleMatch[1]
      console.log(`[DEBUG] Found og:title: ${ogTitle}`)

      // Decode HTML entities and extract real name by splitting on '(' and taking first segment
      const decodedTitle = ogTitle
        .replace(/&#064;/g, '@')
        .replace(/&#x2022;/g, '•')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
      
      const realName = decodedTitle.split('(')[0].trim()
      
      if (!realName) {
        throw new LinkedInError('INVALID_SHAPE', 'Could not extract real name from og:title')
      }

      const result = {
        name: realName,
        handle: cleanUsername,
      }

      debugLog(`Instagram name extraction success`, { instagramUsername: cleanUsername, realName: result.name })
      return result
    } catch (err: any) {
      if (!(err instanceof LinkedInError)) {
        lastError = new LinkedInError('UNKNOWN', 'Unknown Instagram extraction error', { cause: err })
      } else {
        lastError = err
      }

      console.log(`[DEBUG] Instagram extraction error:`, {
        code: lastError.code,
        message: lastError.message,
        instagramUsername: cleanUsername,
        attempt: attemptLabel,
        cause: err?.message
      })

      const retryable = ['NETWORK', 'TIMEOUT'].includes(lastError.code)
      if (retryable && attempt < maxAttempts) {
        console.log(`[DEBUG] Retrying Instagram extraction`, { code: lastError.code, attempt: attemptLabel })
        continue
      }
      console.log(`[DEBUG] Instagram extraction failed permanently`, { code: lastError.code, message: lastError.message })
      throw lastError
    }
  }

  throw lastError ?? new LinkedInError('UNKNOWN', 'Exhausted attempts with unknown error')
}

/**
 * Fetch LinkedIn summary using real name from ProfileIdentification.
 * This is step 2 of the LinkedIn research workflow.
 */
async function fetchLinkedInSummaryByRealName(
  realName: string,
  tags?: string | string[],
  linkedinBaseUrl?: string,
  opts: LinkedInClientOptions = {},
): Promise<{ username: string; tags: string; summary: string }> {
  if (!realName || typeof realName !== 'string') {
    throw new LinkedInError('INVALID_SHAPE', 'Real name must be a non-empty string')
  }

  const baseUrl = (linkedinBaseUrl || DEFAULT_LINKEDIN_BASE).replace(/\/+$/, '')
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT
  const maxAttempts = 1

  // Build URL with query parameters
  const url = new URL(`${baseUrl}/summary`)
  url.searchParams.set('username', realName) // Use real name for LinkedIn API
  
  if (tags) {
    const tagsString = Array.isArray(tags) ? tags.join(',') : tags
    if (tagsString.trim()) {
      url.searchParams.set('tags', tagsString.trim())
    }
  }

  let lastError: LinkedInError | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptLabel = `${attempt}/${maxAttempts}`
    try {
      console.log(`[DEBUG] Attempting LinkedIn summary fetch with real name`, { realName, tags, url: url.toString(), attempt: attemptLabel })

      const res = await fetchWithTimeout({
        url: url.toString(),
        timeoutMs,
        attempt,
        maxAttempts,
      })
      
      console.log(`[DEBUG] LinkedIn summary API response status: ${res.status}`)

      if (!res.ok) {
        if (res.status >= 500 && res.status < 600 && attempt < maxAttempts) {
          lastError = new LinkedInError('BAD_STATUS', `Server error status=${res.status}`, { status: res.status })
          debugLog(`Retrying after server error`, { status: res.status, attempt: attemptLabel })
          continue
        }
        throw new LinkedInError('BAD_STATUS', `Unexpected status ${res.status}`, { status: res.status })
      }

      let json: any
      try {
        json = await res.json()
      } catch (err: any) {
        throw new LinkedInError('INVALID_JSON', 'Failed to parse JSON', { cause: err })
      }

      if (!json || typeof json !== 'object') {
        throw new LinkedInError('INVALID_SHAPE', 'Response is not an object')
      }
      
      // Validate expected LinkedIn API response format
      if (typeof json.username !== 'string' || typeof json.summary !== 'string') {
        throw new LinkedInError(
          'INVALID_SHAPE',
          'LinkedIn API response missing required fields { username: string, summary: string }',
        )
      }

      const result = {
        username: json.username,
        tags: json.tags || (tags ? (Array.isArray(tags) ? tags.join(',') : tags) : ''),
        summary: json.summary,
      }

      debugLog(`LinkedIn summary success`, { realName, summaryLength: result.summary.length, tags: result.tags })
      return result
    } catch (err: any) {
      if (!(err instanceof LinkedInError)) {
        lastError = new LinkedInError('UNKNOWN', 'Unknown LinkedIn error', { cause: err })
      } else {
        lastError = err
      }

      console.log(`[DEBUG] LinkedIn summary fetch error:`, {
        code: lastError.code,
        message: lastError.message,
        realName,
        attempt: attemptLabel,
        cause: err?.message
      })

      const retryable = ['NETWORK', 'TIMEOUT'].includes(lastError.code)
      if (retryable && attempt < maxAttempts) {
        console.log(`[DEBUG] Retrying LinkedIn summary fetch`, { code: lastError.code, attempt: attemptLabel })
        continue
      }
      console.log(`[DEBUG] LinkedIn summary fetch failed permanently`, { code: lastError.code, message: lastError.message })
      throw lastError
    }
  }

  throw lastError ?? new LinkedInError('UNKNOWN', 'Exhausted attempts with unknown error')
}

/**
 * Complete LinkedIn research workflow:
 * 1. Extract real name from Instagram og:title using direct web scraping
 * 2. Use real name to fetch LinkedIn summary
 *
 * This replaces the ProfileIdentification API approach with direct Instagram scraping.
 */
export async function fetchLinkedInSummary(
  instagramUsername: string,
  tags?: string | string[],
  opts: LinkedInClientOptions = {},
): Promise<LinkedInSummaryResult> {
  if (!instagramUsername || typeof instagramUsername !== 'string') {
    throw new LinkedInError('INVALID_SHAPE', 'Instagram username must be a non-empty string')
  }

  console.log(`[DEBUG] Starting LinkedIn research workflow for Instagram user: ${instagramUsername}`)

  // Step 1: Extract real name from Instagram og:title
  const nameData = await extractRealNameFromInstagram(instagramUsername, opts)
  console.log(`[DEBUG] Instagram name extraction complete`, {
    instagramUsername,
    realName: nameData.name
  })

  // Step 2: Use real name to fetch LinkedIn summary
  const linkedinData = await fetchLinkedInSummaryByRealName(
    nameData.name,
    tags,
    DEFAULT_LINKEDIN_BASE,
    opts
  )
  console.log(`[DEBUG] LinkedIn summary complete`, {
    realName: nameData.name,
    summaryLength: linkedinData.summary.length
  })

  // Combine results into enriched response
  const result: LinkedInSummaryResult = {
    username: instagramUsername, // Keep original Instagram username
    real_name: nameData.name, // Add real name extracted from Instagram
    tags: linkedinData.tags,
    summary: linkedinData.summary,
    bio: '', // No bio from this approach
    labels: [], // No labels from this approach
    fetched_at: Date.now(),
  }

  debugLog(`Complete LinkedIn research workflow success`, {
    instagramUsername,
    realName: result.real_name,
    summaryLength: result.summary.length
  })
  
  return result
}

/**
 * Bulk helper: sequentially fetch LinkedIn summaries for multiple usernames.
 * Current spec: no concurrency/limit enforcement needed, but structure allows future extension.
 */
export async function fetchManyLinkedInSummaries(
  usernames: string[], 
  tags?: string | string[], 
  opts?: LinkedInClientOptions
): Promise<LinkedInSummaryResult[]> {
  const results: LinkedInSummaryResult[] = []
  for (const u of usernames) {
    try {
      const r = await fetchLinkedInSummary(u, tags, opts)
      results.push(r)
    } catch (err) {
      debugLog(`Skipping LinkedIn summary for username due to error`, { username: u, error: (err as any)?.message })
      // Decide policy: swallow errors for individual summaries to allow partial success
      // Could push a placeholder entry or annotate an error array if desired.
    }
  }
  return results
}

/**
 * Helper to normalize tags from various sources
 */
export function normalizeTags(tags?: string | string[] | null): string {
  if (!tags) return ''
  if (Array.isArray(tags)) {
    return tags.filter(t => t && typeof t === 'string').join(',')
  }
  return String(tags).trim()
}