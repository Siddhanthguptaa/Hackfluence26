import { prisma } from '../../../../lib/prisma'
import { jsonError, jsonSuccess, safeJson } from '../../../../lib/api'
import { AttributionReason, EventType } from '@prisma/client'

type BulkBody = {
  profile_pks?: unknown
  reason?: string
  campaign_id?: unknown
  target?: string // 'FOLLOWED' | 'UNFOLLOWED'
}

const VALID_REASONS: AttributionReason[] = ['DISCOVERY', 'INIT', 'OP_CAMPAIGN']
const VALID_TARGETS = ['FOLLOWED', 'UNFOLLOWED'] as const

function mapTargetToEventType(target: string): EventType {
  // Per implementation plan, targets refer to inbound follower events
  if (target === 'FOLLOWED') return 'FOLLOWED_ME'
  return 'UNFOLLOWED_ME'
}

/**
 * POST /api/attributions/bulk
 * Body: {
 *   profile_pks: number[]
 *   reason: AttributionReason
 *   campaign_id?: number (required if reason = OP_CAMPAIGN)
 *   target: 'FOLLOWED' | 'UNFOLLOWED'
 * }
 *
 * For each profile, finds the latest InteractionEvent of the mapped type
 * (FOLLOWED -> FOLLOWED_ME, UNFOLLOWED -> UNFOLLOWED_ME) and creates an Attribution
 * if one does not already exist for that event. Existing attributions are skipped.
 */
export async function POST(request: Request) {
  const parsed = await safeJson<BulkBody>(request)
  if (!parsed.ok) return parsed.response

  const body = parsed.value

  // Validate profile_pks
  if (!Array.isArray(body.profile_pks) || body.profile_pks.length === 0) {
    return jsonError('profile_pks must be a non-empty array of integers')
  }
  const profile_pks: number[] = []
  for (const v of body.profile_pks) {
    const n = Number(v)
    if (!Number.isInteger(n) || n <= 0) {
      return jsonError('profile_pks must contain only positive integers')
    }
    profile_pks.push(n)
  }

  // Validate reason
  if (!body.reason || !VALID_REASONS.includes(body.reason as AttributionReason)) {
    return jsonError('reason must be one of: ' + VALID_REASONS.join(' | '))
  }
  const reason = body.reason as AttributionReason

  // Validate target
  if (!body.target || !VALID_TARGETS.includes(body.target as any)) {
    return jsonError('target must be one of: FOLLOWED | UNFOLLOWED')
  }
  const target = body.target as (typeof VALID_TARGETS)[number]
  const eventType = mapTargetToEventType(target)

  // Validate / resolve campaign
  let campaignId: number | null = null
  if (reason === 'OP_CAMPAIGN') {
    if (body.campaign_id == null) {
      return jsonError('campaign_id is required when reason = OP_CAMPAIGN')
    }
    const n = Number(body.campaign_id)
    if (!Number.isInteger(n) || n <= 0) {
      return jsonError('campaign_id must be a positive integer')
    }
    campaignId = n
  } else if (body.campaign_id != null) {
    // Disallow extraneous campaign id
    return jsonError('campaign_id only allowed when reason = OP_CAMPAIGN')
  }

  try {
    if (campaignId != null) {
      const campaignExists = await prisma.campaign.findUnique({
        where: { campaign_id: campaignId },
        select: { campaign_id: true },
      })
      if (!campaignExists) {
        return jsonError('Campaign not found', 404)
      }
    }

    // Fetch all relevant events for given profiles of the eventType
    const events = await prisma.interactionEvent.findMany({
      where: {
        profile_pk: { in: profile_pks },
        event_type: eventType,
      },
      orderBy: { event_ts: 'desc' },
      include: {
        attribution: true,
      },
    })

    // Pick the latest (first in order) per profile
    const latestPerProfile = new Map<number, typeof events[number]>()
    for (const e of events) {
      if (!latestPerProfile.has(e.profile_pk)) {
        latestPerProfile.set(e.profile_pk, e)
      }
    }

    const candidateEvents = Array.from(latestPerProfile.values())
    const toCreate = candidateEvents.filter((e) => !e.attribution)

    if (toCreate.length === 0) {
      return jsonSuccess([], {
        summary: {
          requested_profiles: profile_pks.length,
          matched_events: candidateEvents.length,
          already_attributed: candidateEvents.length - toCreate.length,
          created: 0,
          reason,
          target,
        },
        message: 'No new attributions created (all latest events already attributed or no events found)',
      })
    }

    // Prepare data for creation
    const createData = toCreate.map((e) => ({
      event_id: e.event_id,
      reason,
      campaign_id: campaignId,
    }))

    // Use transaction to create all
    const created = await prisma.$transaction(async (tx) => {
      // createMany does not return created rows; use individual create for clarity since volume is limited (bulk selection UI).
      const results = []
      for (const d of createData) {
        results.push(
          await tx.attribution.create({
            data: d,
            include: {
              campaign: true,
              event: true,
            },
          }),
        )
      }
      return results
    })

    return jsonSuccess(created, {
      summary: {
        requested_profiles: profile_pks.length,
        matched_events: candidateEvents.length,
        already_attributed: candidateEvents.length - toCreate.length,
        created: created.length,
        reason,
        target,
      },
    })
  } catch (err: any) {
    return jsonError('Failed to process bulk attribution', 500, { detail: err?.message })
  }
}