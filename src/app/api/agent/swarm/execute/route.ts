import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createSSEStream } from '../../../../../lib/agent/sse'
import { runPlanExecution } from '../../../../../lib/agent/orchestrator'
import { getPlan, saveNewPlan, sanitizePlanForClient, isPromptDangerous } from '../../../../../lib/agent/store'
import { buildPlanningPrompts } from '../../../../../lib/agent/prompts'
import { generateJsonPlan } from '../../../../../lib/llm'
import { jsonError } from '../../../../../lib/api'

/**
 * POST /api/agent/swarm/execute
 *
 * Body variants:
 *  1) { "planId": "existingId" }
 *  2) { "prompt": "natural language objective" }
 *  3) { "prompt": "...", "autoStart": true } (default autoStart = true anyway)
 *
 * Behavior:
 *  - If prompt supplied (planId optional), generate a plan (like /plan route) then execute.
 *  - If planId supplied without prompt, execute that stored plan.
 *  - Streams SSE events:
 *      plan_created: { plan }
 *      step_started: { stepId, kind, title }
 *      step_result:  { stepId, kind, status, outputSummary, resultSnippet?, error? }
 *      artifact_ready: { stepId, artifactId, filename }
 *      completed: { planId, succeeded, failed, durationMs, finalPlan }
 *      error: { message }
 *
 * Notes:
 *  - Heartbeat comments every 15s to keep connection alive.
 *  - Client disconnect aborts execution (best-effort).
 */

const BodySchema = z.object({
  planId: z.string().min(1).optional(),
  prompt: z.string().min(4).optional(),
  autoStart: z.boolean().optional(), // reserved; always true for now
})

export async function POST(req: Request) {
  let parsedBody: z.infer<typeof BodySchema>
  try {
    parsedBody = BodySchema.parse(await req.json())
  } catch (e: any) {
    return jsonError('Invalid request body', 400, { detail: e?.message })
  }

  const { planId: incomingPlanId, prompt } = parsedBody

  if (!incomingPlanId && !prompt) {
    return jsonError('Provide either planId or prompt', 400)
  }

  if (prompt && isPromptDangerous(prompt)) {
    return jsonError('Prompt rejected by safety filter', 400)
  }

  const { stream, writeEvent, writeComment, close } = createSSEStream({
    heartbeatMs: 15000,
    bannerComment: !!process.env.AGENT_DEBUG,
    retryMs: 3000,
    onError: () => {
      // Client likely disconnected
    },
  })

  // AbortController for orchestrator cancellation on disconnect
  const abortCtrl = new AbortController()

  // In Next.js App Router, there is no direct "close" event for Response.
  // We rely on write errors in sse util's onError.
  queueMicrotask(async () => {
    try {
      let effectivePlanId = incomingPlanId
      let generated = false

      // Handle prompt -> plan generation
      if (prompt) {
        writeComment('planning start')
        try {
          const { system, user } = buildPlanningPrompts(prompt.trim())
          const { rawText, json } = await generateJsonPlan(
            user,
            system,
            {
              temperature: 0.1,
              retries: 1,
              timeoutMs: 30_000,
              tag: 'execute_plan',
            },
          )
          // Save validated plan
          const stored = saveNewPlan(json)
          effectivePlanId = stored.planId
          generated = true
          writeEvent('plan_created', {
            planId: stored.planId,
            plan: sanitizePlanForClient(stored),
          })
        } catch (err: any) {
          writeEvent('error', {
            message: 'Failed to generate plan',
            detail: err?.message,
            code: err?.code,
          })
          close()
          return
        }
      }

      if (!effectivePlanId) {
        writeEvent('error', { message: 'Internal error: no planId resolved' })
        close()
        return
      }

      // If existing plan requested
      if (!generated && incomingPlanId) {
        const existing = getPlan(effectivePlanId)
        if (!existing) {
          writeEvent('error', { message: `Plan "${effectivePlanId}" not found` })
          close()
          return
        }
        writeEvent('plan_created', {
          planId: existing.planId,
          plan: sanitizePlanForClient(existing),
        })
      }

      // Run orchestrator
      const startedAt = Date.now()
      await runPlanExecution(effectivePlanId, {
        signal: abortCtrl.signal,
        rowSnippetLimit: 25,
        enrichmentSnippetLimit: 15,
        onEvent: ev => {
          switch (ev.type) {
            case 'plan_started':
              // Already emitted plan_created separately; optionally could emit plan_started too.
              break
            case 'step_started':
              writeEvent('step_started', {
                planId: ev.planId,
                stepId: ev.stepId,
                kind: ev.kind,
                title: ev.title,
              })
              break
            case 'step_result':
              writeEvent('step_result', {
                planId: ev.planId,
                stepId: ev.stepId,
                kind: ev.kind,
                status: ev.status,
                outputSummary: ev.outputSummary,
                resultSnippet: ev.resultSnippet,
                error: ev.error,
              })
              break
            case 'artifact_ready':
              writeEvent('artifact_ready', {
                planId: ev.planId,
                stepId: ev.stepId,
                artifactId: ev.artifactId,
                filename: ev.filename,
              })
              break
            case 'plan_error':
              writeEvent('error', {
                planId: ev.planId,
                message: ev.error,
              })
              break
            case 'plan_completed':
              // We'll emit completed below after we get sanitized final plan
              break
          }
        },
      })

      const finishedAt = Date.now()
      const finalPlan = getPlan(effectivePlanId)
      if (finalPlan) {
        writeEvent('completed', {
          planId: finalPlan.planId,
          durationMs: finishedAt - startedAt,
          plan: sanitizePlanForClient(finalPlan),
        })
      } else {
        writeEvent('completed', {
          planId: effectivePlanId,
          durationMs: finishedAt - startedAt,
          plan: null,
          warning: 'Plan missing after execution',
        })
      }
    } catch (err: any) {
      writeEvent('error', {
        message: 'Unhandled execution error',
        detail: err?.message || String(err),
      })
    } finally {
      // Allow small delay to flush final events
      setTimeout(() => {
        close()
      }, 50)
    }
  })

  return stream
}

/**
 * GET could be used for a light connectivity check.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    info: 'POST with { planId } OR { prompt } to start execution (SSE).',
  })
}