import { prisma } from '../../../lib/prisma'
import { jsonError, jsonSuccess, paginationMeta } from '../../../lib/api'

/**
 * Query parameters:
 *  - search: string (matches current_username or historical usernames)
 *  - status: one of (All|Follower|Following|Mutual|Pending|None) - case insensitive
 *  - page: 1-based page number (default 1)
 *  - pageSize: items per page (default 20, max 100)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)

    const rawSearch = searchParams.get('search')?.trim() || ''
    const rawStatus = (searchParams.get('status') || 'All').toLowerCase()
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10) || 20),
    )

    // Build base where clause
    const where: any = {}

    // Search filter (SQLite does not support case-insensitive `mode` argument on string filters)
    // NOTE: This will be case-sensitive. For true case-insensitive search we could:
    //  - Add a lowercase shadow column and store lowercase usernames, OR
    //  - Switch to a provider that supports `mode: 'insensitive'`.
    if (rawSearch) {
      where.OR = [
        {
          current_username: {
            contains: rawSearch,
          },
        },
        {
          username_history: {
            some: {
              username: {
                contains: rawSearch,
              },
            },
          },
        },
      ]
    }

    // Status filter mapping (semantic definitions):
    // follower  = they follow me AND I do NOT follow them back
    // following = I follow them AND they do NOT follow me back
    // mutual    = both follow each other
    // pending   = I have an outstanding follow request
    // none      = all flags false
    switch (rawStatus) {
      case 'follower':
        where.is_active_follower = true
        where.is_currently_following = false
        break
      case 'following':
        where.is_currently_following = true
        where.is_active_follower = false
        break
      case 'mutual':
        where.is_active_follower = true
        where.is_currently_following = true
        break
      case 'pending':
        where.is_pending_outbound_request = true
        break
      case 'none':
        where.is_active_follower = false
        where.is_currently_following = false
        where.is_pending_outbound_request = false
        break
      case 'all':
      default:
        break
    }

    // We need to sort by:
    // 1) Last interaction timestamp (desc, nulls last)
    // 2) first_seen_ts (desc)
    // 3) current_username (asc)
    //
    // Prisma cannot directly order by related record's max(event_ts) while also selecting only first event,
    // so we:
    //  - Fetch all matching profiles (unpaginated)
    //  - Fetch all interaction events for those profiles ordered by event_ts desc
    //  - Build a map of latest event per profile
    //  - Attach a synthetic interaction_events:[{event_type,event_ts}] to each profile (frontend expects this shape)
    //  - Sort in memory using required precedence
    //  - Paginate the sorted list
    //
    // NOTE: For large datasets, optimize with a materialized last_event_ts column or a raw SQL aggregation.

    const allProfiles = await prisma.profile.findMany({
      where,
      select: {
        profile_pk: true,
        current_username: true,
        first_seen_ts: true,
        notes: true,
        is_active_follower: true,
        is_currently_following: true,
        is_pending_outbound_request: true,
        tags: {
          select: {
            auto_assigned: true,
            tag: true,
          },
        },
      },
    })

    const total = allProfiles.length

    let latestEventsMap = new Map<number, { event_type: string; event_ts: string; attribution?: { reason: string | null; campaign_name?: string | null } }>()

    if (total > 0) {
      const profileIds = allProfiles.map(p => p.profile_pk)
      const events = await prisma.interactionEvent.findMany({
        where: { profile_pk: { in: profileIds } },
        orderBy: { event_ts: 'desc' },
        select: {
          profile_pk: true,
          event_type: true,
          event_ts: true,
          attribution: {
            select: {
              reason: true,
              campaign: {
                select: {
                  campaign_name: true,
                },
              },
            },
          },
        },
      })

      for (const ev of events) {
        if (!latestEventsMap.has(ev.profile_pk)) {
          latestEventsMap.set(ev.profile_pk, {
            event_type: ev.event_type,
            event_ts: ev.event_ts.toISOString(),
            attribution: ev.attribution
              ? {
                  reason: ev.attribution.reason,
                  campaign_name: ev.attribution.campaign?.campaign_name || null,
                }
              : undefined,
          })
        }
      }
    }

    const enriched = allProfiles.map(p => {
      const latest = latestEventsMap.get(p.profile_pk)
      return {
        ...p,
        interaction_events: latest
          ? [{
              event_type: latest.event_type,
              event_ts: latest.event_ts,
              attribution: latest.attribution
                ? {
                    reason: latest.attribution.reason,
                    campaign: latest.attribution.campaign_name
                      ? { campaign_name: latest.attribution.campaign_name }
                      : null,
                  }
                : null,
            }]
          : [],
      }
    })

    enriched.sort((a, b) => {
      const aEvt = a.interaction_events[0]?.event_ts
      const bEvt = b.interaction_events[0]?.event_ts

      if (aEvt && bEvt) {
        if (aEvt > bEvt) return -1
        if (aEvt < bEvt) return 1
      } else if (aEvt && !bEvt) {
        return -1
      } else if (!aEvt && bEvt) {
        return 1
      }

      if (a.first_seen_ts > b.first_seen_ts) return -1
      if (a.first_seen_ts < b.first_seen_ts) return 1

      if (a.current_username < b.current_username) return -1
      if (a.current_username > b.current_username) return 1
      return 0
    })

    const start = (page - 1) * pageSize
    const paged = enriched.slice(start, start + pageSize)

    const paginationData = paginationMeta(page, pageSize, total)

    return jsonSuccess({
      data: paged,
      total,
      page,
      pageSize,
      totalPages: paginationData.totalPages
    }, {
      pagination: paginationData,
      filters: {
        search: rawSearch || null,
        status: rawStatus,
      },
    })
  } catch (err: any) {
    return jsonError('Failed to fetch profiles', 500, { detail: err?.message })
  }
}