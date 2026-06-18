/**
 * query_local_database Tool
 *
 * PURPOSE:
 *   Safely expose allowlisted analytical intents over the local Prisma database
 *   without ever letting raw natural language be interpolated into a query.
 *
 * INTENTS (Phase 2):
 *   - recent_profiles
 *       Params:
 *         limit?: number (default 100)
 *   - recent_gaming_profiles
 *       Params:
 *         limit?: number (default 100)
 *         tag?: string (default 'gaming')
 *   - profiles_with_tag
 *       Params:
 *         tag: string (required)
 *         limit?: number (default 200)
 *   - top_profiles_by_campaign
 *       Params:
 *         campaign: string (required, case-insensitive contains match)
 *         limit?: number (default 50)
 *   - high_engagement_recent
 *       Params:
 *         days?: number (default 30)
 *         limit?: number (default 100)
 *   - profile_by_username
 *       Params:
 *         username: string (required)
 *
 * RETURN SHAPE:
 *   {
 *     intent: string
 *     rows: QueryResultRow[]
 *     rowCount: number
 *     truncated: boolean
 *     warning?: string
 *     meta: { intent, appliedLimit, originalLimit?, paramsEcho: any }
 *   }
 *
 * SAFETY / GUARDRAILS:
 *   - Hard cap (SOFT_LIMIT_CAP) for any limit passed by user / model.
 *   - Only enumerated intents accepted.
 *   - Throws QueryToolError with code classification for orchestrator handling.
 *   - NO raw SQL. Only Prisma Client fluent API.
 *
 * FUTURE:
 *   - More sophisticated ranking / scoring.
 *   - Pagination support.
 *   - Parallelization / streaming for very large sets.
 */

import { prisma } from '../../prisma'
// StepKind import removed (currently unused to avoid lint error)
// import { StepKind } from '../types'

/* ---------------------------------- *
 * Types
 * ---------------------------------- */

export interface QueryResultRow {
  current_username: string
  followers_count?: number          // count of FOLLOWED_ME events (if computed)
  unfollowers_count?: number        // count of UNFOLLOWED_ME events (if computed)
  last_event_ts?: string | null
  first_seen_ts?: string
  campaign_names?: string[]         // for campaign related intent
  tag_names?: string[]
  is_active_follower?: boolean
  is_currently_following?: boolean
}

export interface QueryToolResult {
  intent: string
  rows: QueryResultRow[]
  rowCount: number
  truncated: boolean
  warning?: string
  meta: Record<string, any>
}

export class QueryToolError extends Error {
  code:
    | 'INTENT_UNKNOWN'
    | 'INVALID_PARAM'
    | 'INTERNAL'
    | 'NOT_FOUND'
  constructor(code: QueryToolError['code'], message: string) {
    super(message)
    this.name = 'QueryToolError'
    this.code = code
  }
}

/* ---------------------------------- *
 * Constants / Limits
 * ---------------------------------- */

const DEFAULT_LIMITS: Record<string, number> = {
  recent_profiles: 100,
  recent_gaming_profiles: 100,
  profiles_with_tag: 200,
  top_profiles_by_campaign: 50,
  high_engagement_recent: 100,
  profile_by_username: 1,
}

const SOFT_LIMIT_CAP = 10_000

/* ---------------------------------- *
 * Debug Logging
 * ---------------------------------- */

function debugLog(...args: any[]) {
  if (process.env.AGENT_DEBUG === '1') {
    // eslint-disable-next-line no-console
    console.log('[AGENT_QUERY]', ...args)
  }
}

/* ---------------------------------- *
 * Utility Helpers
 * ---------------------------------- */

function coerceLimit(intent: string, maybe: any): { applied: number; original?: number; truncated: boolean; warning?: string } {
  const base = DEFAULT_LIMITS[intent] || 100
  let original: number | undefined
  let applied = base
  let truncated = false
  let warning: string | undefined
  if (maybe !== undefined && maybe !== null) {
    const n = Number(maybe)
    if (!Number.isFinite(n) || n <= 0) {
      throw new QueryToolError('INVALID_PARAM', `limit must be positive integer (got ${maybe})`)
    }
    original = n
    applied = Math.min(n, SOFT_LIMIT_CAP)
    if (n > SOFT_LIMIT_CAP) {
      truncated = true
      warning = `Requested limit ${n} exceeds cap ${SOFT_LIMIT_CAP}; using ${applied}`
    }
  }
  return { applied, original, truncated, warning }
}

async function fetchProfileIdsWithCampaign(campaign: string, limit: number): Promise<number[]> {
  // Find events attributed to campaigns matching campaign name
  // We first find matching campaign ids (contains - case insensitive)
  const campaigns = await prisma.campaign.findMany({
    where: {
      campaign_name: {
        contains: campaign,
      },
    },
    select: { campaign_id: true },
  })
  if (!campaigns.length) {
    return []
  }
  const campaignIds = campaigns.map((c: { campaign_id: number }) => c.campaign_id)

  // Find events with attribution referencing these campaigns
  const events = await prisma.attribution.findMany({
    where: {
      campaign_id: { in: campaignIds },
    },
    select: {
      event: {
        select: {
          profile_pk: true,
        },
      },
    },
    take: limit * 5, // heuristic oversampling before collapsing unique
  })

  const profilePkSet = new Set<number>()
  for (const e of events) {
    if (e.event?.profile_pk) profilePkSet.add(e.event.profile_pk)
    if (profilePkSet.size >= limit * 3) break
  }
  return Array.from(profilePkSet.values())
}

async function computeEngagementMetrics(profilePks: number[], days: number) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const events = await prisma.interactionEvent.findMany({
    where: {
      profile_pk: { in: profilePks },
      event_ts: { gte: since },
    },
    select: {
      profile_pk: true,
      event_type: true,
      event_ts: true,
    },
  })

  const metrics = new Map<number, {
    followers: number
    unfollowers: number
    lastTs: Date | null
  }>()

  for (const ev of events) {
    let rec = metrics.get(ev.profile_pk)
    if (!rec) {
      rec = { followers: 0, unfollowers: 0, lastTs: null }
      metrics.set(ev.profile_pk, rec)
    }
    if (ev.event_type === 'FOLLOWED_ME') rec.followers++
    else if (ev.event_type === 'UNFOLLOWED_ME') rec.unfollowers++
    if (!rec.lastTs || rec.lastTs < ev.event_ts) rec.lastTs = ev.event_ts
  }
  return metrics
}

async function loadProfilesBasic(profilePks: number[]): Promise<Record<number, QueryResultRow>> {
  if (!profilePks.length) return {}
  const profs = await prisma.profile.findMany({
    where: { profile_pk: { in: profilePks } },
    include: {
      tags: {
        include: { tag: true },
      },
    },
  })
  const map: Record<number, QueryResultRow> = {}
  for (const p of profs) {
    map[p.profile_pk] = {
      current_username: p.current_username,
      first_seen_ts: p.first_seen_ts.toISOString(),
      is_active_follower: p.is_active_follower,
      is_currently_following: p.is_currently_following,
      tag_names: p.tags.map((t: any) => t.tag.tag_name),
    }
  }
  return map
}

/* ---------------------------------- *
 * Intent Implementations
 * ---------------------------------- */

async function intent_recent_profiles(params: any, limit: number): Promise<QueryResultRow[]> {
  const rows = await prisma.profile.findMany({
    orderBy: { first_seen_ts: 'desc' },
    take: limit,
    include: {
      tags: { include: { tag: true } },
      interaction_events: {
        orderBy: { event_ts: 'desc' },
        take: 1,
        select: { event_ts: true },
      },
    },
  })
  return rows.map((p: any) => ({
    current_username: p.current_username,
    first_seen_ts: p.first_seen_ts.toISOString(),
    last_event_ts: p.interaction_events[0]?.event_ts?.toISOString() || null,
    tag_names: p.tags.map((t: any) => t.tag.tag_name),
    is_active_follower: p.is_active_follower,
    is_currently_following: p.is_currently_following,
  }))
}

async function intent_recent_gaming_profiles(params: any, limit: number): Promise<QueryResultRow[]> {
  const tagName = typeof params?.tag === 'string' && params.tag.trim() ? params.tag.trim() : 'gaming'
  const rows = await prisma.profile.findMany({
    where: {
      tags: {
        some: {
          tag: { tag_name: { equals: tagName } },
        },
      },
    },
    orderBy: { first_seen_ts: 'desc' },
    take: limit,
    include: {
      tags: { include: { tag: true } },
    },
  })
  return rows.map((p: any) => ({
    current_username: p.current_username,
    first_seen_ts: p.first_seen_ts.toISOString(),
    tag_names: p.tags.map((t: any) => t.tag.tag_name),
    is_active_follower: p.is_active_follower,
    is_currently_following: p.is_currently_following,
  }))
}

async function intent_profiles_with_tag(params: any, limit: number): Promise<QueryResultRow[]> {
  const tag = typeof params?.tag === 'string' ? params.tag.trim() : ''
  if (!tag) throw new QueryToolError('INVALID_PARAM', 'profiles_with_tag requires "tag" parameter')
  const rows = await prisma.profile.findMany({
    where: {
      tags: {
        some: {
          tag: { tag_name: { equals: tag } },
        },
      },
    },
    orderBy: { first_seen_ts: 'desc' },
    take: limit,
    include: { tags: { include: { tag: true } } },
  })
  return rows.map((p: any) => ({
    current_username: p.current_username,
    first_seen_ts: p.first_seen_ts.toISOString(),
    tag_names: p.tags.map((t: any) => t.tag.tag_name),
  }))
}

async function intent_top_profiles_by_campaign(params: any, limit: number): Promise<QueryResultRow[]> {
  const campaign = typeof params?.campaign === 'string' ? params.campaign.trim() : ''
  if (!campaign) throw new QueryToolError('INVALID_PARAM', 'top_profiles_by_campaign requires "campaign" parameter')

  const profileIds = await fetchProfileIdsWithCampaign(campaign, limit)
  if (!profileIds.length) return []

  // Load profiles (oversampling done earlier, we slice later)
  const profileMap = await loadProfilesBasic(profileIds)

  // Engagement metrics for ranking: use follower events counts across entire history for simplicity
  const events = await prisma.interactionEvent.findMany({
    where: { profile_pk: { in: profileIds } },
    select: { profile_pk: true, event_type: true },
  })

  const counters = new Map<number, { followers: number; unfollowers: number }>()
  for (const ev of events) {
    let rec = counters.get(ev.profile_pk)
    if (!rec) {
      rec = { followers: 0, unfollowers: 0 }
      counters.set(ev.profile_pk, rec)
    }
    if (ev.event_type === 'FOLLOWED_ME') rec.followers++
    else if (ev.event_type === 'UNFOLLOWED_ME') rec.unfollowers++
  }

  const rows: QueryResultRow[] = []
  for (const pk of profileIds) {
    const base = profileMap[pk]
    if (!base) continue
    const c = counters.get(pk)
    rows.push({
      ...base,
      followers_count: c?.followers || 0,
      unfollowers_count: c?.unfollowers || 0,
    })
  }

  rows.sort((a, b) => (b.followers_count || 0) - (a.followers_count || 0))
  return rows.slice(0, limit)
}

async function intent_high_engagement_recent(params: any, limit: number): Promise<QueryResultRow[]> {
  const days = Number(params?.days ?? 30)
  if (!Number.isFinite(days) || days <= 0 || days > 365) {
    throw new QueryToolError('INVALID_PARAM', 'high_engagement_recent "days" must be 1..365')
  }

  // Strategy:
  //  1. Find recent events within timeframe.
  //  2. Count per profile.
  //  3. Take top by (followers - unfollowers) or by total events if tie.
  const since = new Date()
  since.setDate(since.getDate() - days)

  const events = await prisma.interactionEvent.findMany({
    where: {
      event_ts: { gte: since },
    },
    select: { profile_pk: true, event_type: true, event_ts: true },
  })

  const metrics = new Map<number, {
    total: number
    followers: number
    unfollowers: number
    lastTs: Date | null
  }>()

  for (const ev of events) {
    let rec = metrics.get(ev.profile_pk)
    if (!rec) {
      rec = { total: 0, followers: 0, unfollowers: 0, lastTs: null }
      metrics.set(ev.profile_pk, rec)
    }
    rec.total++
    if (ev.event_type === 'FOLLOWED_ME') rec.followers++
    else if (ev.event_type === 'UNFOLLOWED_ME') rec.unfollowers++
    if (!rec.lastTs || rec.lastTs < ev.event_ts) rec.lastTs = ev.event_ts
  }

  const ranked = Array.from(metrics.entries())
    .map(([pk, m]) => ({
      profile_pk: pk,
      score: m.followers - m.unfollowers,
      followers: m.followers,
      unfollowers: m.unfollowers,
      total: m.total,
      lastTs: m.lastTs,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.followers !== a.followers) return b.followers - a.followers
      return b.total - a.total
    })
    .slice(0, limit)

  const profileMap = await loadProfilesBasic(ranked.map(r => r.profile_pk))

  return ranked.map(r => {
    const base = profileMap[r.profile_pk]
    return {
      ...base,
      followers_count: r.followers,
      unfollowers_count: r.unfollowers,
      last_event_ts: r.lastTs?.toISOString() || null,
    }
  })
}

async function intent_profile_by_username(params: any, limit: number): Promise<QueryResultRow[]> {
  const username = typeof params?.username === 'string' ? params.username.trim() : ''
  if (!username) throw new QueryToolError('INVALID_PARAM', 'profile_by_username requires "username" parameter')
  
  console.log(`[DEBUG] Searching for profile with username: "${username}"`)
  
  const rows = await prisma.profile.findMany({
    where: {
      current_username: {
        contains: username
      }
    },
    orderBy: { first_seen_ts: 'desc' },
    take: limit,
    include: {
      tags: { include: { tag: true } },
      interaction_events: {
        orderBy: { event_ts: 'desc' },
        take: 1,
        select: { event_ts: true },
      },
    },
  })
  
  console.log(`[DEBUG] Found ${rows.length} profiles matching "${username}":`, rows.map(r => r.current_username))
  
  return rows.map((p: any) => ({
    current_username: p.current_username,
    first_seen_ts: p.first_seen_ts.toISOString(),
    last_event_ts: p.interaction_events[0]?.event_ts?.toISOString() || null,
    tag_names: p.tags.map((t: any) => t.tag.tag_name),
    is_active_follower: p.is_active_follower,
    is_currently_following: p.is_currently_following,
  }))
}

/* ---------------------------------- *
 * Dispatcher
 * ---------------------------------- */

const INTENT_DISPATCH: Record<string, (params: any, limit: number) => Promise<QueryResultRow[]>> = {
  recent_profiles: intent_recent_profiles,
  recent_gaming_profiles: intent_recent_gaming_profiles,
  profiles_with_tag: intent_profiles_with_tag,
  top_profiles_by_campaign: intent_top_profiles_by_campaign,
  high_engagement_recent: intent_high_engagement_recent,
  profile_by_username: intent_profile_by_username,
}

export interface QueryLocalDatabaseParams {
  intent: string
  limit?: number
  filters?: Record<string, any>  // model produced or user refined
}

/**
 * Main entrypoint used by Data Query Agent.
 */
export async function queryLocalDatabase(params: QueryLocalDatabaseParams): Promise<QueryToolResult> {
  const { intent } = params
  if (!intent || typeof intent !== 'string') {
    throw new QueryToolError('INVALID_PARAM', 'intent is required')
  }

  const handler = INTENT_DISPATCH[intent]
  if (!handler) {
    throw new QueryToolError('INTENT_UNKNOWN', `Unknown intent: ${intent}`)
  }

  const { applied, original, truncated, warning } = coerceLimit(intent, params.limit)

  debugLog('dispatch', { intent, limit: applied, originalLimit: original, truncated })

  try {
    const rows = await handler(params.filters || params, applied)
    return {
      intent,
      rows,
      rowCount: rows.length,
      truncated: truncated || rows.length > applied,
      warning,
      meta: {
        intent,
        appliedLimit: applied,
        originalLimit: original,
        paramsEcho: { ...params },
      },
    }
  } catch (e: any) {
    if (e instanceof QueryToolError) throw e
    debugLog('internal-error', e?.message)
    throw new QueryToolError('INTERNAL', e?.message || 'Internal query error')
  }
}

/* ---------------------------------- *
 * Lightweight Agent Wrapper (Data Query Agent)
 * ---------------------------------- */

export interface DataQueryAgentInput {
  stepId: string
  intent: string
  limit?: number
  filters?: Record<string, any>
}

export interface DataQueryAgentOutput extends QueryToolResult {
  stepId: string
}

export async function runDataQueryAgent(input: DataQueryAgentInput): Promise<DataQueryAgentOutput> {
  const result = await queryLocalDatabase({
    intent: input.intent,
    limit: input.limit,
    filters: input.filters,
  })
  return {
    stepId: input.stepId,
    ...result,
  }
}

// Export list of allowed intents for planner reference / testing
export const ALLOWED_QUERY_INTENTS = Object.keys(INTENT_DISPATCH)