import { prisma } from '../../../../lib/prisma'
import { jsonError, jsonSuccess } from '../../../../lib/api'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const dateRange = url.searchParams.get('dateRange') || '30' // days
    const minTagCount = parseInt(url.searchParams.get('minTagCount') || '2')

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(dateRange))

    // Get distinct follower profiles (accounts that followed in the time range)
    const followerProfiles = await prisma.profile.findMany({
      where: {
        interaction_events: {
          some: {
            event_type: 'FOLLOWED_ME',
            event_ts: {
              gte: startDate,
              lte: endDate
            }
          }
        }
      },
      include: {
        tags: {
          include: {
            tag: true
          }
        },
        interaction_events: {
          where: {
            event_type: 'FOLLOWED_ME',
            event_ts: {
              gte: startDate,
              lte: endDate
            }
          },
          orderBy: {
            event_ts: 'desc'
          },
          take: 1
        }
      }
    })

    // Get distinct churner profiles (accounts that unfollowed in the time range)
    const churnerProfiles = await prisma.profile.findMany({
      where: {
        interaction_events: {
          some: {
            event_type: 'UNFOLLOWED_ME',
            event_ts: {
              gte: startDate,
              lte: endDate
            }
          }
        }
      },
      include: {
        tags: {
          include: {
            tag: true
          }
        },
        interaction_events: {
          where: {
            event_type: 'UNFOLLOWED_ME',
            event_ts: {
              gte: startDate,
              lte: endDate
            }
          },
          orderBy: {
            event_ts: 'desc'
          },
          take: 1
        }
      }
    })

    // Count tag occurrences across follower profiles
    const followerTagCounts = new Map<string, number>()
    const followerTagDetails = new Map<string, {
      tag_id: number
      count: number
      auto_assigned_count: number
      manual_count: number
      profiles: string[]
    }>()

    followerProfiles.forEach(profile => {
      profile.tags.forEach(profileTag => {
        const tagName = profileTag.tag.tag_name
        const currentCount = followerTagCounts.get(tagName) || 0
        followerTagCounts.set(tagName, currentCount + 1)

        if (!followerTagDetails.has(tagName)) {
          followerTagDetails.set(tagName, {
            tag_id: profileTag.tag.tag_id,
            count: 0,
            auto_assigned_count: 0,
            manual_count: 0,
            profiles: []
          })
        }

        const details = followerTagDetails.get(tagName)!
        details.count++
        details.profiles.push(profile.current_username)
        
        if (profileTag.auto_assigned) {
          details.auto_assigned_count++
        } else {
          details.manual_count++
        }
      })
    })

    // Count tag occurrences across churner profiles
    const churnerTagCounts = new Map<string, number>()
    const churnerTagDetails = new Map<string, {
      tag_id: number
      count: number
      auto_assigned_count: number
      manual_count: number
      profiles: string[]
    }>()

    churnerProfiles.forEach(profile => {
      profile.tags.forEach(profileTag => {
        const tagName = profileTag.tag.tag_name
        const currentCount = churnerTagCounts.get(tagName) || 0
        churnerTagCounts.set(tagName, currentCount + 1)

        if (!churnerTagDetails.has(tagName)) {
          churnerTagDetails.set(tagName, {
            tag_id: profileTag.tag.tag_id,
            count: 0,
            auto_assigned_count: 0,
            manual_count: 0,
            profiles: []
          })
        }

        const details = churnerTagDetails.get(tagName)!
        details.count++
        details.profiles.push(profile.current_username)
        
        if (profileTag.auto_assigned) {
          details.auto_assigned_count++
        } else {
          details.manual_count++
        }
      })
    })

    // Filter by minimum tag occurrence count and prepare word cloud data
    const followerWordCloudData = Array.from(followerTagCounts.entries())
      .filter(([_, count]) => count >= minTagCount)
      .map(([text, value]) => ({ text, value }))
      .sort((a, b) => b.value - a.value)

    const churnerWordCloudData = Array.from(churnerTagCounts.entries())
      .filter(([_, count]) => count >= minTagCount)
      .map(([text, value]) => ({ text, value }))
      .sort((a, b) => b.value - a.value)

    // Prepare detailed tag lists showing occurrence counts and percentages
    const followerTagList = Array.from(followerTagDetails.entries())
      .filter(([_, details]) => details.count >= minTagCount)
      .map(([tagName, details]) => ({
        tag_name: tagName,
        tag_id: details.tag_id,
        count: details.count,
        auto_assigned_count: details.auto_assigned_count,
        manual_count: details.manual_count,
        percentage: Math.round((details.count / followerProfiles.length) * 100),
        profiles: details.profiles.slice(0, 10) // Limit to first 10 for performance
      }))
      .sort((a, b) => b.count - a.count)

    const churnerTagList = Array.from(churnerTagDetails.entries())
      .filter(([_, details]) => details.count >= minTagCount)
      .map(([tagName, details]) => ({
        tag_name: tagName,
        tag_id: details.tag_id,
        count: details.count,
        auto_assigned_count: details.auto_assigned_count,
        manual_count: details.manual_count,
        percentage: Math.round((details.count / churnerProfiles.length) * 100),
        profiles: details.profiles.slice(0, 10) // Limit to first 10 for performance
      }))
      .sort((a, b) => b.count - a.count)

    // Calculate comparison metrics between follower and churner tag patterns
    const allTags = new Set([
      ...followerTagCounts.keys(),
      ...churnerTagCounts.keys()
    ])

    const comparisonData = Array.from(allTags).map(tagName => {
      const followerCount = followerTagCounts.get(tagName) || 0
      const churnerCount = churnerTagCounts.get(tagName) || 0
      const followerPercentage = followerProfiles.length > 0 ? (followerCount / followerProfiles.length) * 100 : 0
      const churnerPercentage = churnerProfiles.length > 0 ? (churnerCount / churnerProfiles.length) * 100 : 0
      
      return {
        tag_name: tagName,
        follower_count: followerCount,
        churner_count: churnerCount,
        follower_percentage: Math.round(followerPercentage * 100) / 100,
        churner_percentage: Math.round(churnerPercentage * 100) / 100,
        ratio: churnerCount > 0 ? Math.round((followerCount / churnerCount) * 100) / 100 : followerCount > 0 ? Infinity : 0,
        total_count: followerCount + churnerCount
      }
    })
    .filter(item => item.total_count >= minTagCount)
    .sort((a, b) => b.total_count - a.total_count)

    // Summary statistics: distinct profile counts vs tag occurrence metrics
    const summary = {
      total_followers: followerProfiles.length,        // Number of distinct people who followed
      total_churners: churnerProfiles.length,          // Number of distinct people who churned
      total_unique_follower_tags: followerWordCloudData.length, // Number of distinct tags among followers
      total_unique_churner_tags: churnerWordCloudData.length,   // Number of distinct tags among churners
      total_unique_tags: allTags.size,                 // Total distinct tags across both groups
      follower_avg_tags_per_profile: followerProfiles.length > 0 ?
        Math.round((followerProfiles.reduce((sum, p) => sum + p.tags.length, 0) / followerProfiles.length) * 100) / 100 : 0,
      churner_avg_tags_per_profile: churnerProfiles.length > 0 ?
        Math.round((churnerProfiles.reduce((sum, p) => sum + p.tags.length, 0) / churnerProfiles.length) * 100) / 100 : 0,
      date_range: {
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        days: parseInt(dateRange)
      }
    }

    return jsonSuccess({
      summary,
      followers: {
        word_cloud_data: followerWordCloudData,
        tag_list: followerTagList,
        total_profiles: followerProfiles.length
      },
      churners: {
        word_cloud_data: churnerWordCloudData,
        tag_list: churnerTagList,
        total_profiles: churnerProfiles.length
      },
      comparison: comparisonData
    })

  } catch (err: any) {
    return jsonError('Failed to fetch tag analytics', 500, { detail: err?.message })
  }
}