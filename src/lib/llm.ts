/**
 * LLM Wrapper
 *
 * Spec constraints:
 *  - Local OpenAI-compatible endpoint at http://localhost:4141
 *  - Model: gpt-4.1 (string provided by local server)
 *  - No native tool/function calling support (model returns pure text)
 *  - We must implement guardrails + JSON extraction manually for structured outputs
 *  - Streaming (SSE from orchestrator layer) will be implemented elsewhere; here we support
 *    both non-stream and a simple callback-based stream consumption for incremental tokens.
 *
 * Responsibilities:
 *  - Provide a minimal abstraction for sending chat completion requests
 *  - Provide a helper to coerce / extract a JSON object (e.g., for plan generation)
 *  - Provide simple retry + timeout logic
 *  - Support debug logging (AGENT_DEBUG=1)
 *
 * Non-Responsibilities:
 *  - Higher-level planning (done in planner module)
 *  - Tool routing (model cannot do tool calls directly per spec)
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequestOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  /**
   * Abort or timeout control
   */
  timeoutMs?: number
  /**
   * Retry count for transient failures (5xx / network)
   */
  retries?: number
  /**
   * Whether to request streaming (if server supports SSE / chunked tokens)
   */
  stream?: boolean
  /**
   * Callback per token chunk when streaming = true
   */
  onToken?: (token: string) => void
  /**
   * Debug tag to correlate logs
   */
  tag?: string
}

export interface ChatCompletionResult {
  raw: any
  text: string
  finish_reason?: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export class LLMError extends Error {
  code:
    | 'TIMEOUT'
    | 'NETWORK'
    | 'BAD_STATUS'
    | 'INVALID_RESPONSE'
    | 'STREAM_ERROR'
    | 'JSON_EXTRACT'
    | 'UNKNOWN'

  status?: number
  causeError?: unknown

  constructor(
    code: LLMError['code'],
    message: string,
    opts?: { status?: number; cause?: unknown },
  ) {
    super(message)
    this.name = 'LLMError'
    this.code = code
    this.status = opts?.status
    this.causeError = opts?.cause
  }
}

const DEFAULT_BASE_URL = process.env.LLM_BASE_URL?.replace(/\/+$/, '') || 'http://localhost:4141'
const DEFAULT_MODEL = process.env.LLM_MODEL || 'gpt-4.1'
const DEFAULT_TIMEOUT = 25_000

function debugLog(...args: any[]) {
  if (process.env.AGENT_DEBUG === '1') {
    // eslint-disable-next-line no-console
    console.debug('[agent][llm]', ...args)
  }
}

interface InternalAttemptContext {
  attempt: number
  max: number
  tag?: string
}

/**
 * Perform a fetch with timeout
 */
async function timedFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new LLMError('TIMEOUT', `Request timed out after ${timeoutMs}ms`, { cause: err })
    }
    throw new LLMError('NETWORK', 'Network error during LLM request', { cause: err })
  } finally {
    clearTimeout(timer)
  }
}

function isRetryable(err: LLMError): boolean {
  return ['TIMEOUT', 'NETWORK', 'BAD_STATUS'].includes(err.code)
}

function parseNonStreamingResponse(json: any): ChatCompletionResult {
  // Accept either OpenAI-like or fallback
  if (!json) {
    throw new LLMError('INVALID_RESPONSE', 'Empty JSON response')
  }

  let text = ''
  let finish: string | undefined
  let usage: any = undefined

  if (Array.isArray(json.choices) && json.choices.length > 0) {
    const choice = json.choices[0]
    if (choice?.message?.content) {
      text = String(choice.message.content)
    } else if (choice?.text) {
      text = String(choice.text)
    }
    finish = choice.finish_reason
  } else if (typeof json.content === 'string') {
    text = json.content
  } else if (json.output) {
    text = String(json.output)
  }

  if (!text) {
    throw new LLMError('INVALID_RESPONSE', 'No text content found in response')
  }

  if (json.usage) {
    usage = json.usage
  }

  return {
    raw: json,
    text,
    finish_reason: finish,
    usage,
  }
}

/**
 * Primary chat completion function (non-stream or "manual" streaming).
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: ChatRequestOptions = {},
): Promise<ChatCompletionResult> {
  const {
    model = DEFAULT_MODEL,
    temperature = 0.2,
    maxTokens,
    timeoutMs = DEFAULT_TIMEOUT,
    retries = 1,
    stream = false,
    onToken,
    tag,
  } = options

  const body: any = {
    model,
    temperature,
    messages,
    stream,
  }
  if (maxTokens != null) body.max_tokens = maxTokens

  const url = `${DEFAULT_BASE_URL}/v1/chat/completions`

  let lastError: LLMError | null = null

  const maxAttempts = Math.max(1, retries + 1)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctx: InternalAttemptContext = { attempt, max: maxAttempts, tag }
    try {
      debugLog('request', {
        tag,
        attempt: `${attempt}/${maxAttempts}`,
        stream,
        model,
        msgCount: messages.length,
      })

      if (!stream) {
        const res = await timedFetch(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify(body),
          },
          timeoutMs,
        )

        if (!res.ok) {
          const txt = await res.text().catch(() => '')
          const err = new LLMError(
            'BAD_STATUS',
            `LLM status ${res.status} ${res.statusText}: ${txt.slice(0, 200)}`,
            { status: res.status },
          )
          if (isRetryable(err) && attempt < maxAttempts) {
            lastError = err
            debugLog('retry (non-stream)', { attempt: ctx.attempt, reason: err.code })
            continue
          }
          throw err
        }

        const json = await res.json().catch((e: any) => {
          throw new LLMError('INVALID_RESPONSE', 'Failed to parse JSON response', { cause: e })
        })
        const parsed = parseNonStreamingResponse(json)
        debugLog('success', { tag, chars: parsed.text.length })
        return parsed
      }

      // Streaming branch
      const res = await timedFetch(
        url,
        {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'text/event-stream',
            },
            body: JSON.stringify(body),
        },
        timeoutMs,
      )

      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => '')
        const err = new LLMError(
          'BAD_STATUS',
          `Streaming LLM status ${res.status} ${res.statusText}: ${txt.slice(0, 200)}`,
          { status: res.status },
        )
        if (isRetryable(err) && attempt < maxAttempts) {
          lastError = err
          debugLog('retry (stream)', { attempt: ctx.attempt, reason: err.code })
          continue
        }
        throw err
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let fullText = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })

        // Attempt to parse OpenAI-like stream lines starting with "data: "
        const lines = chunk.split(/\r?\n/).filter(Boolean)
        for (const line of lines) {
          if (line.startsWith('data:')) {
            const data = line.slice(5).trim()
            if (data === '[DONE]') {
              continue
            }
            try {
              const jsonLine = JSON.parse(data)
              // OpenAI style: { choices: [{ delta: { content: '...' } }] }
              const delta = jsonLine?.choices?.[0]?.delta?.content
              if (typeof delta === 'string' && delta.length > 0) {
                fullText += delta
                if (onToken) onToken(delta)
              } else if (typeof jsonLine.content === 'string') {
                // Alternative simplified streaming schema
                fullText += jsonLine.content
                if (onToken) onToken(jsonLine.content)
              }
            } catch {
              // Non-JSON or partial; treat raw line as token
              if (data && data !== '[DONE]') {
                fullText += data
                if (onToken) onToken(data)
              }
            }
          } else {
            // Non "data:" line fallback
            fullText += line
            if (onToken) onToken(line)
          }
        }
      }

      if (!fullText) {
        throw new LLMError('INVALID_RESPONSE', 'Empty streaming completion output')
      }

      debugLog('stream success', { tag, chars: fullText.length })

      return {
        raw: { streaming: true },
        text: fullText,
      }
    } catch (err: any) {
      let wrapped: LLMError
      if (err instanceof LLMError) {
        wrapped = err
      } else if (err?.name === 'AbortError') {
        wrapped = new LLMError('TIMEOUT', err.message || 'Abort/Timeout', { cause: err })
      } else {
        wrapped = new LLMError('UNKNOWN', err?.message || 'Unknown LLM error', { cause: err })
      }

      lastError = wrapped
      const retryable = isRetryable(wrapped)
      if (retryable && attempt < maxAttempts) {
        debugLog('retry', { attempt: ctx.attempt, reason: wrapped.code })
        continue
      }
      debugLog('failure', { attempt: ctx.attempt, code: wrapped.code, message: wrapped.message })
      throw wrapped
    }
  }

  throw lastError ?? new LLMError('UNKNOWN', 'Exhausted attempts without specific error')
}

/**
 * Extract a JSON object from a completion text.
 * It will try:
 *  1. Direct full string parse
 *  2. Locate first '{' and last '}' and parse substring
 *  3. Provide detailed error when failing
 */
export function extractJsonObject<T = any>(text: string, tag?: string): T {
  // Quick direct attempt
  try {
    return JSON.parse(text) as T
  } catch {
    // proceed
  }

  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first >= 0 && last > first) {
    const candidate = text.slice(first, last + 1)
    try {
      const parsed = JSON.parse(candidate)
      return parsed as T
    } catch (err: any) {
      debugLog('json-extract-candidate-failed', { tag, candidatePreview: candidate.slice(0, 150) })
      throw new LLMError('JSON_EXTRACT', 'Failed to parse JSON from candidate substring', {
        cause: err,
      })
    }
  }

  debugLog('json-extract-failed', { tag, preview: text.slice(0, 180) })
  throw new LLMError('JSON_EXTRACT', 'Could not locate JSON object in model output')
}

/**
 * High-level helper: request a JSON plan from the model with a strict instruction.
 * (Used by planner route)
 */
export async function generateJsonPlan(
  userPrompt: string,
  systemInstruction: string,
  options: Omit<ChatRequestOptions, 'stream' | 'onToken'> = {},
): Promise<{ rawText: string; json: any }> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: systemInstruction,
    },
    {
      role: 'user',
      content: userPrompt,
    },
  ]

  const result = await chatCompletion(messages, {
    ...options,
    stream: false,
    tag: options.tag || 'plan',
  })

  const json = extractJsonObject(result.text, options.tag || 'plan')
  return { rawText: result.text, json }
}