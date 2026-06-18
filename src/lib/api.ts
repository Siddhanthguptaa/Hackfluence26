import { NextResponse } from 'next/server'
import { ZodSchema, ZodError, ZodIssue } from 'zod'

/**
 * Standard success envelope.
 */
export function jsonSuccess<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(meta ? { meta } : {}),
    },
    init,
  )
}

/**
 * Standard error envelope.
 */
export function jsonError(
  message: string,
  status: number = 400,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        message,
        status,
        ...extra,
      },
    },
    { status },
  )
}

/**
 * Safely parse JSON body. Returns:
 *  - { ok: true, value }
 *  - { ok: false, response } (already a NextResponse with error)
 */
export async function safeJson<T = unknown>(
  request: Request,
): Promise<{ ok: true; value: T } | { ok: false; response: NextResponse }> {
  try {
    const value = (await request.json()) as T
    return { ok: true, value }
  } catch {
    return { ok: false, response: jsonError('Invalid JSON body', 400) }
  }
}

/**
 * Parse + validate with Zod schema in one step.
 * If validation fails, returns standardized error response.
 */
export async function parseWithSchema<T>(
  request: Request,
  schema: ZodSchema<T>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const parsed = await safeJson<unknown>(request)
  if (!parsed.ok) return { ok: false, response: parsed.response }
  try {
    const data = schema.parse(parsed.value)
    return { ok: true, data }
  } catch (e: unknown) {
    if (e instanceof ZodError) {
      const issues = e.issues.map((i: ZodIssue) => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      }))
      return {
        ok: false,
        response: jsonError('Validation failed', 422, { issues }),
      }
    }
    return { ok: false, response: jsonError('Unknown validation error', 500) }
  }
}

/**
 * Helper to build pagination metadata.
 */
export function paginationMeta(page: number, pageSize: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  }
}

/**
 * Parse and validate query parameters using Zod schema.
 */
export function parseQueryParams<T>(
  url: string,
  schema: ZodSchema<T>,
): { ok: true; data: T } | { ok: false; response: NextResponse } {
  try {
    const { searchParams } = new URL(url)
    const params = Object.fromEntries(searchParams.entries())
    const data = schema.parse(params)
    return { ok: true, data }
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        ok: false,
        response: jsonError('Invalid query parameters', 422, {
          issues: e.issues.map((i: ZodIssue) => ({
            path: i.path.join('.'),
            message: i.message,
            code: i.code,
          })),
        }),
      }
    }
    return { ok: false, response: jsonError('Unknown query parameter error', 500) }
  }
}

/**
 * Helper to parse numeric route parameters.
 */
export function parseId(raw: string | undefined): number | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}