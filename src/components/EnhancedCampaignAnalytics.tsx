'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Users, UserMinus, TrendingUp, Target, Lightbulb, BarChart3, HelpCircle } from 'lucide-react'

interface TagData {
  tag: string
  count: number
  percentage: number
}

interface FollowerProfile {
  username: string
  tags: string[]
}

interface KeyMetric {
  percentage: number
  description: string
}

interface CampaignAnalytics {
  followerTags: TagData[]
  churnTags: TagData[]
  followerProfiles: FollowerProfile[]
  churnProfiles: FollowerProfile[]
  totalFollowers: number
  totalChurns: number
  campaign: {
    campaign_name: string
    campaign_type: string
    campaign_date: string
  }
}

interface AIInsights {
  keyMetrics: KeyMetric[]
  generalizations: string[]
  insights: string[]
  churnerAnalysis: string[]
  retentionStrategies: string[]
  contentRecommendations: string[]
  campaignImprovements: string[]
  confidence: number
}

interface EnhancedCampaignAnalyticsProps {
  campaignId: number
  campaignName: string
  campaignType: string
  campaignDate: string
}

export function EnhancedCampaignAnalytics({ 
  campaignId, 
  campaignName, 
  campaignType, 
  campaignDate 
}: EnhancedCampaignAnalyticsProps) {
  const [analytics, setAnalytics] = useState<CampaignAnalytics | null>(null)
  const [aiInsights, setAiInsights] = useState<AIInsights | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        // Fetch campaign analytics
        console.log('Fetching analytics for campaign ID:', campaignId)
        const analyticsResponse = await fetch(`/api/campaigns/${campaignId}/analytics`)
        
        console.log('Analytics response status:', analyticsResponse.status)
        console.log('Analytics response headers:', Object.fromEntries(analyticsResponse.headers.entries()))
        
        const responseText = await analyticsResponse.text()
        console.log('Raw response text:', responseText)
        
        let analyticsData
        try {
          analyticsData = JSON.parse(responseText)
          console.log('Parsed analytics data:', analyticsData)
        } catch (parseError) {
          console.error('Failed to parse JSON response:', parseError)
          console.log('Response was not valid JSON, likely an HTML error page')
          throw new Error(`Invalid response format: ${responseText.substring(0, 100)}...`)
        }
        
        if (!analyticsData.success) {
          throw new Error(analyticsData.error?.message || 'Failed to fetch analytics')
        }

        console.log('Analytics data:', analyticsData.data)
        console.log('Follower profiles:', analyticsData.data.followerProfiles)
        setAnalytics(analyticsData.data)

        // Generate AI insights using Martian API
        const aiResponse = await fetch('/api/ai/insights', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            analytics: analyticsData.data
          })
        })

        if (aiResponse.ok) {
          const aiData = await aiResponse.json()
          if (aiData.success) {
            setAiInsights(aiData.data)
          }
        }
      } catch (error) {
        console.error('Error fetching analytics:', error)
        setError(error instanceof Error ? error.message : 'Failed to load analytics')
      } finally {
        setIsLoading(false)
      }
    }

    fetchAnalytics()
  }, [campaignId])

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-3 text-muted-foreground">Loading analytics...</span>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-red-500 text-center">
            <p className="font-medium">Error loading analytics</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!analytics) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Campaign Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: '#3B82F6' }}>{campaignName}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="default" className="bg-blue-100 text-blue-800">
              {campaignType}
            </Badge>
            <span className="text-sm text-gray-600">{campaignDate}</span>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Follows/Churns Tabs */}
        <Card>
          <CardContent className="p-0">
            <Tabs defaultValue="follows" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="follows" className="flex items-center gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                  <Users className="h-4 w-4" />
                  Follows
                </TabsTrigger>
                <TabsTrigger value="churns" className="flex items-center gap-2 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                  <UserMinus className="h-4 w-4" />
                  Churns
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="follows" className="p-6">
                <div className="space-y-4">
                  {/* General Tags Row */}
                  <div className="flex flex-wrap gap-2">
                    {analytics.followerTags.slice(0, 7).map((tag, index) => (
                      <Badge key={index} variant="outline" className="bg-white text-blue-600 border-blue-200">
                        + {tag.tag}
                      </Badge>
                    ))}
                  </div>
                  
                  {/* Follower Profiles */}
                  <div className="space-y-2">
                    {analytics.followerProfiles && analytics.followerProfiles.length > 0 ? (
                      analytics.followerProfiles.slice(0, 10).map((profile, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded" style={{ backgroundColor: 'white' }}>
                          <span className="font-medium text-sm" style={{ color: '#3B82F6' }}>@{profile.username}</span>
                          <div className="flex flex-wrap gap-1">
                            {profile.tags.map((tag, tagIndex) => (
                              <Badge key={tagIndex} variant="outline" className="text-xs border-blue-200 bg-white">
                                <span style={{ color: '#3B82F6' }}>+ {tag}</span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-gray-500">
                        <p>No follower profiles available</p>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="churns" className="p-6">
                <div className="space-y-4">
                  {/* General Tags Row */}
                  <div className="flex flex-wrap gap-2">
                    {analytics.churnTags.slice(0, 7).map((tag, index) => (
                      <Badge key={index} variant="outline" className="bg-white text-blue-600 border-blue-200">
                        + {tag.tag}
                      </Badge>
                    ))}
                  </div>
                  
                  {/* Churn Profiles */}
                  <div className="space-y-2">
                    {analytics.churnProfiles && analytics.churnProfiles.length > 0 ? (
                      analytics.churnProfiles.slice(0, 10).map((profile, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded" style={{ backgroundColor: 'white' }}>
                          <span className="font-medium text-sm" style={{ color: '#3B82F6' }}>@{profile.username}</span>
                          <div className="flex flex-wrap gap-1">
                            {profile.tags.map((tag, tagIndex) => (
                              <Badge key={tagIndex} variant="outline" className="text-xs border-blue-200 bg-white">
                                <span style={{ color: '#3B82F6' }}>+ {tag}</span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-gray-500">
                        <p>No churn profiles available</p>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Right Column - Key Metrics and Generalizations */}
        <div className="space-y-6">
          {/* Key Metrics */}
          {aiInsights && aiInsights.keyMetrics && (
            <div className="space-y-3">
              {/* Large Metrics */}
              <div className="grid grid-cols-2 gap-3">
                {aiInsights.keyMetrics.slice(0, 2).map((metric, index) => (
                  <Card key={index} className="text-center p-3">
                    <div className="text-3xl font-bold text-blue-600">{metric.percentage}%</div>
                    <div className="text-sm text-gray-600">{metric.description}</div>
                  </Card>
                ))}
              </div>
              
              {/* Smaller Metrics - Made Larger */}
              <div className="grid grid-cols-3 gap-2">
                {aiInsights.keyMetrics.slice(2, 5).map((metric, index) => (
                  <Card key={index} className="text-center p-3">
                    <div className="text-2xl font-bold text-blue-600">{metric.percentage}%</div>
                    <div className="text-sm text-gray-600">{metric.description}</div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Generalizations */}
          {aiInsights && aiInsights.generalizations && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Generalizations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {aiInsights.generalizations.map((generalization, index) => (
                    <div key={index} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                        <span className="text-sm text-gray-700">{generalization}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Show loading state if no AI insights yet */}
          {!aiInsights && (
            <div className="text-center py-8 text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3"></div>
              <p>Generating AI insights...</p>
            </div>
          )}

          {/* Show message if AI insights are empty */}
          {aiInsights && (!aiInsights.keyMetrics || aiInsights.keyMetrics.length === 0) && (
            <div className="text-center py-8 text-gray-500">
              <p>AI insights are being generated based on your campaign data...</p>
              <p className="text-sm mt-2">This may take a moment to analyze your follower patterns.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
