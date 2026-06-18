import { prisma } from '../../../../lib/prisma'
import { jsonError, jsonSuccess, safeJson, parseId } from '../../../../lib/api'
import { CampaignType } from '@prisma/client'

// PATCH /api/campaigns/[id]
// Body: { campaign_name?: string; campaign_date?: string; campaign_type?: CampaignType }
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params
  const id = parseId(params?.id)
  if (!id) return jsonError('Invalid campaign id', 400)

  const parsed = await safeJson<Partial<{
    campaign_name: string
    campaign_date: string
    campaign_type: CampaignType | string
  }>>(request)
  if (!parsed.ok) return parsed.response

  const body = parsed.value

  if (!body || Object.keys(body).length === 0) {
    return jsonError('Provide at least one field to update (campaign_name, campaign_date, campaign_type)')
  }

  const data: any = {}

  if (body.campaign_name !== undefined) {
    if (typeof body.campaign_name !== 'string' || !body.campaign_name.trim()) {
      return jsonError('campaign_name must be a non-empty string')
    }
    data.campaign_name = body.campaign_name.trim()
  }

  if (body.campaign_date !== undefined) {
    if (!body.campaign_date || isNaN(Date.parse(body.campaign_date))) {
      return jsonError('campaign_date must be a valid date string')
    }
    data.campaign_date = new Date(body.campaign_date)
  }

  if (body.campaign_type !== undefined) {
    if (body.campaign_type === 'CONTENT' || body.campaign_type === 'OUTBOUND_FOLLOW') {
      data.campaign_type = body.campaign_type
    } else {
      return jsonError('campaign_type must be one of: CONTENT | OUTBOUND_FOLLOW')
    }
  }

  try {
    const updated = await prisma.campaign.update({
      where: { campaign_id: id },
      data,
    })
    return jsonSuccess(updated)
  } catch (err: any) {
    if (err.code === 'P2025') {
      return jsonError('Campaign not found', 404)
    }
    if (err.code === 'P2002') {
      return jsonError('A campaign with that name already exists', 409)
    }
    return jsonError('Failed to update campaign', 500, { detail: err?.message })
  }
}

// DELETE /api/campaigns/[id]
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params
  const id = parseId(params?.id)
  if (!id) return jsonError('Invalid campaign id', 400)

  try {
    // Check for existing attributions referencing this campaign
    const attrCount = await prisma.attribution.count({
      where: { campaign_id: id },
    })
    if (attrCount > 0) {
      return jsonError(
        'Cannot delete campaign with existing attributions. Reassign or remove attributions first.',
        409,
        { attribution_count: attrCount },
      )
    }

    await prisma.campaign.delete({
      where: { campaign_id: id },
    })

    return jsonSuccess({
      message: 'Campaign deleted',
      campaign_id: id,
    })
  } catch (err: any) {
    if (err.code === 'P2025') {
      return jsonError('Campaign not found', 404)
    }
    return jsonError('Failed to delete campaign', 500, { detail: err?.message })
  }
}