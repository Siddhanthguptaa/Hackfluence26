'use client'

import React, { useState, useMemo } from 'react'
import { useSwarmPlan, useSwarmExecute } from '@/lib/hooks'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

/**
 * SwarmCommand
 *
 * UI State Machine:
 *   idle -> planning -> planned -> executing -> completed (or error)
 *
 * Supports two flows:
 *  A) Plan first (Generate Plan) then Execute
 *  B) Direct execute (auto-plan) via Execute Immediately
 *
 * Streaming events (from /api/agent/swarm/execute POST SSE):
 *   - plan_created
 *   - step_started
 *   - step_result
 *   - artifact_ready
 *   - completed
 *   - error
 *
 * The component leverages hooks:
 *   useSwarmPlan() for explicit planning
 *   useSwarmExecute() for streaming execution
 */

export function SwarmCommand() {
  const [prompt, setPrompt] = useState('')
  const [planId, setPlanId] = useState<string | null>(null)
  const [autoExecuteMode, setAutoExecuteMode] = useState(false)

  const planning = useSwarmPlan()
  const exec = useSwarmExecute()

  const plan = useMemo(() => {
    return planning.data?.plan || exec.state.plan
  }, [planning.data?.plan, exec.state.plan])

  const hasSteps = !!plan?.steps?.length

  function handleGeneratePlan() {
    if (!prompt.trim()) return
    setAutoExecuteMode(false)
    setPlanId(null)
    exec.reset()
    planning.mutate(prompt.trim(), {
      onSuccess: (res) => {
        setPlanId(res.planId)
      }
    })
  }

  function handleExecuteExisting() {
    if (!planId) return
    exec.start({ planId })
  }

  function handleExecuteImmediate() {
    if (!prompt.trim()) return
    setAutoExecuteMode(true)
    planning.reset()
    setPlanId(null)
    exec.start({ prompt: prompt.trim() })
  }

  function handleReset() {
    planning.reset()
    exec.reset()
    setPlanId(null)
    setPrompt('')
    setAutoExecuteMode(false)
  }

  const isPlanning = planning.isPending
  const isExecuting = exec.state.status === 'executing'
  const isCompleted = exec.state.status === 'completed'
  const isErrored = exec.state.status === 'error'

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Swarm Command</CardTitle>
          <CardDescription>
            Plan and execute multi-step data / enrichment / reporting workflows (Phase 2 Agentic Swarm).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <Input
              placeholder="Describe the objective (e.g. Enrich top 20 recent followers and produce CSV)"
              value={prompt}
              disabled={isPlanning || isExecuting}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={!prompt.trim() || isPlanning || isExecuting}
                onClick={handleGeneratePlan}
              >
                {isPlanning && !autoExecuteMode ? 'Planning...' : 'Generate Plan'}
              </Button>
              <Button
                disabled={
                  (!planId && !prompt.trim()) ||
                  isPlanning ||
                  isExecuting
                }
                onClick={() => {
                  if (planId) {
                    handleExecuteExisting()
                  } else {
                    handleExecuteImmediate()
                  }
                }}
              >
                {isExecuting
                  ? 'Executing...'
                  : planId
                    ? 'Execute Plan'
                    : 'Execute (Auto-Plan)'}
              </Button>
              <Button
                variant="outline"
                disabled={isPlanning || isExecuting}
                onClick={handleReset}
              >
                Reset
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {planId && <Badge variant="outline">Plan ID: {planId}</Badge>}
            {exec.state.status === 'executing' && (
              <Badge variant="secondary">Streaming</Badge>
            )}
            {isCompleted && <Badge variant="default">Completed</Badge>}
            {isErrored && <Badge variant="destructive">Error</Badge>}
          </div>

          {(planning.error || exec.state.error) && (
            <div className="text-sm text-destructive border border-destructive/20 rounded-md p-2 bg-destructive/5">
              {(planning.error as any)?.message || exec.state.error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plan Preview */}
      {plan && (
        <Card>
          <CardHeader>
            <CardTitle>Plan</CardTitle>
            <CardDescription>
              Objective: {plan.objective}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasSteps ? (
              <ol className="space-y-3">
                {plan.steps.map((s: any, idx: number) => {
                  const liveStep = exec.state.steps[s.id] || s
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        'border rounded-md p-3 text-sm bg-muted/30',
                        liveStep.status === 'RUNNING' && 'border-primary animate-pulse',
                        liveStep.status === 'SUCCESS' && 'border-green-500 bg-green-50',
                        liveStep.status === 'ERROR' && 'border-red-500 bg-red-50'
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">#{idx + 1}</Badge>
                        <Badge variant="secondary">{liveStep.kind}</Badge>
                        <span className="font-medium">{liveStep.title || '(untitled step)'}</span>
                        {liveStep.status && (
                          <Badge
                            variant={
                              liveStep.status === 'SUCCESS'
                                ? 'default'
                                : liveStep.status === 'ERROR'
                                  ? 'destructive'
                                  : liveStep.status === 'RUNNING'
                                    ? 'secondary'
                                    : 'outline'
                            }
                          >
                            {liveStep.status.toLowerCase()}
                          </Badge>
                        )}
                      </div>
                      {liveStep.description && (
                        <p className="mt-1 text-muted-foreground">{liveStep.description}</p>
                      )}
                      {liveStep.outputSummary && (
                        <p className="mt-2 text-xs font-mono bg-background border rounded p-2">
                          {liveStep.outputSummary}
                        </p>
                      )}
                      {liveStep.resultSnippet && (
                        <pre className="mt-2 text-[11px] overflow-x-auto bg-background border rounded p-2 max-h-40">
                          {typeof liveStep.resultSnippet === 'string'
                            ? liveStep.resultSnippet
                            : JSON.stringify(liveStep.resultSnippet, null, 2)}
                        </pre>
                      )}
                      {Array.isArray(liveStep.producedArtifactIds) && liveStep.producedArtifactIds.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {liveStep.producedArtifactIds.map((aid: string) => (
                            <a
                              key={aid}
                              href={`/api/reports/${encodeURIComponent(aid)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs underline text-primary hover:text-primary/80"
                            >
                              Download Artifact {aid.slice(0, 8)}
                            </a>
                          ))}
                        </div>
                      )}
                      {liveStep.error && (
                        <p className="mt-2 text-xs text-red-600">
                          {liveStep.error}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No steps in plan.</p>
            )}

            {exec.state.artifacts.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="font-medium mb-2 text-sm">Artifacts</h4>
                  <ul className="space-y-1 text-xs">
                    {exec.state.artifacts.map(a => (
                      <li key={a.artifactId} className="flex items-center gap-2">
                        <Badge variant="outline">{a.artifactId.slice(0, 8)}</Badge>
                        <a
                          href={`/api/reports/${encodeURIComponent(a.artifactId)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline text-primary hover:text-primary/80"
                        >
                          {a.filename}
                        </a>
                        {a.warnings?.length ? (
                          <span className="text-amber-600">
                            {a.warnings.length} warning{a.warnings.length > 1 ? 's' : ''}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {isCompleted && (
              <div className="mt-4 text-xs text-green-700">
                Execution completed in {formatMs(exec.state.durationMs)}
              </div>
            )}
            {isErrored && (
              <div className="mt-4 text-xs text-red-600">
                Execution error. Partial results (if any) shown above.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function formatMs(ms?: number) {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return (ms / 1000).toFixed(2) + ' s'
}