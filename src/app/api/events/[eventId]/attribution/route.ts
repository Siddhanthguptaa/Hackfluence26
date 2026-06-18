import { prisma } from '../../../../../lib/prisma'
import { jsonError, jsonSuccess, safeJson, parseId } from '../../../../../lib/api'
import { AttributionReason } from '@prisma/client'

/**
 * POST /api/events/[eventId]/attribution
 * Body: { reason: AttributionReason; campaign_id?: number }
 *  - If reason = OP_CAMPAIGN then campaign_id is required
 *  - Upsert (create or replace) attribution for the event
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const params = await context.params
  const eventId = parseId(params?.eventId)
  if (!eventId) return jsonError('Invalid eventId', 400)

  const parsed = await safeJson<{ reason?: string; campaign_id?: unknown }>(request)
  if (!parsed.ok) return parsed.response

  const body = parsed.value

  const reasonRaw = body.reason
  if (
    reasonRaw !== 'DISCOVERY' &&
    reasonRaw !== 'INIT' &&
    reasonRaw !== 'OP_CAMPAIGN'
  ) {
    return jsonError('reason must be one of: DISCOVERY | INIT | OP_CAMPAIGN')
  }
  const reason = reasonRaw as AttributionReason

  let campaignId: number | null = null
  if (reason === 'OP_CAMPAIGN') {
    if (body.campaign_id === undefined || body.campaign_id === null) {
      return jsonError('campaign_id is required when reason = OP_CAMPAIGN')
    }
    const n = Number(body.campaign_id)
    if (!Number.isInteger(n) || n <= 0) {
      return jsonError('campaign_id must be a positive integer')
    }
    campaignId = n
  } else if (body.campaign_id != null) {
    // If provided but reason isn't OP_CAMPAIGN, reject to avoid accidental association
    return jsonError('campaign_id only allowed when reason = OP_CAMPAIGN')
  }

  try {
    // Ensure event exists
    const eventExists = await prisma.interactionEvent.findUnique({
      where: { event_id: eventId },
      select: { event_id: true },
    })
    if (!eventExists) {
      return jsonError('Event not found', 404)
    }

    if (campaignId != null) {
      // Verify campaign exists
      const campaignExists = await prisma.campaign.findUnique({
        where: { campaign_id: campaignId },
        select: { campaign_id: true },
      })
      if (!campaignExists) {
        return jsonError('Campaign not found', 404)
      }
    }

    // Upsert via find existing then create/update (since Prisma upsert needs a unique identifier in the target model)
    const existing = await prisma.attribution.findUnique({
      where: { event_id: eventId },
    })

    let attribution
    if (existing) {
      attribution = await prisma.attribution.update({
        where: { event_id: eventId },
        data: {
          reason,
          campaign_id: campaignId,
        },
        include: {
          campaign: true,
          event: true,
        },
      })
    } else {
      attribution = await prisma.attribution.create({
        data: {
          event_id: eventId,
          reason,
          campaign_id: campaignId,
        },
        include: {
          campaign: true,
          event: true,
        },
      })
    }

    return jsonSuccess(attribution)
  } catch (err: any) {
    return jsonError('Failed to upsert attribution', 500, { detail: err?.message })
  }
}

/**
 * DELETE /api/events/[eventId]/attribution
 * Removes attribution for the event if exists
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ eventId: string }> },
) {
  const params = await context.params
  const eventId = parseId(params?.eventId)
  if (!eventId) return jsonError('Invalid eventId', 400)

  try {
    const existing = await prisma.attribution.findUnique({
      where: { event_id: eventId },
      select: { attribution_id: true },
    })
    if (!existing) {
      return jsonError('Attribution not found for event', 404)
    }

    await prisma.attribution.delete({
      where: { event_id: eventId },
    })

    return jsonSuccess({
      message: 'Attribution removed',
      event_id: eventId,
    })
  } catch (err: any) {
    return jsonError('Failed to delete attribution', 500, { detail: err?.message })
  }
}