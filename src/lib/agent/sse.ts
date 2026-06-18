/**
 * SSE Utility
 *
 * Provides a small abstraction for creating a text/event-stream Response
 * compatible with Next.js App Router route handlers.
 *
 * Features:
 *  - writeEvent(event, data) JSON-serializes data
 *  - writeComment(message) for heartbeats / diagnostics
 *  - close() to finalize the stream
 *  - auto heartbeat interval (optional)
 *
 * Usage Example (in a Next.js route handler):
 *
 *   import { createSSEStream } from '@/lib/agent/sse'
 *
 *   export async function GET() {
 *     const { stream, writeEvent, close } = createSSEStream({ heartbeatMs: 15000 })
 *     queueMicrotask(() => {
 *       writeEvent('hello', { msg: 'world' })
 *     })
 *     return stream
 *   }
 *
 * NOTE:
 *  - Consumers must ensure no further writes after close().
 *  - Heartbeat comments are optional and can be disabled by setting heartbeatMs: 0.
 */

interface SSEOptions {
  /**
   * Heartbeat interval in ms. If 0 or undefined, no heartbeat comments are sent.
   */
  heartbeatMs?: number
  /**
   * Optional initial retry directive (milliseconds) for EventSource reconnect.
   * (If provided, first line will be: "retry: <ms>")
   */
  retryMs?: number
  /**
   * If true, will prefix a comment banner when stream starts (debug/dev)
   */
  bannerComment?: boolean
  /**
   * Called if a write fails (e.g., client disconnected)
   */
  onError?: (err: unknown) => void
}

export interface SSEController {
  /**
   * The Response object to return from the route handler.
   */
  stream: Response
  /**
   * Write a named event with an optional data payload (object/string/number/etc).
   * Data will be JSON stringified unless already a string and looks like raw text.
   */
  writeEvent: (event: string, data?: any) => void
  /**
   * Write an arbitrary comment line (prefixed with ':')
   */
  writeComment: (comment: string) => void
  /**
   * Close the stream (sends a final comment)
   */
  close: () => void
}

function nowIso() {
  return new Date().toISOString()
}

/**
 * Minimal heuristic to decide whether to JSON stringify.
 */
function toEventDataPayload(data: any): string {
  if (data === undefined) return ''
  if (typeof data === 'string') {
    // If it already looks like JSON (starts with { or [ or ") we still wrap it as is
    return data
  }
  try {
    return JSON.stringify(data)
  } catch {
    return String(data)
  }
}

export function createSSEStream(options: SSEOptions = {}): SSEController {
  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  let closed = false
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  async function writeRaw(line: string) {
    if (closed) return
    try {
      await writer.write(encoder.encode(line))
    } catch (err) {
      options.onError?.(err)
      // Assume client disconnected; attempt graceful close
      closed = true
      if (heartbeatTimer) clearInterval(heartbeatTimer)
      try {
        await writer.close()
      } catch {
        // ignore
      }
    }
  }

  function writeEvent(event: string, data?: any) {
    // SSE framing:
    // event: <name>\n
    // data: <payload>\n
    // \n
    const payload = toEventDataPayload(data)
    const lines = [`event: ${event}`, `data: ${payload}`, '', '']
    void writeRaw(lines.join('\n'))
  }

  function writeComment(comment: string) {
    void writeRaw(`: ${comment}\n`)
  }

  function close() {
    if (closed) return
    closed = true
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    writeComment('stream closing')
    // Use a more defensive approach to closing the writer
    try {
      void writer.close()
    } catch (err) {
      // Stream may already be closed - ignore error
      console.debug('[SSE] Writer already closed:', err)
    }
  }

  // Initial preamble
  if (options.retryMs && options.retryMs > 0) {
    void writeRaw(`retry: ${options.retryMs}\n`)
  }
  if (options.bannerComment) {
    writeComment('--- SSE stream started ---')
  }
  writeComment(`start ${nowIso()}`)

  if (options.heartbeatMs && options.heartbeatMs > 0) {
    heartbeatTimer = setInterval(() => {
      writeComment(`heartbeat ${nowIso()}`)
    }, options.heartbeatMs)
  }

  const stream = new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Allow CORS in dev if needed; adjust as appropriate
      'Access-Control-Allow-Origin': '*',
    },
  })

  return {
    stream,
    writeEvent,
    writeComment,
    close,
  }
}

/**
 * Convenience wrapper for simple one-off streaming sequences.
 */
export async function withSSE(
  handler: (ctrl: SSEController) => Promise<void>,
  opts?: SSEOptions,
): Promise<Response> {
  const ctrl = createSSEStream(opts)
  queueMicrotask(async () => {
    try {
      await handler(ctrl)
    } catch (err) {
      ctrl.writeEvent('error', { message: (err as any)?.message || 'unknown error' })
    } finally {
      ctrl.close()
    }
  })
  return ctrl.stream
}