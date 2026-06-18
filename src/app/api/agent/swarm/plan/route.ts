import { NextResponse } from 'next/server'
import { z } from 'zod'
import { jsonError, jsonSuccess, safeJson } from '../../../../../lib/api'
import { buildPlanningPrompts } from '../../../../../lib/agent/prompts'
import { generateJsonPlan } from '../../../../../lib/llm'
import {
  saveNewPlan,
  sanitizePlanForClient,
  isPromptDangerous,
} from '../../../../../lib/agent/store'

/**
 * Route: POST /api/agent/swarm/plan
 *
 * Body:
 *   {
 *     "prompt": "natural language user objective"
 *   }
 *
 * Behavior:
 *  1. Basic validation + guardrail check on prompt.
 *  2. Construct system + user planner prompts.
 *  3. Call LLM (no streaming) to obtain JSON plan text.
 *  4. Extract JSON, validate via saveNewPlan (which runs validatePlan()).
 *  5. Return sanitized plan object.
 *
 * Failure Modes:
 *  - 400 if missing/empty prompt.
 *  - 400 if coarse dangerous prompt pattern.
 *  - 422 if plan JSON invalid against schema.
 *  - 500 for unexpected errors or LLM failures.
 *
 * NOTE: Orchestrator / execute path will be implemented in a separate route.
 */

const RequestSchema = z.object({
  prompt: z.string().min(4, 'prompt must be at least 4 characters'),
  // future: maybe allow explicit plan override for tests
})

export async function POST(request: Request) {
  // Parse JSON body safely
  const parsed = await safeJson<unknown>(request)
  if (!parsed.ok) return parsed.response

  // Validate shape
  const result = RequestSchema.safeParse(parsed.value)
  if (!result.success) {
    return jsonError('Invalid request body', 422, {
      issues: result.error.issues.map(i => ({
        path: i.path.join('.'),
        message: i.message,
        code: i.code,
      })),
    })
  }

  const { prompt } = result.data
  const trimmedPrompt = prompt.trim()

  if (isPromptDangerous(trimmedPrompt)) {
    return jsonError('Prompt rejected by safety filter', 400, {
      reason: 'Potentially dangerous / disallowed content',
    })
  }

  if (process.env.AGENT_DEBUG) {
    // eslint-disable-next-line no-console
    console.log('[SWARM_PLAN][incoming]', trimmedPrompt.slice(0, 180))
  }

  try {
    // Build planning prompts
    const { system, user } = buildPlanningPrompts(trimmedPrompt)

    // Invoke LLM to generate JSON plan
    const { rawText, json } = await generateJsonPlan(
      user,
      system,
      {
        temperature: 0.1,
        tag: 'swarm_plan',
        // If model misbehaves, retries may help
        retries: 1,
        timeoutMs: 30_000,
      },
    )

    if (process.env.AGENT_DEBUG) {
      // eslint-disable-next-line no-console
      console.log('[SWARM_PLAN][raw_output_preview]', rawText.slice(0, 240))
    }

    // Persist & validate plan
    let stored
    try {
      stored = saveNewPlan(json)
    } catch (e: any) {
      return jsonError('Plan validation failed', 422, {
        detail: e?.message || 'Unknown validation error',
      })
    }

    const sanitized = sanitizePlanForClient(stored)

    return jsonSuccess({
      planId: sanitized.planId,
      plan: sanitized,
    })
  } catch (err: any) {
    if (process.env.AGENT_DEBUG) {
      // eslint-disable-next-line no-console
      console.error('[SWARM_PLAN][error]', err)
    }
    // Attempt to classify known LLM error codes
    const status = err?.code === 'JSON_EXTRACT' ? 422 : 500
    return jsonError('Failed to generate plan', status, {
      code: err?.code,
      message: err?.message,
    })
  }
}

/**
 * (Optional) Simple GET for diagnostics (list latest plans).
 * Not specified in SRD but useful while developing.
 * Can be removed later if undesired.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    info: 'POST with { "prompt": string } to generate a plan',
  })
}