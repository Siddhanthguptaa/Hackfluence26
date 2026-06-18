import { prisma } from '../../../../lib/prisma'
import { jsonError, jsonSuccess } from '../../../../lib/api'

/**
 * GET /api/profiles/recent
 * Query Params:
 *   - days?: number (defaults to 30)  Window size for "recent" interaction events
 *   - limit?: number (defaults to 100, max 500) Maximum number of profiles returned
 *
 * Returns profiles that have at least one interaction event within the last `days` days.
 * For each profile only the latest qualifying interaction event (within the window) is returned.
 * Includes:
 *  - profile basic fields
 *  - last_event (event_type, event_ts, attribution w/ campaign)
 *  - tags (with auto_assigned flag and tag object)
 *  - summary meta (window_days, cutoff_iso, profile_count)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const daysParam = searchParams.get('days')
    const limitParam = searchParams.get('limit')

    const days = (() => {
      if (!daysParam) return 30
      const n = Number(daysParam)
      if (!Number.isFinite(n) || n <= 0 || n > 365) return 30
      return Math.floor(n)
    })()

    const limit = (() => {
      if (!limitParam) return 100
      const n = Number(limitParam)
      if (!Number.isFinite(n) || n <= 0) return 100
      return Math.min(500, Math.floor(n))
    })()

    const now = new Date()
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

    // Fetch recent interaction events within window ordered newest first
    // Include attribution + campaign and minimal profile info + tags (with auto_assigned)
    const recentEvents = await prisma.interactionEvent.findMany({
      where: {
        event_ts: { gte: cutoff },
      },
      orderBy: { event_ts: 'desc' },
      include: {
        attribution: {
          include: {
            campaign: true,
          },
        },
        profile: {
          select: {
            profile_pk: true,
            current_username: true,
            first_seen_ts: true,
            tags: {
              select: {
                auto_assigned: true,
                tag: true,
              },
            },
          },
        },
      },
      // Overshoot fetch to ensure enough unique profiles if some duplicate
      take: limit * 5,
    })

    if (recentEvents.length === 0) {
      return jsonSuccess(
        {
          data: [],
          summary: {
            window_days: days,
            cutoff_iso: cutoff.toISOString(),
            profile_count: 0,
          },
        },
        {
          message: 'No recent interaction events found in specified window',
        },
      )
    }

    // Deduplicate by profile_pk keeping the first (latest due to ordering)
    const byProfile = new Map<number, typeof recentEvents[number]>()
    for (const ev of recentEvents) {
      if (!byProfile.has(ev.profile.profile_pk)) {
        byProfile.set(ev.profile.profile_pk, ev)
        if (byProfile.size >= limit) break
      }
    }

    const shaped = Array.from(byProfile.values()).map(ev => ({
      profile_pk: ev.profile.profile_pk,
      current_username: ev.profile.current_username,
      first_seen_ts: ev.profile.first_seen_ts,
      tags: ev.profile.tags.map(t => ({
        auto_assigned: t.auto_assigned,
        tag: t.tag,
      })),
      last_event: {
        event_id: ev.event_id,
        event_type: ev.event_type,
        event_ts: ev.event_ts,
        attribution: ev.attribution
          ? {
              reason: ev.attribution.reason,
              campaign: ev.attribution.campaign
                ? {
                    campaign_id: ev.attribution.campaign.campaign_id,
                    campaign_name: ev.attribution.campaign.campaign_name,
                  }
                : null,
            }
          : null,
      },
    }))

    return jsonSuccess(
      {
        data: shaped,
        summary: {
          window_days: days,
          cutoff_iso: cutoff.toISOString(),
          profile_count: shaped.length,
        },
      },
      {
        message: `Returned ${shaped.length} recent profiles (window ${days} days)`,
      },
    )
  } catch (err: any) {
    return jsonError('Failed to fetch recent profiles', 500, {
      detail: err?.message,
    })
  }
}