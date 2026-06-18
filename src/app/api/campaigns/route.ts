import { prisma } from '../../../lib/prisma'
import { jsonError, jsonSuccess, safeJson } from '../../../lib/api'
import { CampaignType } from '@prisma/client'

type CampaignCreateBody = {
  campaign_name?: string
  campaign_date?: string
  campaign_type?: CampaignType | string
}

export async function GET() {
  try {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { campaign_date: 'desc' },
    })
    return jsonSuccess(campaigns)
  } catch (err: any) {
    return jsonError('Failed to fetch campaigns', 500, { detail: err?.message })
  }
}

export async function POST(request: Request) {
  const parsed = await safeJson<CampaignCreateBody>(request)
  if (!parsed.ok) return parsed.response

  const { campaign_name, campaign_date, campaign_type } = parsed.value

  if (!campaign_name || typeof campaign_name !== 'string' || !campaign_name.trim()) {
    return jsonError('campaign_name is required')
  }
  if (!campaign_date || isNaN(Date.parse(campaign_date))) {
    return jsonError('campaign_date must be a valid date string (ISO recommended)')
  }

  let typeValue: CampaignType
  if (campaign_type === 'CONTENT' || campaign_type === 'OUTBOUND_FOLLOW') {
    typeValue = campaign_type
  } else if (campaign_type == null) {
    typeValue = 'CONTENT'
  } else {
    return jsonError('campaign_type must be one of: CONTENT | OUTBOUND_FOLLOW')
  }

  try {
    const created = await prisma.campaign.create({
      data: {
        campaign_name: campaign_name.trim(),
        campaign_date: new Date(campaign_date),
        campaign_type: typeValue,
      },
    })
    return jsonSuccess(created, undefined, { status: 201 })
  } catch (err: any) {
    if (err.code === 'P2002') {
      return jsonError('A campaign with that name already exists', 409)
    }
    return jsonError('Failed to create campaign', 500, { detail: err?.message })
  }
}