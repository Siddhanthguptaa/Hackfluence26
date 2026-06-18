'use client'

/**
 * ProfileIdentification
 *
 * UI workflow (similar in spirit to DataIngestion) that:
 *  1. Fetches recently active profiles via /api/profiles/recent
 *  2. Sequentially calls local classifier service (scripts/daniel_mock_api.py)
 *       GET http://localhost:13732/profile-instagram-user/&lt;username&gt;
 *     Expected JSON: { labels: string[], data: { text: string } }
 *  3. Ensures each returned label exists as a Tag (creates missing tags)
 *  4. Attaches the tag to the profile with autoAssigned = true (pivot field)
 *  5. Tracks per-profile progress, timing, errors, and labels applied
 *
 * IMPORTANT:
 *  - Start the mock classifier first: `python scripts/daniel_mock_api.py`
 *  - Ensure Prisma migration adding auto_assigned has been applied (already done)
 *  - The workflow is idempotent at tag level: existing tags on profile are skipped
 */

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Loader2, Play, Square, RefreshCw, Hash, CheckCircle2, AlertCircle, Info, Clock } from 'lucide-react'
import { useRecentProfiles, useTags, useTagMutations, useProfileTagMutations, type RecentProfile } from '@/lib/hooks'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type IdentificationStatus = 'pending' | 'running' | 'completed' | 'error' | 'skipped'

interface ProfileRunState {
  profile_pk: number
  username: string
  status: IdentificationStatus
  startedAt?: number
  endedAt?: number
  durationMs?: number
  labels?: string[]
  newTagsCreated?: number
  newAssignments?: number
  error?: string
  classifierText?: string
}

interface ClassifierResponse {
  labels: string[]
  data?: {
    text?: string
    [k: string]: any
  }
  [k: string]: any
}

const CLASSIFIER_BASE = 'http://localhost:40209'

export function ProfileIdentification() {
  // Query controls
  const [days, setDays] = useState(30)
  const [limit, setLimit] = useState(100)
  // Parallelization (concurrency) factor; number of profiles processed simultaneously
  const [concurrency, setConcurrency] = useState(1)

  const { data: recentData, isLoading: recentLoading, refetch: refetchRecent, isRefetching } =
    useRecentProfiles({ days, limit })
  const { data: allTags, isLoading: tagsLoading } = useTags()
  const { create: createTag } = useTagMutations()
  const { addTag } = useProfileTagMutations()

  // Local tag dictionary for quick lookups / updated as we create tags
  const [tagDict, setTagDict] = useState<Map<string, { tag_id: number; tag_name: string }>>(new Map())

  useEffect(() => {
    if (allTags) {
      const map = new Map<string, { tag_id: number; tag_name: string }>()
      allTags.forEach(t => {
        const lower = t.tag_name.toLowerCase()
        const underscore = lower.replace(/\s+/g, '_')
        const spaced = lower.replace(/_/g, ' ')
        map.set(lower, t)
        map.set(underscore, t)
        map.set(spaced, t)
      })
      setTagDict(map)
    }
  }, [allTags])

  const profiles: RecentProfile[] = useMemo(() => recentData?.data || [], [recentData])

  // Run state
  const [runs, setRuns] = useState<Map<number, ProfileRunState>>(new Map())
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const abortRef = useRef<boolean>(false)

  // Initialize run entries when profiles list changes
  useEffect(() => {
    setRuns(prev => {
      const next = new Map(prev)
      for (const p of profiles) {
        if (!next.has(p.profile_pk)) {
          const autoAssignedLabels = p.tags
            ?.filter(t => t.auto_assigned)
            .map(t => t.tag.tag_name) || []
          const hasAuto = autoAssignedLabels.length > 0
          next.set(p.profile_pk, {
            profile_pk: p.profile_pk,
            username: p.current_username,
            status: hasAuto ? 'completed' : 'pending',
            // Pre-populate labels for display if already auto-tagged
            ...(hasAuto ? { labels: autoAssignedLabels } : {}),
          })
        }
      }
      // Optionally remove stale entries not in current profiles
      for (const existing of Array.from(next.keys())) {
        if (!profiles.find(p => p.profile_pk === existing)) {
          next.delete(existing)
        }
      }
      return next
    })
  }, [profiles])

  const updateRun = (profile_pk: number, patch: Partial<ProfileRunState>) => {
    setRuns(prev => {
      const next = new Map(prev)
      const existing = next.get(profile_pk)
      if (!existing) return prev
      next.set(profile_pk, { ...existing, ...patch })
      return next
    })
  }

  const classifyProfile = useCallback(
    async (p: RecentProfile): Promise<void> => {
      updateRun(p.profile_pk, {
        status: 'running',
        startedAt: typeof window !== 'undefined' ? Date.now() : 0,
        error: undefined,
        labels: undefined,
        newAssignments: 0,
        newTagsCreated: 0,
      })

      let createdTags = 0
      let newAssignments = 0
      let labels: string[] = []
      let classifierText: string | undefined

      try {
        // 1. Call classifier
        const res = await fetch(`${CLASSIFIER_BASE}/get-user-info`, {
          method: 'POST', 
          mode: 'cors',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            username: p.current_username
          })
        })

        const json: ClassifierResponse = await res.json()
        labels = Array.isArray(json.labels) ? json.labels : []
        classifierText = json.data?.text

        if (labels.length === 0) {
          updateRun(p.profile_pk, {
            status: 'skipped',
            labels: [],
            classifierText,
            endedAt: typeof window !== 'undefined' ? Date.now() : 0,
            durationMs: typeof window !== 'undefined' ? Date.now() - (runs.get(p.profile_pk)?.startedAt || Date.now()) : 0,
          })
          return
        }

        // Normalize + deduplicate (case-insensitive)
        const normalized = Array.from(new Set(labels.map(l => l.trim()).filter(Boolean)))
        for (const label of normalized) {
          if (abortRef.current) break
          const lower = label.toLowerCase().trim()
          const underscore = lower.replace(/\s+/g, '_')
          const spaced = lower.replace(/_/g, ' ')
          // Try multiple canonical forms before creating
          let existingTag =
            tagDict.get(lower) ||
            tagDict.get(underscore) ||
            tagDict.get(spaced)

          if (!existingTag) {
            // Create tag only if not found under any canonical form
            try {
              const created = await new Promise<{ tag_id: number; tag_name: string }>((resolve, reject) => {
                createTag.mutate(label, {
                  onSuccess: (data: any) => resolve(data),
                  onError: (err: any) => reject(err),
                })
              })
              createdTags += 1
              // Update dict
              setTagDict(prev => {
                const copy = new Map(prev)
                const createdLower = created.tag_name.toLowerCase()
                copy.set(createdLower, created)
                copy.set(createdLower.replace(/\s+/g, '_'), created)
                copy.set(createdLower.replace(/_/g, ' '), created)
                return copy
              })
              existingTag = created
            } catch (err: any) {
              // If tag creation fails, skip that label
              console.error('Failed to create tag', label, err)
              continue
            }
          }

          if (!existingTag) continue

          // Check if already attached
          const already = p.tags.some(pt => pt.tag.tag_id === existingTag!.tag_id)
          if (!already) {
            try {
              await new Promise<void>((resolve, reject) => {
                addTag.mutate(
                  { username: p.current_username, tagId: existingTag!.tag_id, autoAssigned: true },
                  {
                    onSuccess: () => resolve(),
                    onError: (err: any) => reject(err),
                  },
                )
              })
              newAssignments += 1
            } catch (err: any) {
              console.error('Failed to assign tag', label, err)
            }
          }
        }

        updateRun(p.profile_pk, {
          status: 'completed',
          labels,
          classifierText,
          newTagsCreated: createdTags,
          newAssignments,
          endedAt: typeof window !== 'undefined' ? Date.now() : 0,
          durationMs: typeof window !== 'undefined' ? Date.now() - (runs.get(p.profile_pk)?.startedAt || Date.now()) : 0,
        })
      } catch (err: any) {
        updateRun(p.profile_pk, {
          status: 'error',
          error: err?.message || 'Unknown error',
          labels,
          classifierText,
          endedAt: typeof window !== 'undefined' ? Date.now() : 0,
          durationMs: typeof window !== 'undefined' ? Date.now() - (runs.get(p.profile_pk)?.startedAt || Date.now()) : 0,
        })
      }
    },
    [addTag, createTag, runs, tagDict],
  )

  const runConcurrent = useCallback(async () => {
    if (running) return
    if (!profiles.length) {
      toast.message('No recent profiles to process')
      return
    }
    abortRef.current = false
    setRunning(true)
    setStopping(false)

    // Build processing queue (skip already running/completed)
    const queue = profiles.filter(p => {
      const runEntry = runs.get(p.profile_pk)
      return !(runEntry && (runEntry.status === 'completed' || runEntry.status === 'running'))
    })

    let index = 0
    const workerCount = Math.max(1, Math.min(concurrency, queue.length || 1))

    const worker = async () => {
      while (!abortRef.current) {
        const currentIndex = index
        if (currentIndex >= queue.length) break
        index += 1
        const profile = queue[currentIndex]
        // eslint-disable-next-line no-await-in-loop
        await classifyProfile(profile)
      }
    }

    await Promise.all(Array.from({ length: workerCount }, () => worker()))

    setRunning(false)
    setStopping(false)
    if (abortRef.current) {
      toast.warning('Identification stopped')
    } else {
      toast.success('Identification run completed')
    }
  }, [classifyProfile, profiles, running, runs, concurrency])

  const stopSequential = () => {
    if (!running) return
    abortRef.current = true
    setStopping(true)
  }

  const resetStatuses = () => {
    setRuns(prev => {
      const next = new Map(prev)
      for (const [k, v] of next.entries()) {
        next.set(k, {
          profile_pk: v.profile_pk,
            username: v.username,
            status: 'pending',
        })
      }
      return next
    })
  }

  const completedCount = Array.from(runs.values()).filter(r => r.status === 'completed').length
  const errorCount = Array.from(runs.values()).filter(r => r.status === 'error').length
  const pendingCount = profiles.length - completedCount - errorCount - Array.from(runs.values()).filter(r => r.status === 'running').length

  // Format ms to seconds with adaptive precision
  const formatSeconds = (ms: number) => {
    if (ms < 1000) return (ms / 1000).toFixed(2) + 's'
    if (ms < 10000) return (ms / 1000).toFixed(2) + 's'
    return (ms / 1000).toFixed(1) + 's'
  }

  return (
    <Card className="bg-white shadow-sm border-0 rounded-xl">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-bold text-blue-600 flex items-center gap-2">
          <Hash className="h-5 w-5" />
          Stalking Agent Swarm Orchestrator
          <Badge variant="outline" className="ml-2 bg-gray-100 text-gray-700 border-gray-300">
            {profiles.length} profiles
          </Badge>
        </CardTitle>
        <CardDescription className="text-gray-600 text-base">
          Automatically infer audience characteristics and apply tags (auto-assigned) using local classifier.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium">Days Lookback</label>
            <input
              type="number"
              className="border rounded px-2 py-1 text-sm w-24"
              value={days}
              min={1}
              max={365}
              disabled={running}
              onChange={e => setDays(Math.min(365, Math.max(1, Number(e.target.value) || 1)))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Limit</label>
            <input
              type="number"
              className="border rounded px-2 py-1 text-sm w-24"
              value={limit}
              min={1}
              max={500}
              disabled={running}
              onChange={e => setLimit(Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Concurrency</label>
            <input
              type="number"
              className="border rounded px-2 py-1 text-sm w-24"
              value={concurrency}
              min={1}
              max={16}
              disabled={running}
              onChange={e =>
                setConcurrency(
                  Math.min(16, Math.max(1, Number(e.target.value) || 1)),
                )
              }
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => refetchRecent()}
              variant="outline"
              disabled={running || recentLoading || isRefetching}
            >
              {(recentLoading || isRefetching) && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Refresh
            </Button>
            {!running ? (
              <Button
                size="sm"
                onClick={runConcurrent}
                disabled={recentLoading || !profiles.length || tagsLoading}
              >
                <Play className="h-3 w-3 mr-1" />
                Start
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                onClick={stopSequential}
                disabled={stopping}
              >
                <Square className="h-3 w-3 mr-1" />
                {stopping ? 'Stopping...' : 'Stop'}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={resetStatuses}
              disabled={running}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          </div>
        </div>

        {/* Summary Badges */}
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="bg-muted">
            Pending: {pendingCount}
          </Badge>
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
            Completed: {completedCount}
          </Badge>
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
            Errors: {errorCount}
          </Badge>
          <Badge variant="outline">
            Window: {days}d
          </Badge>
          <Badge variant="outline">
            Concurrency: {concurrency}
          </Badge>
        </div>

        <Separator />

        {/* List */}
        <div className="border rounded-md overflow-hidden">
          <div className="grid grid-cols-12 gap-0 bg-muted/50 text-xs font-medium px-3 py-2">
            <div className="col-span-2">Username</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Labels</div>
            <div className="col-span-2">New Tags / Assigned</div>
            <div className="col-span-2">Duration (s)</div>
            <div className="col-span-2">Last Event</div>
          </div>
          <div className="max-h-96 overflow-auto text-sm">
            {recentLoading ? (
              <div className="flex items-center gap-2 p-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading recent profiles...
              </div>
            ) : profiles.length === 0 ? (
              <div className="p-4 text-muted-foreground text-xs">
                No recent profiles in specified window.
              </div>
            ) : (
              profiles.map(p => {
                const run = runs.get(p.profile_pk)
                let durationDisplay = '—'
                if (run?.startedAt && run?.endedAt) {
                  durationDisplay = formatSeconds(run.endedAt - run.startedAt)
                } else if (run?.startedAt && run?.status === 'running') {
                  durationDisplay = formatSeconds(typeof window !== 'undefined' ? Date.now() - run.startedAt : 0)
                }

                let statusNode: React.ReactNode = run?.status || 'pending'
                if (run?.status === 'running') {
                  statusNode = (
                    <span className="flex items-center gap-1 text-blue-600">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Running
                    </span>
                  )
                } else if (run?.status === 'completed') {
                  statusNode = (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Done
                    </span>
                  )
                } else if (run?.status === 'error') {
                  statusNode = (
                    <span className="flex items-center gap-1 text-red-600">
                      <AlertCircle className="h-3 w-3" />
                      Error
                    </span>
                  )
                } else if (run?.status === 'skipped') {
                  statusNode = (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      Skipped
                    </span>
                  )
                }

                return (
                  <div
                    key={p.profile_pk}
                    className={cn(
                      'grid grid-cols-12 gap-0 px-3 py-2 border-b last:border-b-0 items-start',
                      run?.status === 'completed' && 'bg-green-50/40',
                      run?.status === 'error' && 'bg-red-50/40',
                    )}
                  >
                    <div className="col-span-2 truncate">
                      @{p.current_username}
                    </div>
                    <div className="col-span-2">
                      {statusNode}
                      {run?.error && (
                        <div className="text-[10px] text-red-600 mt-0.5 line-clamp-2">
                          {run.error}
                        </div>
                      )}
                    </div>
                    <div className="col-span-2">
                      {run?.labels && run.labels.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {run.labels.map(l => (
                            <Badge
                              key={l}
                              variant="outline"
                              className="text-[10px] px-1 py-0"
                              title={l}
                            >
                              {l}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="col-span-2 text-xs">
                      {run
                        ? `${run.newTagsCreated || 0} / ${run.newAssignments || 0}`
                        : '—'}
                    </div>
                    <div className="col-span-2 text-xs">
                      {durationDisplay}
                    </div>
                    <div className="col-span-2 text-[10px] leading-tight">
                      {p.last_event ? (
                        <>
                          <div className="font-medium">{p.last_event.event_type}</div>
                          <div className="text-muted-foreground">
                            {formatDate(p.last_event.event_ts, 'datetime')}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Legend / Help */}
        <div className="rounded-md bg-muted/50 p-3 space-y-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1 font-medium">
            <Info className="h-3 w-3" />
            How it works
          </div>
          <ul className="list-disc list-inside space-y-1">
            <li>Profiles pulled from /api/profiles/recent (last {days} days, limit {limit}).</li>
            <li>Classifier endpoint: {CLASSIFIER_BASE}/profile-instagram-user/&lt;username&gt; (run python script first).</li>
            <li>Returned labels become tags (created if missing) and are auto-assigned (flagged).</li>
            <li>* Asterisk denotes automatically assigned tags elsewhere in the UI.</li>
          </ul>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Sequential processing ensures controlled rate; Stop to abort remaining profiles.
          </div>
        </div>
      </CardContent>
    </Card>
  )
}