export const ATTRIBUTION_REASONS = [
  'OP_CAMPAIGN',
  'DISCOVERY', 
  'INIT',
  'OUTBOUND_FOLLOW',
  'ORGANIC',
  'OTHER'
] as const

export type AttributionReason = typeof ATTRIBUTION_REASONS[number]

export const attributionUtils = {
  requiresCampaign: (reason: string): boolean => {
    return reason === 'OP_CAMPAIGN'
  },

  formatAttribution: (attribution: { 
    reason: string; 
    campaign?: { campaign_name: string } | null;
    campaign_id?: number | null;
  } | null): string => {
    if (!attribution) return 'No attribution'
    
    const { reason, campaign } = attribution
    if (campaign?.campaign_name) {
      return `${reason}: ${campaign.campaign_name}`
    }
    return reason
  }
}