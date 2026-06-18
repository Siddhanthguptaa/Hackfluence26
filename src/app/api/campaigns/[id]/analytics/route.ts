import { prisma } from '../../../../../lib/prisma'
import { jsonError, jsonSuccess } from '../../../../../lib/api'

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const campaignId = parseInt(id)
    
    console.log('Analytics API called with campaign ID:', campaignId)

    if (isNaN(campaignId)) {
      console.log('Invalid campaign ID provided:', id)
      return jsonError('Invalid campaign ID', 400)
    }

    // Get campaign with attributions and related profile data
    const campaign = await prisma.campaign.findUnique({
      where: { campaign_id: campaignId },
      include: {
        attributions: {
          include: {
            event: {
              include: {
                profile: {
                  include: {
                    tags: {
                      include: {
                        tag: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    })

    if (!campaign) {
      console.log('Campaign not found for ID:', campaignId)
      return jsonError('Campaign not found', 404)
    }
    
    console.log('Found campaign:', campaign.campaign_name)
    console.log('Number of attributions:', campaign.attributions.length)

    // Separate followers and churns
    const followers = campaign.attributions.filter((attr: any) => attr.event.event_type === 'FOLLOWED_ME')
    const churns = campaign.attributions.filter((attr: any) => attr.event.event_type === 'UNFOLLOWED_ME')
    
    console.log('Followers count:', followers.length)
    console.log('Churns count:', churns.length)

    // Extract tags from followers and churns
    const followerTags = new Map<string, number>()
    const churnTags = new Map<string, number>()

    followers.forEach((attr: any) => {
      const profile = attr.event.profile
      profile.tags.forEach((profileTag: any) => {
        const tagName = profileTag.tag.tag_name
        followerTags.set(tagName, (followerTags.get(tagName) || 0) + 1)
      })
    })

    churns.forEach((attr: any) => {
      const profile = attr.event.profile
      profile.tags.forEach((profileTag: any) => {
        const tagName = profileTag.tag.tag_name
        churnTags.set(tagName, (churnTags.get(tagName) || 0) + 1)
      })
    })

    // Calculate tag percentages
    const totalFollowers = followers.length
    const totalChurns = churns.length

    const followerTagStats = Array.from(followerTags.entries()).map(([tagName, count]) => ({
      tag: tagName,
      count,
      percentage: totalFollowers > 0 ? Math.round((count / totalFollowers) * 100) : 0
    })).sort((a, b) => b.percentage - a.percentage)

    const churnTagStats = Array.from(churnTags.entries()).map(([tagName, count]) => ({
      tag: tagName,
      count,
      percentage: totalChurns > 0 ? Math.round((count / totalChurns) * 100) : 0
    })).sort((a, b) => b.percentage - a.percentage)

    // Create follower profiles with their tags
    const followerProfiles = followers.map((attr: any) => ({
      username: attr.event.profile.current_username,
      tags: attr.event.profile.tags.map((profileTag: any) => profileTag.tag.tag_name)
    }))

    // Create churn profiles with their tags
    const churnProfiles = churns.map((attr: any) => ({
      username: attr.event.profile.current_username,
      tags: attr.event.profile.tags.map((profileTag: any) => profileTag.tag.tag_name)
    }))

    const result = {
      campaign: {
        campaign_id: campaign.campaign_id,
        campaign_name: campaign.campaign_name,
        campaign_date: campaign.campaign_date,
        campaign_type: campaign.campaign_type
      },
      followerTags: followerTagStats,
      churnTags: churnTagStats,
      followerProfiles,
      churnProfiles,
      totalFollowers,
      totalChurns,
      netGrowth: totalFollowers - totalChurns
    }
    
    console.log('Returning analytics result:', JSON.stringify(result, null, 2))
    return jsonSuccess(result)

  } catch (err: any) {
    console.error('Error fetching campaign analytics:', err)
    return jsonError('Failed to fetch campaign analytics', 500, { detail: err?.message })
  }
}
