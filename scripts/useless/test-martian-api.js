#!/usr/bin/env node

/**
 * Test script for Martian API integration
 * Run with: node scripts/test-martian-api.js
 */

const MARTIAN_API_KEY = process.env.MARTIAN_API_KEY;

if (!MARTIAN_API_KEY) {
  console.error('❌ MARTIAN_API_KEY environment variable is required');
  console.log('Please set your Martian API key:');
  console.log('export MARTIAN_API_KEY=your_api_key_here');
  process.exit(1);
}

async function testMartianAPI() {
  console.log('🧪 Testing Martian API integration...');
  console.log('API Key (first 10 chars):', MARTIAN_API_KEY.substring(0, 10) + '...');
  
  const testData = {
    analytics: {
      followerTags: [
        { tag: 'teen', count: 15, percentage: 100 },
        { tag: 'UAB', count: 10, percentage: 67 },
        { tag: 'skiing', count: 10, percentage: 67 },
        { tag: 'male', count: 9, percentage: 60 },
        { tag: 'food', count: 1, percentage: 7 }
      ],
      churnTags: [
        { tag: 'inactive', count: 3, percentage: 60 },
        { tag: 'low_engagement', count: 2, percentage: 40 },
        { tag: 'wrong_content', count: 1, percentage: 20 }
      ],
      totalFollowers: 15,
      totalChurns: 5,
      campaign: {
        campaign_name: 'back to school campaign',
        campaign_type: 'CONTENT',
        campaign_date: '2025-09-12'
      }
    }
  };

  try {
    console.log('\n📡 Making API request...');
    const response = await fetch('https://api.withmartian.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MARTIAN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a marketing analytics expert specializing in social media campaigns and audience analysis. Provide actionable, data-driven insights. Always respond with valid JSON format.'
          },
          {
            role: 'user',
            content: `You are an AI marketing expert specializing in social media campaign optimization and audience retention. Analyze this campaign data and provide strategic recommendations to improve follower engagement and reduce churn.

CAMPAIGN: ${testData.analytics.campaign.campaign_name} (${testData.analytics.campaign.campaign_type})
DATE: ${testData.analytics.campaign.campaign_date}

FOLLOWER TAGS: ${testData.analytics.followerTags.map(tag => `${tag.tag}: ${tag.percentage}% (${tag.count} followers)`).join(', ')}
CHURN TAGS: ${testData.analytics.churnTags.map(tag => `${tag.tag}: ${tag.percentage}% (${tag.count} churns)`).join(', ')}
TOTAL FOLLOWERS: ${testData.analytics.totalFollowers}
TOTAL CHURNS: ${testData.analytics.totalChurns}
NET GROWTH: ${testData.analytics.totalFollowers - testData.analytics.totalChurns}

As an AI marketer, provide:

1. AUDIENCE INSIGHTS (3-4 key findings about your follower demographics and behavior patterns)
2. CHURNER ANALYSIS (2-3 specific reasons why people might be leaving and how to address them)
3. FOLLOWER RETENTION STRATEGIES (3-4 actionable tactics to keep current followers engaged)
4. CONTENT OPTIMIZATION (3-4 specific content recommendations based on your audience tags)
5. CAMPAIGN IMPROVEMENTS (3-4 strategic changes to improve this campaign's performance)

Format your response as JSON:
{
  "insights": ["audience insight 1", "audience insight 2", ...],
  "churnerAnalysis": ["churn reason 1", "churn reason 2", ...],
  "retentionStrategies": ["retention tactic 1", "retention tactic 2", ...],
  "contentRecommendations": ["content idea 1", "content idea 2", ...],
  "campaignImprovements": ["improvement 1", "improvement 2", ...],
  "confidence": 85
}

Be specific, data-driven, and focus on actionable next steps for the creator.`
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    console.log('📊 Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', response.status, response.statusText);
      console.error('Error details:', errorText);
      return;
    }

    const data = await response.json();
    console.log('✅ API Response received');
    
    // Extract content
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error('❌ No content in response');
      console.log('Response structure:', Object.keys(data));
      return;
    }

    console.log('\n🤖 AI Response:');
    console.log(content);

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

    // Try to parse JSON
    try {
      const aiResponse = JSON.parse(jsonContent);
      console.log('\n📋 Parsed AI Marketing Analysis:');
      console.log('🎯 Audience Insights:', aiResponse.insights?.length || 0, 'items');
      console.log('📉 Churner Analysis:', aiResponse.churnerAnalysis?.length || 0, 'items');
      console.log('💪 Retention Strategies:', aiResponse.retentionStrategies?.length || 0, 'items');
      console.log('📝 Content Recommendations:', aiResponse.contentRecommendations?.length || 0, 'items');
      console.log('🚀 Campaign Improvements:', aiResponse.campaignImprovements?.length || 0, 'items');
      console.log('🎯 Confidence:', aiResponse.confidence || 'N/A', '%');
      
      // Display detailed results
      if (aiResponse.insights?.length > 0) {
        console.log('\n🎯 AUDIENCE INSIGHTS:');
        aiResponse.insights.forEach((insight, i) => console.log(`  ${i+1}. ${insight}`));
      }
      
      if (aiResponse.churnerAnalysis?.length > 0) {
        console.log('\n📉 CHURNER ANALYSIS:');
        aiResponse.churnerAnalysis.forEach((analysis, i) => console.log(`  ${i+1}. ${analysis}`));
      }
      
      if (aiResponse.retentionStrategies?.length > 0) {
        console.log('\n💪 RETENTION STRATEGIES:');
        aiResponse.retentionStrategies.forEach((strategy, i) => console.log(`  ${i+1}. ${strategy}`));
      }
      
      if (aiResponse.contentRecommendations?.length > 0) {
        console.log('\n📝 CONTENT RECOMMENDATIONS:');
        aiResponse.contentRecommendations.forEach((rec, i) => console.log(`  ${i+1}. ${rec}`));
      }
      
      if (aiResponse.campaignImprovements?.length > 0) {
        console.log('\n🚀 CAMPAIGN IMPROVEMENTS:');
        aiResponse.campaignImprovements.forEach((improvement, i) => console.log(`  ${i+1}. ${improvement}`));
      }
      
      console.log('\n✅ Martian API integration test successful!');
    } catch (parseError) {
      console.error('❌ Failed to parse AI response as JSON:', parseError.message);
      console.log('Raw content:', content);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testMartianAPI();
