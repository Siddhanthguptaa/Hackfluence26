import { prisma } from '../../../../lib/prisma'
import { jsonError, jsonSuccess } from '../../../../lib/api'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const campaignId = url.searchParams.get('campaignId')
    const dateRange = url.searchParams.get('dateRange') || '30' // days
    const timeZone = url.searchParams.get('timeZone') || 'UTC'

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(dateRange))

    if (campaignId) {
      // Single campaign analytics
      const campaign = await prisma.campaign.findUnique({
        where: { campaign_id: parseInt(campaignId) },
        include: {
          attributions: {
            include: {
              event: {
                include: {
                  profile: true
                }
              }
            },
            where: {
              event: {
                event_ts: {
                  gte: startDate,
                  lte: endDate
                }
              }
            }
          }
        }
      })

      if (!campaign) {
        return jsonError('Campaign not found', 404)
      }

      // Calculate metrics for this campaign
      const metrics = calculateCampaignMetrics(campaign)
      
      return jsonSuccess({
        campaign,
        metrics,
        timeRange: { startDate, endDate, days: parseInt(dateRange) }
      })
    } else {
      // All campaigns overview analytics
      const campaigns = await prisma.campaign.findMany({
        include: {
          attributions: {
            include: {
              event: {
                include: {
                  profile: true
                }
              }
            },
            where: {
              event: {
                event_ts: {
                  gte: startDate,
                  lte: endDate
                }
              }
            }
          }
        },
        orderBy: { campaign_date: 'desc' }
      })

      // Calculate metrics for all campaigns
      const campaignMetrics = campaigns.map(campaign => ({
        campaign_id: campaign.campaign_id,
        campaign_name: campaign.campaign_name,
        campaign_date: campaign.campaign_date,
        campaign_type: campaign.campaign_type,
        metrics: calculateCampaignMetrics(campaign)
      }))

      // Calculate overall summary metrics
      const totalAttributions = campaigns.reduce((sum, c) => sum + c.attributions.length, 0)
      const totalFollowers = campaigns.reduce((sum, c) => {
        return sum + c.attributions.filter(a => a.event.event_type === 'FOLLOWED_ME').length
      }, 0)
      const totalUnfollowers = campaigns.reduce((sum, c) => {
        return sum + c.attributions.filter(a => a.event.event_type === 'UNFOLLOWED_ME').length
      }, 0)

      const summary = {
        totalCampaigns: campaigns.length,
        totalAttributions,
        totalFollowers,
        totalUnfollowers,
        netGrowth: totalFollowers - totalUnfollowers,
        conversionRate: totalAttributions > 0 ? (totalFollowers / totalAttributions) * 100 : 0
      }

      return jsonSuccess({
        summary,
        campaigns: campaignMetrics,
        timeRange: { startDate, endDate, days: parseInt(dateRange) }
      })
    }
  } catch (err: any) {
    return jsonError('Failed to fetch campaign analytics', 500, { detail: err?.message })
  }
}

function calculateCampaignMetrics(campaign: any) {
  const attributions = campaign.attributions || []
  
  // Basic counts
  const totalAttributions = attributions.length
  const followEvents = attributions.filter((a: any) => a.event.event_type === 'FOLLOWED_ME')
  const unfollowEvents = attributions.filter((a: any) => a.event.event_type === 'UNFOLLOWED_ME')
  
  const followers = followEvents.length
  const unfollowers = unfollowEvents.length
  const netGrowth = followers - unfollowers
  
  // Engagement metrics
  const conversionRate = totalAttributions > 0 ? (followers / totalAttributions) * 100 : 0
  const churnRate = followers > 0 ? (unfollowers / followers) * 100 : 0
  
  // Time-based analysis
  const dailyBreakdown = calculateDailyBreakdown(attributions)
  const peakEngagementDay = findPeakEngagementDay(dailyBreakdown)
  
  // Profile insights
  const uniqueProfiles = new Set(attributions.map((a: any) => a.event.profile_pk)).size
  const avgEventsPerProfile = uniqueProfiles > 0 ? totalAttributions / uniqueProfiles : 0
  
  return {
    totalAttributions,
    followers,
    unfollowers,
    netGrowth,
    conversionRate: Math.round(conversionRate * 100) / 100,
    churnRate: Math.round(churnRate * 100) / 100,
    uniqueProfiles,
    avgEventsPerProfile: Math.round(avgEventsPerProfile * 100) / 100,
    dailyBreakdown,
    peakEngagementDay
  }
}

function calculateDailyBreakdown(attributions: any[]) {
  const dailyData = new Map()
  
  attributions.forEach(attribution => {
    const date = new Date(attribution.event.event_ts).toISOString().split('T')[0]
    if (!dailyData.has(date)) {
      dailyData.set(date, { date, followers: 0, unfollowers: 0, total: 0 })
    }
    
    const dayData = dailyData.get(date)
    dayData.total++
    
    if (attribution.event.event_type === 'FOLLOWED_ME') {
      dayData.followers++
    } else if (attribution.event.event_type === 'UNFOLLOWED_ME') {
      dayData.unfollowers++
    }
  })
  
  return Array.from(dailyData.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function findPeakEngagementDay(dailyBreakdown: any[]) {
  if (dailyBreakdown.length === 0) return null
  
  return dailyBreakdown.reduce((peak, current) => 
    current.total > peak.total ? current : peak
  )
}