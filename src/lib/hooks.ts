import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as React from 'react'

// Types
export type Tag = {
  tag_id: number
  tag_name: string
}

export type Campaign = {
  campaign_id: number
  campaign_name: string
  campaign_date: string
  campaign_type: 'CONTENT' | 'OUTBOUND_FOLLOW'
}

export type Profile = {
  profile_pk: number
  current_username: string
  first_seen_ts: string
  is_active_follower: boolean
  is_currently_following?: boolean
  is_pending_outbound_request?: boolean
  notes?: string | null
  // tags pivot now returns auto_assigned flag
  tags?: { auto_assigned?: boolean; tag: { tag_id: number; tag_name: string } }[]
  interaction_events?: InteractionEvent[]
}

/**
 * RecentProfile returned by /api/profiles/recent
 * last_event is a simplified single latest event within the lookback window.
 */
export type RecentProfile = {
  profile_pk: number
  current_username: string
  first_seen_ts: string
  tags: { auto_assigned?: boolean; tag: { tag_id: number; tag_name: string } }[]
  last_event: {
    event_id: number
    event_type: string
    event_ts: string
    attribution: {
      reason: string
      campaign: { campaign_id: number; campaign_name: string } | null
    } | null
  } | null
}

export type RecentProfilesResponse = {
  data: RecentProfile[]
  summary: {
    window_days: number
    cutoff_iso: string
    profile_count: number
  }
}

export type InteractionEvent = {
  event_id: number
  event_type: string
  event_ts: string
  attribution?: {
    reason: string
    campaign_id: number | null
    campaign?: Campaign
  } | null
}

export type ProfilesResponse = {
  data: Profile[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// API Functions
export const api = {
  // Campaigns
  fetchCampaigns: async (): Promise<Campaign[]> => {
    const res = await fetch('/api/campaigns')
    if (!res.ok) throw new Error('Failed to fetch campaigns')
    const response = await res.json()
    return response.data || []
  },

  createCampaign: async (data: Omit<Campaign, 'campaign_id'>): Promise<Campaign> => {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error('Failed to create campaign')
    const response = await res.json()
    return response.data
  },

  updateCampaign: async (id: number, data: Partial<Omit<Campaign, 'campaign_id'>>): Promise<Campaign> => {
    const res = await fetch(`/api/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error('Failed to update campaign')
    const response = await res.json()
    return response.data
  },

  deleteCampaign: async (id: number): Promise<void> => {
    const res = await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete campaign')
  },

  // Profiles
  fetchProfiles: async (params: {
    status?: string
    search?: string
    page?: number
    pageSize?: number
    sortBy?: string
    sortDir?: string
  }): Promise<ProfilesResponse> => {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        searchParams.set(key, String(value))
      }
    })
    
    const res = await fetch(`/api/profiles?${searchParams.toString()}`)
    if (!res.ok) throw new Error('Failed to fetch profiles')
    const response = await res.json()
    // The API now returns { success: true, data: { data: profiles, total, page, etc } }
    return response.data || { data: [], total: 0, page: 1, pageSize: 20, totalPages: 1 }
  },

  fetchProfile: async (username: string): Promise<Profile> => {
    const res = await fetch(`/api/profiles/${encodeURIComponent(username)}`)
    if (!res.ok) throw new Error('Failed to fetch profile')
    const response = await res.json()
    return response.data
  },

  updateProfile: async (username: string, data: { notes?: string }): Promise<Profile> => {
    const res = await fetch(`/api/profiles/${encodeURIComponent(username)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error('Failed to update profile')
    const response = await res.json()
    return response.data
  },

  // Attributions
  setAttribution: async (eventId: number, data: { reason: string; campaign_id?: number | null }) => {
    const res = await fetch(`/api/events/${eventId}/attribution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error('Failed to set attribution')
    const response = await res.json()
    return response.data
  },

  deleteAttribution: async (eventId: number) => {
    const res = await fetch(`/api/events/${eventId}/attribution`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete attribution')
  },

  bulkAttribution: async (data: {
    profile_pks: number[]
    reason: string
    campaign_id?: number | null
    target: 'FOLLOWED' | 'UNFOLLOWED' | 'BOTH'
  }) => {
    const res = await fetch('/api/attributions/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (!res.ok) throw new Error('Failed to apply bulk attribution')
    const response = await res.json()
    return response.data
  },

  // Tags
  fetchTags: async (): Promise<Tag[]> => {
    const res = await fetch('/api/tags')
    if (!res.ok) throw new Error('Failed to fetch tags')
    const response = await res.json()
    return response.data || []
  },

  // Recent Profiles (for identification workflow)
  fetchRecentProfiles: async (params: { days?: number; limit?: number } = {}): Promise<RecentProfilesResponse> => {
    const sp = new URLSearchParams()
    if (params.days != null) sp.set('days', String(params.days))
    if (params.limit != null) sp.set('limit', String(params.limit))
    const qs = sp.toString()
    const res = await fetch(`/api/profiles/recent${qs ? `?${qs}` : ''}`)
    if (!res.ok) throw new Error('Failed to fetch recent profiles')
    const response = await res.json()
    return response.data || { data: [], summary: { window_days: params.days || 30, cutoff_iso: '', profile_count: 0 } }
  },

  createTag: async (tagName: string): Promise<Tag> => {
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagName })
    })
    if (!res.ok) throw new Error('Failed to create tag')
    const response = await res.json()
    return response.data
  },

  updateTag: async (id: number, tagName: string): Promise<Tag> => {
    const res = await fetch(`/api/tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagName })
    })
    if (!res.ok) throw new Error('Failed to update tag')
    const response = await res.json()
    return response.data
  },

  deleteTag: async (id: number): Promise<void> => {
    const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('Failed to delete tag')
  },

  // Profile Tags
  // Supports optional autoAssigned flag for machine-generated labels
  addTagToProfile: async (
    username: string,
    tagId: number,
    options?: { autoAssigned?: boolean }
  ) => {
    const payload: any = { tagId }
    if (options?.autoAssigned) {
      payload.autoAssigned = true
    }
    const res = await fetch(`/api/profiles/${encodeURIComponent(username)}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!res.ok) throw new Error('Failed to add tag to profile')
    const response = await res.json()
    return response.data
  },

  removeTagFromProfile: async (username: string, tagId: number) => {
    const res = await fetch(`/api/profiles/${encodeURIComponent(username)}/tags`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagId })
    })
    if (!res.ok) throw new Error('Failed to remove tag from profile')
  },

  // Campaign Analytics
  fetchCampaignAnalytics: async (params: {
    campaignId?: number;
    dateRange?: number;
    timeZone?: string
  } = {}): Promise<any> => {
    const searchParams = new URLSearchParams()
    if (params.campaignId) searchParams.set('campaignId', String(params.campaignId))
    if (params.dateRange) searchParams.set('dateRange', String(params.dateRange))
    if (params.timeZone) searchParams.set('timeZone', params.timeZone)
    
    const res = await fetch(`/api/campaigns/analytics?${searchParams.toString()}`)
    if (!res.ok) throw new Error('Failed to fetch campaign analytics')
    const response = await res.json()
    return response.data
  },

  // Tag Analytics
  fetchTagAnalytics: async (params: {
    dateRange?: number;
    minTagCount?: number
  } = {}): Promise<any> => {
    const searchParams = new URLSearchParams()
    if (params.dateRange) searchParams.set('dateRange', String(params.dateRange))
    if (params.minTagCount) searchParams.set('minTagCount', String(params.minTagCount))
    
    const res = await fetch(`/api/tags/analytics?${searchParams.toString()}`)
    if (!res.ok) throw new Error('Failed to fetch tag analytics')
    const response = await res.json()
    return response.data
  }
}

// Hooks
export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: api.fetchCampaigns
  })
}

export function useProfiles(params: Parameters<typeof api.fetchProfiles>[0] = {}) {
  return useQuery({
    queryKey: ['profiles', params],
    queryFn: () => api.fetchProfiles(params)
  })
}

export function useProfile(username: string) {
  return useQuery({
    queryKey: ['profile', username],
    queryFn: () => api.fetchProfile(username),
    enabled: !!username
  })
}

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: api.fetchTags
  })
}

export function useRecentProfiles(params: { days?: number; limit?: number } = {}) {
  return useQuery({
    queryKey: ['recent-profiles', params],
    queryFn: () => api.fetchRecentProfiles(params)
  })
}

export function useCampaignMutations() {
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: api.createCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign created successfully')
    },
    onError: (error: Error) => {
      toast.error(`Failed to create campaign: ${error.message}`)
    }
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof api.updateCampaign>[1] }) =>
      api.updateCampaign(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign updated successfully')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update campaign: ${error.message}`)
    }
  })

  const remove = useMutation({
    mutationFn: api.deleteCampaign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      toast.success('Campaign deleted successfully')
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete campaign: ${error.message}`)
    }
  })

  return { create, update, remove }
}

export function useAttributionMutations() {
  const queryClient = useQueryClient()

  const setAttribution = useMutation({
    mutationFn: ({ eventId, data }: { eventId: number; data: Parameters<typeof api.setAttribution>[1] }) =>
      api.setAttribution(eventId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Attribution set successfully')
    },
    onError: (error: Error) => {
      toast.error(`Failed to set attribution: ${error.message}`)
    }
  })

  const deleteAttribution = useMutation({
    mutationFn: api.deleteAttribution,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Attribution removed successfully')
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove attribution: ${error.message}`)
    }
  })

  const bulkAttribution = useMutation({
    mutationFn: api.bulkAttribution,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      toast.success('Bulk attribution applied successfully')
    },
    onError: (error: Error) => {
      toast.error(`Failed to apply bulk attribution: ${error.message}`)
    }
  })

  return { setAttribution, deleteAttribution, bulkAttribution }
}

export function useTagMutations() {
  const queryClient = useQueryClient()

  const create = useMutation({
    mutationFn: api.createTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      toast.success('Tag created successfully')
    },
    onError: (error: Error) => {
      toast.error(`Failed to create tag: ${error.message}`)
    }
  })

  const update = useMutation({
    mutationFn: ({ id, tagName }: { id: number; tagName: string }) =>
      api.updateTag(id, tagName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Tag updated successfully')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update tag: ${error.message}`)
    }
  })

  const remove = useMutation({
    mutationFn: api.deleteTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Tag deleted successfully')
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete tag: ${error.message}`)
    }
  })

  return { create, update, remove }
}

export function useProfileTagMutations() {
  const queryClient = useQueryClient()

  const addTag = useMutation({
    mutationFn: ({ username, tagId, autoAssigned }: { username: string; tagId: number; autoAssigned?: boolean }) =>
      api.addTagToProfile(username, tagId, { autoAssigned }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Tag added to profile')
    },
    onError: (error: Error) => {
      toast.error(`Failed to add tag: ${error.message}`)
    }
  })

  const removeTag = useMutation({
    mutationFn: ({ username, tagId }: { username: string; tagId: number }) =>
      api.removeTagFromProfile(username, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
      toast.success('Tag removed from profile')
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove tag: ${error.message}`)
    }
  })

  return { addTag, removeTag }
}

export function useCampaignAnalytics(params: {
  campaignId?: number;
  dateRange?: number;
  timeZone?: string
} = {}) {
  return useQuery({
    queryKey: ['campaign-analytics', params],
    queryFn: () => api.fetchCampaignAnalytics(params)
  })
}

export function useTagAnalytics(params: {
  dateRange?: number;
  minTagCount?: number
} = {}) {
  return useQuery({
    queryKey: ['tag-analytics', params],
    queryFn: () => api.fetchTagAnalytics(params)
  })
}

/* ----------------------------------------------------------------------- *
 * Agentic Swarm Hooks
 * ----------------------------------------------------------------------- */

/**
 * useSwarmPlan
 * POST /api/agent/swarm/plan with { prompt }
 * Returns mutation that resolves: { planId, plan }
 */
export function useSwarmPlan() {
  return useMutation<{
    planId: string
    plan: any
  }, Error, string>({
    mutationFn: async (prompt: string) => {
      const res = await fetch('/api/agent/swarm/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      if (!res.ok) {
        let detail = ''
        try {
          const j = await res.json()
          detail = j?.error?.detail || j?.error?.message || res.statusText
        } catch {
          detail = res.statusText
        }
        throw new Error(`Plan failed: ${detail}`)
      }
      const data = await res.json()
      return data.data
    },
  })
}

/**
 * Types for execution state
 */
interface SwarmExecutionArtifact {
  artifactId: string
  filename: string
  warnings?: string[]
}

interface SwarmExecutionState {
  status: 'idle' | 'executing' | 'completed' | 'error'
  plan?: any
  steps: Record<string, any>
  artifacts: SwarmExecutionArtifact[]
  error?: string
  startedAt?: number
  durationMs?: number
}

interface StartExecutionPayload {
  planId?: string
  prompt?: string
}

interface UseSwarmExecuteReturn {
  state: SwarmExecutionState
  start: (payload: StartExecutionPayload) => void
  reset: () => void
  abort: () => void
}

/**
 * useSwarmExecute
 * Starts SSE execution via POST /api/agent/swarm/execute
 * Exposes streaming state.
 */
export function useSwarmExecute(): UseSwarmExecuteReturn {
  const [state, setState] = React.useState<SwarmExecutionState>({
    status: 'idle',
    steps: {},
    artifacts: [],
  })

  const abortRef = React.useRef<AbortController | null>(null)
  const readerRef = React.useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const bufferRef = React.useRef<string>('')

  const reset = React.useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    abortRef.current = null
    readerRef.current = null
    bufferRef.current = ''
    setState({
      status: 'idle',
      steps: {},
      artifacts: [],
    })
  }, [])

  const abort = React.useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    setState(s => ({
      ...s,
      status: s.status === 'executing' ? 'error' : s.status,
      error: s.status === 'executing' ? (s.error || 'Execution aborted by user') : s.error,
    }))
  }, [])

  const processEvent = React.useCallback((eventName: string, payload: any) => {
    setState(prev => {
      const next = { ...prev }
      switch (eventName) {
        case 'plan_created': {
          next.plan = payload.plan
          // Initialize steps map for quick updates
            if (payload.plan?.steps) {
              const steps: Record<string, any> = {}
              for (const st of payload.plan.steps) {
                steps[st.id] = st
              }
              next.steps = { ...next.steps, ...steps }
            }
          break
        }
        case 'step_started': {
          const { stepId } = payload
          const existing = next.steps[stepId] || {}
          next.steps = {
            ...next.steps,
            [stepId]: {
              ...existing,
              id: stepId,
              kind: payload.kind,
              title: payload.title,
              status: 'RUNNING',
            },
          }
          break
        }
        case 'step_result': {
          const { stepId } = payload
          const existing = next.steps[stepId] || {}
          next.steps = {
            ...next.steps,
            [stepId]: {
              ...existing,
              id: stepId,
              kind: payload.kind ?? existing.kind,
              title: existing.title,
              status: payload.status || existing.status,
              outputSummary: payload.outputSummary,
              resultSnippet: payload.resultSnippet,
              error: payload.error,
            },
          }
          break
        }
        case 'artifact_ready': {
          const art: SwarmExecutionArtifact = {
            artifactId: payload.artifactId,
            filename: payload.filename,
          }
          // Attach artifact id to producing step
          if (payload.stepId && next.steps[payload.stepId]) {
            const step = next.steps[payload.stepId]
            const produced = Array.isArray(step.producedArtifactIds) ? step.producedArtifactIds.slice() : []
            if (!produced.includes(art.artifactId)) produced.push(art.artifactId)
            next.steps = {
              ...next.steps,
              [payload.stepId]: {
                ...step,
                producedArtifactIds: produced,
              },
            }
          }
          next.artifacts = [...next.artifacts, art]
          break
        }
        case 'completed': {
          next.status = 'completed'
          next.plan = payload.plan || next.plan
          next.durationMs = payload.durationMs
          break
        }
        case 'error': {
          // If still executing, transition to error
          if (next.status !== 'completed') {
            next.status = 'error'
            next.error = payload.message || 'Unknown execution error'
          }
          break
        }
      }
      return next
    })
  }, [])

  const parseSSEChunk = React.useCallback((chunk: string) => {
    // Append to buffer
    bufferRef.current += chunk
    let idx: number
    while ((idx = bufferRef.current.indexOf('\n\n')) !== -1) {
      const rawEvent = bufferRef.current.slice(0, idx)
      bufferRef.current = bufferRef.current.slice(idx + 2)
      // Ignore comments
      if (!rawEvent.trim() || rawEvent.startsWith(':')) continue
      const lines = rawEvent.split('\n')
      let eventName = 'message'
      const dataLines: string[] = []
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim())
        }
      }
      const dataStr = dataLines.join('\n')
      let parsed: any = null
      if (dataStr) {
        try {
          parsed = JSON.parse(dataStr)
        } catch {
          // Non-JSON payload; ignore
        }
      }
      processEvent(eventName, parsed)
      if (eventName === 'completed' || eventName === 'error') {
        // We consider stream finished; abort controller (will cause reader loop to exit)
        if (abortRef.current) abortRef.current.abort()
      }
    }
  }, [processEvent])

  const start = React.useCallback((payload: StartExecutionPayload) => {
    if (!payload.planId && !payload.prompt) {
      throw new Error('start requires planId or prompt')
    }
    // Prevent concurrent starts
    setState(s => {
      if (s.status === 'executing') return s
      return {
        ...s,
        status: 'executing',
        error: undefined,
        artifacts: [],
        durationMs: undefined,
        startedAt: Date.now(),
      }
    })

    // Abort existing if any
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const abortCtrl = new AbortController()
    abortRef.current = abortCtrl
    bufferRef.current = ''

    ;(async () => {
      try {
        const res = await fetch('/api/agent/swarm/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: abortCtrl.signal,
        })
        if (!res.ok || !res.body) {
          processEvent('error', { message: `Execute request failed (${res.status})` })
          return
        }
        const reader = res.body.getReader()
        readerRef.current = reader
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            const text = decoder.decode(value, { stream: true })
            parseSSEChunk(text)
          }
        }
      } catch (e: any) {
        if (abortCtrl.signal.aborted) {
          // Aborted intentionally
          return
        }
        processEvent('error', { message: e?.message || 'Stream error' })
      }
    })()
  }, [parseSSEChunk, processEvent])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort()
    }
  }, [])

  return {
    state,
    start,
    reset,
    abort,
  }
}

/**
 * Returns a HEAD fetcher for artifact metadata (not heavily used yet)
 */
export function useReportHead() {
  return React.useCallback(async (artifactId: string) => {
    const res = await fetch(`/api/reports/${encodeURIComponent(artifactId)}`, {
      method: 'HEAD',
    })
    if (!res.ok) throw new Error('Artifact not found')
    return {
      contentType: res.headers.get('content-type'),
      contentLength: res.headers.get('content-length'),
      filename: res.headers.get('x-artifact-filename'),
    }
  }, [])
}

/**
 * Returns a helper to build download URL for artifact id.
 */
export function useReportDownloadUrl() {
  return React.useCallback((artifactId: string) => {
    return `/api/reports/${encodeURIComponent(artifactId)}`
  }, [])
}
