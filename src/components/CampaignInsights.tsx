'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, ChevronRight, Users, TrendingUp, Target, Lightbulb } from 'lucide-react'
import { formatDate } from '@/lib/dates'

interface Campaign {
  campaign_id: number
  campaign_name: string
  campaign_date: string | Date
  campaign_type: string
}

interface CampaignInsightsProps {
  campaign: Campaign
  onDelete: (campaignId: number) => void
}

interface TagAnalytics {
  followerTags: { tag: string; count: number; percentage: number }[]
  churnTags: { tag: string; count: number; percentage: number }[]
  totalFollowers: number
  totalChurns: number
  insights: string[]
  churnerAnalysis: string[]
  retentionStrategies: string[]
  contentRecommendations: string[]
  campaignImprovements: string[]
  confidence: number
}

export function CampaignInsights({ campaign, onDelete }: CampaignInsightsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [analytics, setAnalytics] = useState<TagAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Call Martian API to generate AI insights
  const generateAIInsights = async (tagData: any): Promise<TagAnalytics> => {
    const followerTags = tagData.followerTags || []
    const churnTags = tagData.churnTags || []
    const totalFollowers = tagData.totalFollowers || 0
    const totalChurns = tagData.totalChurns || 0

    console.log('Calling Martian API for AI insights...')
    console.log('Tag data:', tagData)

    try {
      const response = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analytics: {
            followerTags,
            churnTags,
            totalFollowers,
            totalChurns,
            campaign: {
              campaign_name: campaign.campaign_name,
              campaign_type: campaign.campaign_type,
              campaign_date: typeof campaign.campaign_date === 'string' 
                ? campaign.campaign_date 
                : campaign.campaign_date.toISOString().split('T')[0]
            }
          }
        })
      })

      console.log('Martian API response status:', response.status)

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const aiResponse = await response.json()
      console.log('Martian API response:', aiResponse)

      if (aiResponse.success && aiResponse.data) {
        return {
          followerTags,
          churnTags,
          totalFollowers,
          totalChurns,
          insights: aiResponse.data.insights || [],
          churnerAnalysis: aiResponse.data.churnerAnalysis || [],
          retentionStrategies: aiResponse.data.retentionStrategies || [],
          contentRecommendations: aiResponse.data.contentRecommendations || [],
          campaignImprovements: aiResponse.data.campaignImprovements || [],
          confidence: aiResponse.data.confidence || 0
        }
      } else {
        throw new Error(aiResponse.error?.message || 'Invalid response from AI API')
      }
    } catch (error) {
      console.error('Error calling Martian API:', error)
      throw error // Re-throw the error to be handled by the calling function
    }
  }

  // Fetch campaign analytics when expanded
  useEffect(() => {
    if (isOpen && !analytics) {
      setIsLoading(true)
      setError(null) // Reset error state when opening
      
      const fetchAnalytics = async () => {
        try {
          // First get the campaign analytics data
          const analyticsResponse = await fetch(`/api/campaigns/${campaign.campaign_id}/analytics`)
          const analyticsData = await analyticsResponse.json()
          
          if (analyticsData.success && analyticsData.data) {
            // Then generate AI insights using Martian API
            const insights = await generateAIInsights(analyticsData.data)
            setAnalytics(insights)
          } else {
            throw new Error(analyticsData.error?.message || 'Failed to fetch analytics')
          }
        } catch (error) {
          console.error('Error fetching campaign analytics or generating AI insights:', error)
          setError(error instanceof Error ? error.message : 'Failed to generate AI insights')
          setAnalytics(null)
        } finally {
          setIsLoading(false)
        }
      }
      
      fetchAnalytics()
    }
  }, [isOpen, campaign.campaign_id, analytics])

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between w-full p-3 hover:bg-gray-50 cursor-pointer border-b">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">{campaign.campaign_name}</span>
              <Badge variant={campaign.campaign_type === 'CONTENT' ? 'default' : 'secondary'}>
                {campaign.campaign_type}
              </Badge>
            </div>
            <span className="text-sm text-muted-foreground">
              {formatDate(typeof campaign.campaign_date === 'string' ? new Date(campaign.campaign_date) : campaign.campaign_date, 'date')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(campaign.campaign_id)
              }}
              className="text-red-500 hover:text-red-700"
            >
              Delete
            </Button>
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="p-6 bg-gray-50">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="ml-3 text-muted-foreground">Generating insights...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-600">
              <div className="text-red-500 mb-2">⚠️</div>
              <p className="font-medium">Failed to generate AI insights</p>
              <p className="text-sm text-gray-500 mt-1">{error}</p>
              <button 
                onClick={() => {
                  setError(null)
                  setAnalytics(null)
                  // Trigger refetch
                  const event = new Event('refetch')
                  window.dispatchEvent(event)
                }}
                className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : analytics ? (
            <div className="space-y-6">
              {/* AI Insights Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lightbulb className="h-5 w-5" />
                    AI Campaign Analysis
                  </CardTitle>
                  <CardDescription>
                    Based on your audience tags and campaign performance
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Audience Insights */}
                  <div>
                    <h4 className="font-semibold mb-2 text-blue-600">🎯 Audience Insights</h4>
                    <ul className="space-y-1">
                      {analytics.insights.map((insight, index) => (
                        <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                          <span className="text-blue-500 mt-1">•</span>
                          {insight}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Churner Analysis */}
                  {analytics.churnerAnalysis && analytics.churnerAnalysis.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 text-red-600">📉 Churner Analysis</h4>
                      <ul className="space-y-1">
                        {analytics.churnerAnalysis.map((analysis, index) => (
                          <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                            <span className="text-red-500 mt-1">•</span>
                            {analysis}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Retention Strategies */}
                  {analytics.retentionStrategies && analytics.retentionStrategies.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 text-green-600">💪 Retention Strategies</h4>
                      <ul className="space-y-1">
                        {analytics.retentionStrategies.map((strategy, index) => (
                          <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                            <span className="text-green-500 mt-1">•</span>
                            {strategy}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Content Recommendations */}
                  {analytics.contentRecommendations && analytics.contentRecommendations.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 text-purple-600">📝 Content Recommendations</h4>
                      <ul className="space-y-1">
                        {analytics.contentRecommendations.map((rec, index) => (
                          <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                            <span className="text-purple-500 mt-1">•</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Campaign Improvements */}
                  {analytics.campaignImprovements && analytics.campaignImprovements.length > 0 && (
                    <div>
                      <h4 className="font-semibold mb-2 text-orange-600">🚀 Campaign Improvements</h4>
                      <ul className="space-y-1">
                        {analytics.campaignImprovements.map((improvement, index) => (
                          <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                            <span className="text-orange-500 mt-1">•</span>
                            {improvement}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Confidence Score */}
                  {analytics.confidence > 0 && (
                    <div className="pt-2 border-t">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>AI Confidence:</span>
                        <div className="flex items-center gap-1">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-500 h-2 rounded-full" 
                              style={{ width: `${analytics.confidence}%` }}
                            ></div>
                          </div>
                          <span className="text-xs">{analytics.confidence}%</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Tag Analytics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Follower Tags */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-green-600">
                      <Users className="h-4 w-4" />
                      Follower Tags
                    </CardTitle>
                    <CardDescription>
                      {analytics.totalFollowers} total followers
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analytics.followerTags.slice(0, 5).map((tag, index) => (
                        <div key={index} className="flex justify-between items-center">
                          <span className="text-sm">{tag.tag}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-green-500 h-2 rounded-full" 
                                style={{ width: `${tag.percentage}%` }}
                              ></div>
                            </div>
                            <span className="text-xs text-gray-500 w-8">{tag.percentage}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Churn Tags */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-red-600">
                      <TrendingUp className="h-4 w-4" />
                      Churn Tags
                    </CardTitle>
                    <CardDescription>
                      {analytics.totalChurns} total churns
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analytics.churnTags.slice(0, 5).map((tag, index) => (
                        <div key={index} className="flex justify-between items-center">
                          <span className="text-sm">{tag.tag}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-red-500 h-2 rounded-full" 
                                style={{ width: `${tag.percentage}%` }}
                              ></div>
                            </div>
                            <span className="text-xs text-gray-500 w-8">{tag.percentage}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Click to load campaign insights</p>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
