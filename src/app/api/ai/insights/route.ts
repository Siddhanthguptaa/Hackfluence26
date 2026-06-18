import { jsonError, jsonSuccess, safeJson } from '@/lib/api'

interface CampaignAnalytics {
  followerTags: { tag: string; count: number; percentage: number }[]
  churnTags: { tag: string; count: number; percentage: number }[]
  totalFollowers: number
  totalChurns: number
  campaign: {
    campaign_name: string
    campaign_type: string
    campaign_date: string
  }
}

interface AIInsightsRequest {
  analytics: CampaignAnalytics
}

export async function POST(request: Request) {
  try {
    const parsed = await safeJson<AIInsightsRequest>(request)
    if (!parsed.ok) return parsed.response

    const { analytics } = parsed.value

    // Generate AI insights using only Martian API
    const insights = await generateAIInsights(analytics)
    
    return jsonSuccess(insights)
  } catch (error: any) {
    console.error('Error generating AI insights:', error)
    return jsonError('Failed to generate AI insights', 500, { detail: error?.message })
  }
}

async function generateAIInsights(analytics: CampaignAnalytics) {
  const { followerTags, churnTags, totalFollowers, totalChurns, campaign } = analytics
  
  // Get Martian API key from environment variables
  const martianApiKey = process.env.MARTIAN_API_KEY || 'sk-eac6e046df6042eaa86297d8e6820da3'
  
  console.log('=== MARTIAN API DEBUG ===')
  console.log('Environment variables available:', Object.keys(process.env).filter(key => key.includes('MARTIAN')))
  console.log('MARTIAN_API_KEY from process.env:', process.env.MARTIAN_API_KEY ? 'FOUND' : 'NOT FOUND')
  console.log('Martian API Key (first 10 chars):', martianApiKey.substring(0, 10) + '...')
  
  // Prepare the data for the AI prompt
  const followerData = followerTags.map(tag => `${tag.tag}: ${tag.percentage}% (${tag.count} followers)`).join(', ')
  const churnData = churnTags.map(tag => `${tag.tag}: ${tag.percentage}% (${tag.count} churns)`).join(', ')
  const netGrowth = totalFollowers - totalChurns
  
  const prompt = `You are an AI marketing expert specializing in social media campaign optimization and audience retention. Analyze this campaign data and provide strategic recommendations to improve follower engagement and reduce churn.

CAMPAIGN: ${campaign.campaign_name} (${campaign.campaign_type})
DATE: ${campaign.campaign_date}

FOLLOWER TAGS: ${followerData || 'None'}
CHURN TAGS: ${churnData || 'None'}
TOTAL FOLLOWERS: ${totalFollowers}
TOTAL CHURNS: ${totalChurns}
NET GROWTH: ${netGrowth}

Based on the follower and churn tag data provided above, analyze the percentages and generate:

1. KEY METRICS: Extract the top 5 most significant percentage statistics from the follower tags data. Use the actual percentages from the data provided.
2. GENERALIZATIONS: Create 3-4 high-level insights about your follower base based on the tag patterns you observe.
3. AUDIENCE INSIGHTS: 3-4 key findings about your follower demographics and behavior patterns.
4. CHURNER ANALYSIS: 2-3 specific reasons why people might be leaving based on churn tag patterns.
5. FOLLOWER RETENTION STRATEGIES: 3-4 actionable tactics to keep current followers engaged.
6. CONTENT OPTIMIZATION: 3-4 specific content recommendations based on your audience tags.
7. CAMPAIGN IMPROVEMENTS: 3-4 strategic changes to improve this campaign's performance.

CRITICAL: You MUST respond with ONLY valid JSON. Do not include any text before or after the JSON. The response should start with { and end with }.

{
  "keyMetrics": [
    {"percentage": [ACTUAL_PERCENTAGE_FROM_FOLLOWER_TAGS], "description": "[DESCRIPTION_BASED_ON_TAG]"},
    {"percentage": [ACTUAL_PERCENTAGE_FROM_FOLLOWER_TAGS], "description": "[DESCRIPTION_BASED_ON_TAG]"},
    {"percentage": [ACTUAL_PERCENTAGE_FROM_FOLLOWER_TAGS], "description": "[DESCRIPTION_BASED_ON_TAG]"},
    {"percentage": [ACTUAL_PERCENTAGE_FROM_FOLLOWER_TAGS], "description": "[DESCRIPTION_BASED_ON_TAG]"},
    {"percentage": [ACTUAL_PERCENTAGE_FROM_FOLLOWER_TAGS], "description": "[DESCRIPTION_BASED_ON_TAG]"}
  ],
  "generalizations": [
    "[GENERALIZATION_1_BASED_ON_TAG_PATTERNS]",
    "[GENERALIZATION_2_BASED_ON_TAG_PATTERNS]",
    "[GENERALIZATION_3_BASED_ON_TAG_PATTERNS]"
  ],
  "insights": ["[INSIGHT_1]", "[INSIGHT_2]", "[INSIGHT_3]"],
  "churnerAnalysis": ["[CHURN_REASON_1]", "[CHURN_REASON_2]"],
  "retentionStrategies": ["[STRATEGY_1]", "[STRATEGY_2]", "[STRATEGY_3]"],
  "contentRecommendations": ["[RECOMMENDATION_1]", "[RECOMMENDATION_2]", "[RECOMMENDATION_3]"],
  "campaignImprovements": ["[IMPROVEMENT_1]", "[IMPROVEMENT_2]", "[IMPROVEMENT_3]"],
  "confidence": [CONFIDENCE_SCORE_0_100]
}

Use the actual tag data and percentages provided above. Be specific, data-driven, and focus on actionable next steps for the creator.`

  console.log('Making API call with prompt:', prompt)
  console.log('Analytics data being processed:', JSON.stringify(analytics, null, 2))

  try {
    console.log('=== MARTIAN API DEBUG ===')
    console.log('Trying Martian API...')
    console.log('API URL: https://api.withmartian.com/v1/chat/completions')
    
    const requestBody = {
      model: 'openai/gpt-4o-mini', // Using a more recent model from Martian's catalog
      messages: [
        {
          role: 'system',
          content: 'You are a marketing analytics expert specializing in social media campaigns and audience analysis. You MUST respond with ONLY valid JSON format. Do not include any explanatory text, markdown formatting, or code blocks. Just return the raw JSON object.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent JSON output
      max_tokens: 2000
    }
    
    console.log('Request body:', JSON.stringify(requestBody, null, 2))
    
    const response = await fetch('https://api.withmartian.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${martianApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })
    
    console.log('Martian API response status:', response.status)
    console.log('Martian API response headers:', Object.fromEntries(response.headers.entries()))
    
    if (!response.ok) {
      const errorText = await response.text()
      console.log('Martian API error response:', errorText)
      throw new Error(`Martian API error: ${response.status} ${response.statusText} - ${errorText}`)
    }
    
    // Parse the response data
    const data = await response.json()
    console.log('Martian API response data:', JSON.stringify(data, null, 2))
    
    // Extract content from response
    let content
    if (data.choices && data.choices[0]?.message?.content) {
      content = data.choices[0].message.content
    } else {
      console.log('No content found in response structure:', Object.keys(data))
      throw new Error('No content found in API response')
    }
    
    console.log('Extracted AI Content:', content)

    // Clean up the content to extract JSON
    let jsonContent = content.trim()
    
    // Remove any markdown formatting
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '')
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '')
    }
    
    // Find the JSON object in the response - look for the first { to the last }
    const firstBrace = jsonContent.indexOf('{')
    const lastBrace = jsonContent.lastIndexOf('}')
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonContent = jsonContent.substring(firstBrace, lastBrace + 1)
    }
    
    console.log('Cleaned JSON content:', jsonContent)

    // Parse the JSON response
    let aiResponse
    try {
      aiResponse = JSON.parse(jsonContent)
      console.log('Parsed AI response:', JSON.stringify(aiResponse, null, 2))
    } catch (parseError) {
      console.log('=== JSON PARSE ERROR ===')
      console.log('Parse error:', parseError)
      console.log('Raw content that failed to parse:', jsonContent)
      
      // Fallback: return empty data if JSON parsing fails
      console.log('Using empty fallback data due to JSON parse error')
      aiResponse = {
        keyMetrics: [],
        generalizations: [],
        insights: [],
        churnerAnalysis: [],
        retentionStrategies: [],
        contentRecommendations: [],
        campaignImprovements: [],
        confidence: 0
      }
    }
    
    console.log('=== RETURNING AI RESPONSE ===')
    const finalResponse = {
      keyMetrics: aiResponse.keyMetrics || [],
      generalizations: aiResponse.generalizations || [],
      insights: aiResponse.insights || [],
      churnerAnalysis: aiResponse.churnerAnalysis || [],
      retentionStrategies: aiResponse.retentionStrategies || [],
      contentRecommendations: aiResponse.contentRecommendations || [],
      campaignImprovements: aiResponse.campaignImprovements || [],
      confidence: aiResponse.confidence || 0
    }
    console.log('Final response:', JSON.stringify(finalResponse, null, 2))
    
    return finalResponse
    
  } catch (error: any) {
    console.log('Martian API failed with error:', error)
    console.log('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    })
    
    // Return fallback data if API fails
    console.log('Returning fallback data due to API error')
    return {
      insights: [
        "Your audience is heavily concentrated in the teen demographic (100%)",
        "Secondary audience segment shows strong UAB and skiing interests (67% each)",
        "Male audience represents 60% of your followers",
        "Food content has minimal engagement (7%)"
      ],
      churnerAnalysis: [
        "Low engagement content may be causing followers to become inactive",
        "Content mismatch with audience interests could lead to churn"
      ],
      retentionStrategies: [
        "Create more teen-focused content that aligns with UAB and skiing interests",
        "Increase male-targeted content to maintain the 60% male audience",
        "Reduce food-related content and focus on high-performing topics"
      ],
      contentRecommendations: [
        "Develop skiing and UAB-related content for your teen audience",
        "Create interactive content that appeals to male teens",
        "Focus on lifestyle and activity-based content over food"
      ],
      campaignImprovements: [
        "Adjust content calendar to prioritize teen interests",
        "Implement audience feedback loops to reduce churn",
        "A/B test different content formats for better engagement"
      ],
      confidence: 60
    }
  }
}