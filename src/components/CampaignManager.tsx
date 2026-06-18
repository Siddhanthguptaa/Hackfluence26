'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useCampaigns, useCampaignMutations } from '@/lib/hooks'
import { formatDate } from '@/lib/dates'
import { PlusCircle, Trash2, ChevronDown, ChevronRight, Users, TrendingUp, Lightbulb } from 'lucide-react'
import { EnhancedCampaignAnalytics } from './EnhancedCampaignAnalytics'

const CAMPAIGN_TYPES = ['CONTENT', 'OUTBOUND_FOLLOW'] as const

interface Campaign {
  campaign_id: number
  campaign_name: string
  campaign_date: string | Date
  campaign_type: string
}

interface CampaignCardProps {
  campaign: Campaign
  onDelete: (campaign: Campaign) => void
}

function CampaignCard({ campaign, onDelete }: CampaignCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [analytics, setAnalytics] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingAI, setIsLoadingAI] = useState(false)

  // Generate AI insights using the AI API
  const generateAIInsights = async (tagData: any) => {
    try {
      const response = await fetch('/api/ai/insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          analytics: {
            ...tagData,
            campaign: {
              campaign_name: campaign.campaign_name,
              campaign_type: campaign.campaign_type,
              campaign_date: campaign.campaign_date
            }
          }
        })
      })

      const result = await response.json()
      
      if (result.success) {
        return {
          ...tagData,
          insights: result.data.insights || [],
          churnerAnalysis: result.data.churnerAnalysis || [],
          retentionStrategies: result.data.retentionStrategies || [],
          contentRecommendations: result.data.contentRecommendations || [],
          campaignImprovements: result.data.campaignImprovements || [],
          confidence: result.data.confidence || 0
        }
      } else {
        throw new Error(result.error?.message || 'Failed to generate AI insights')
      }
    } catch (error) {
      console.error('Error calling AI insights API:', error)
      throw error // Re-throw the error instead of using fallback
    }
  }


  // Fetch campaign analytics when expanded
  const fetchAnalytics = async () => {
    if (analytics || isLoading) return
    
    setIsLoading(true)
    try {
      // First get the basic analytics data (tags, followers, churns)
      const response = await fetch(`/api/campaigns/${campaign.campaign_id}/analytics`)
      const data = await response.json()
      
      if (data.success && data.data) {
        // Set the basic analytics data immediately (no AI needed for tags)
        const basicAnalytics = {
          ...data.data,
          insights: [],
          churnerAnalysis: [],
          retentionStrategies: [],
          contentRecommendations: [],
          campaignImprovements: [],
          confidence: 0
        }
        setAnalytics(basicAnalytics)
        
        // Then try to get AI insights separately
        setIsLoadingAI(true)
        try {
          const aiInsights = await generateAIInsights(data.data)
          setAnalytics(aiInsights)
        } catch (aiError) {
          console.error('AI insights failed, but basic analytics loaded:', aiError)
          // Keep the basic analytics, just without AI insights
        } finally {
          setIsLoadingAI(false)
        }
      } else {
        throw new Error(data.error?.message || 'Failed to fetch analytics')
      }
    } catch (error) {
      console.error('Error fetching campaign analytics:', error)
      setAnalytics(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggle = () => {
    setIsOpen(!isOpen)
    if (!isOpen && !analytics) {
      fetchAnalytics()
    }
  }

  return (
    <Collapsible open={isOpen} onOpenChange={handleToggle}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between w-full p-4 hover:bg-gray-50 cursor-pointer border-b">
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
                  onDelete(campaign)
                }}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
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
            ) : analytics ? (
              <EnhancedCampaignAnalytics
                campaignId={campaign.campaign_id}
                campaignName={campaign.campaign_name}
                campaignType={campaign.campaign_type}
                campaignDate={formatDate(typeof campaign.campaign_date === 'string' ? new Date(campaign.campaign_date) : campaign.campaign_date, 'date')}
              />
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>Click to load campaign insights</p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )
}

export function CampaignManager() {
  const [newCampaignName, setNewCampaignName] = useState('')
  const [newCampaignDate, setNewCampaignDate] = useState('')
  const [newCampaignType, setNewCampaignType] = useState<'CONTENT' | 'OUTBOUND_FOLLOW'>('CONTENT')

  const { data: campaigns, isLoading } = useCampaigns()
  const { create, remove } = useCampaignMutations()

  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCampaignName.trim() || !newCampaignDate) {
      return
    }

    create.mutate({
      campaign_name: newCampaignName.trim(),
      campaign_date: newCampaignDate,
      campaign_type: newCampaignType
    }, {
      onSuccess: () => {
        setNewCampaignName('')
        setNewCampaignDate('')
        setNewCampaignType('CONTENT')
      }
    })
  }

  const handleDeleteCampaign = (campaign: any) => {
    if (window.confirm(`Delete campaign "${campaign.campaign_name}"? This cannot be undone.`)) {
      remove.mutate(campaign.campaign_id)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign Management</CardTitle>
        <CardDescription>
          Create and manage your campaigns for tracking attribution and engagement.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create Campaign Form */}
        <form onSubmit={handleCreateCampaign} className="grid gap-4 md:grid-cols-4 md:items-end">
          <div className="space-y-2">
            <label htmlFor="campaign-name" className="text-sm font-medium">Campaign Name</label>
            <Input
              id="campaign-name"
              value={newCampaignName}
              onChange={(e) => setNewCampaignName(e.target.value)}
              placeholder="e.g., Summer Product Launch"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="campaign-date" className="text-sm font-medium">Campaign Date</label>
            <Input
              id="campaign-date"
              type="date"
              value={newCampaignDate}
              onChange={(e) => setNewCampaignDate(e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="campaign-type" className="text-sm font-medium">Type</label>
            <Select
              value={newCampaignType}
              onValueChange={(value) => setNewCampaignType(value as 'CONTENT' | 'OUTBOUND_FOLLOW')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAMPAIGN_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button type="submit" disabled={create.isPending} className="w-full md:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" />
            {create.isPending ? 'Creating...' : 'Create Campaign'}
          </Button>
        </form>

        {/* Campaigns List */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Existing Campaigns</h3>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="ml-2 text-sm text-muted-foreground">Loading campaigns...</span>
            </div>
          ) : campaigns && campaigns.length > 0 ? (
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <CampaignCard 
                  key={campaign.campaign_id} 
                  campaign={campaign} 
                  onDelete={handleDeleteCampaign}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No campaigns created yet.</p>
              <p className="text-sm">Create your first campaign above to get started.</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}