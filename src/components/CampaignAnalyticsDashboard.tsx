'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useCampaignAnalytics, useCampaigns } from '@/lib/hooks'
import { formatDate } from '@/lib/dates'
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart
} from 'recharts'
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  UserMinus, 
  Target, 
  Calendar,
  Download,
  BarChart3,
  PieChart as PieChartIcon,
  Filter
} from 'lucide-react'

const COLORS = ['#2D81DE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

type CampaignMetrics = {
  totalAttributions: number
  followers: number
  unfollowers: number
  netGrowth: number
  conversionRate: number
  churnRate: number
  uniqueProfiles: number
  avgEventsPerProfile: number
  dailyBreakdown: Array<{
    date: string
    followers: number
    unfollowers: number
    total: number
  }>
  peakEngagementDay: {
    date: string
    followers: number
    unfollowers: number
    total: number
  } | null
}

type CampaignWithMetrics = {
  campaign_id: number
  campaign_name: string
  campaign_date: string
  campaign_type: 'CONTENT' | 'OUTBOUND_FOLLOW'
  metrics: CampaignMetrics
}

export function CampaignAnalyticsDashboard() {
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all')
  const [dateRange, setDateRange] = useState('30')
  const [chartType, setChartType] = useState<'line' | 'bar' | 'area'>('area')

  const { data: campaigns } = useCampaigns()
  const { data: analytics, isLoading } = useCampaignAnalytics({
    campaignId: selectedCampaign === 'all' ? undefined : parseInt(selectedCampaign),
    dateRange: parseInt(dateRange)
  })

  const exportData = () => {
    if (!analytics) return
    
    const dataToExport = {
      summary: analytics.summary || analytics.metrics,
      campaigns: analytics.campaigns || [analytics.campaign],
      timeRange: analytics.timeRange,
      exportDate: new Date().toISOString()
    }
    
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `campaign-analytics-${selectedCampaign}-${dateRange}days.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

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

  const isOverview = selectedCampaign === 'all'
  const summary = analytics?.summary || analytics?.metrics
  const campaignData = analytics?.campaigns || (analytics?.campaign ? [analytics.campaign] : [])

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-brand-primary">
                <BarChart3 className="h-5 w-5" />
                Campaign Analytics Dashboard
              </CardTitle>
              <CardDescription>
                Comprehensive insights into your campaign performance and audience engagement
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Campaigns</SelectItem>
                  {campaigns?.map((campaign) => (
                    <SelectItem key={campaign.campaign_id} value={campaign.campaign_id.toString()}>
                      {campaign.campaign_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>

              <Select value={chartType} onValueChange={(value) => setChartType(value as any)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="area">Area</SelectItem>
                  <SelectItem value="line">Line</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                </SelectContent>
              </Select>

              <Button onClick={exportData} variant="outline" size="sm" className="border-brand-primary text-brand-primary hover:bg-brand-accent">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Key Metrics Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Followers"
            value={summary.followers || summary.totalFollowers}
            icon={<Users className="h-4 w-4" />}
            trend={summary.netGrowth > 0 ? 'up' : summary.netGrowth < 0 ? 'down' : 'neutral'}
            subtitle={`${summary.netGrowth >= 0 ? '+' : ''}${summary.netGrowth} net growth`}
          />
          
          <MetricCard
            title="Conversion Rate"
            value={`${summary.conversionRate || 0}%`}
            icon={<Target className="h-4 w-4" />}
            trend={summary.conversionRate > 5 ? 'up' : summary.conversionRate < 2 ? 'down' : 'neutral'}
            subtitle="Follower conversion"
          />
          
          <MetricCard
            title="Total Attributions"
            value={summary.totalAttributions}
            icon={<BarChart3 className="h-4 w-4" />}
            subtitle="Tracked interactions"
          />
          
          <MetricCard
            title={isOverview ? "Active Campaigns" : "Churn Rate"}
            value={isOverview ? summary.totalCampaigns : `${summary.churnRate || 0}%`}
            icon={isOverview ? <Calendar className="h-4 w-4" /> : <UserMinus className="h-4 w-4" />}
            trend={isOverview ? undefined : summary.churnRate < 10 ? 'up' : summary.churnRate > 25 ? 'down' : 'neutral'}
            subtitle={isOverview ? "Total campaigns" : "Unfollow rate"}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Engagement Chart */}
        {summary?.dailyBreakdown && (
          <Card>
            <CardHeader>
              <CardTitle>Daily Engagement Trends</CardTitle>
              <CardDescription>
                Follower and unfollower activity over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === 'area' ? (
                    <AreaChart data={summary.dailyBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(value) => new Date(value).toLocaleDateString()}
                      />
                      <YAxis />
                      <Tooltip 
                        labelFormatter={(value) => new Date(value).toLocaleDateString()}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="followers" 
                        stackId="1" 
                        stroke="#0088FE" 
                        fill="#0088FE" 
                        fillOpacity={0.6}
                        name="Followers"
                      />
                      <Area 
                        type="monotone" 
                        dataKey="unfollowers" 
                        stackId="1" 
                        stroke="#FF8042" 
                        fill="#FF8042" 
                        fillOpacity={0.6}
                        name="Unfollowers"
                      />
                    </AreaChart>
                  ) : chartType === 'line' ? (
                    <LineChart data={summary.dailyBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(value) => new Date(value).toLocaleDateString()}
                      />
                      <YAxis />
                      <Tooltip 
                        labelFormatter={(value) => new Date(value).toLocaleDateString()}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="followers" 
                        stroke="#0088FE" 
                        strokeWidth={2}
                        name="Followers"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="unfollowers" 
                        stroke="#FF8042" 
                        strokeWidth={2}
                        name="Unfollowers"
                      />
                    </LineChart>
                  ) : (
                    <BarChart data={summary.dailyBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(value) => new Date(value).toLocaleDateString()}
                      />
                      <YAxis />
                      <Tooltip 
                        labelFormatter={(value) => new Date(value).toLocaleDateString()}
                      />
                      <Bar dataKey="followers" fill="#0088FE" name="Followers" />
                      <Bar dataKey="unfollowers" fill="#FF8042" name="Unfollowers" />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Campaign Performance Comparison */}
        {isOverview && campaignData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Campaign Performance Comparison</CardTitle>
              <CardDescription>
                Conversion rates across all campaigns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(campaignData as CampaignWithMetrics[]).map((c: CampaignWithMetrics) => ({
                    name: c.campaign_name?.substring(0, 15) + (c.campaign_name?.length > 15 ? '...' : ''),
                    conversionRate: c.metrics?.conversionRate || 0,
                    followers: c.metrics?.followers || 0,
                    type: c.campaign_type
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip 
                      formatter={(value, name) => [
                        name === 'conversionRate' ? `${value}%` : value,
                        name === 'conversionRate' ? 'Conversion Rate' : 'Followers'
                      ]}
                    />
                    <Bar dataKey="conversionRate" fill="#00C49F" name="Conversion Rate %" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Campaign Type Distribution */}
        {isOverview && campaignData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Campaign Type Distribution</CardTitle>
              <CardDescription>
                Performance breakdown by campaign type
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={Object.entries(
                        (campaignData as CampaignWithMetrics[]).reduce((acc: Record<string, number>, c: CampaignWithMetrics) => {
                          acc[c.campaign_type] = (acc[c.campaign_type] || 0) + (c.metrics?.followers || 0)
                          return acc
                        }, {} as Record<string, number>)
                      ).map(([type, followers]) => ({ name: type, value: followers }))}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {Object.keys(
                        (campaignData as CampaignWithMetrics[]).reduce((acc: Record<string, boolean>, c: CampaignWithMetrics) => {
                          acc[c.campaign_type] = true
                          return acc
                        }, {} as Record<string, boolean>)
                      ).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Peak Performance Insights */}
        {summary?.peakEngagementDay && (
          <Card>
            <CardHeader>
              <CardTitle>Peak Performance Insights</CardTitle>
              <CardDescription>
                Best performing day and key metrics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium">Peak Engagement Day</p>
                  <p className="text-2xl font-bold">
                    {formatDate(summary.peakEngagementDay.date, 'date')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total Interactions</p>
                  <p className="text-2xl font-bold text-primary">
                    {summary.peakEngagementDay.total}
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-sm font-medium text-green-700">Followers</p>
                  <p className="text-xl font-bold text-green-800">
                    {summary.peakEngagementDay.followers}
                  </p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <p className="text-sm font-medium text-red-700">Unfollowers</p>
                  <p className="text-xl font-bold text-red-800">
                    {summary.peakEngagementDay.unfollowers}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Campaign Details Table */}
      {isOverview && campaignData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Campaign Details</CardTitle>
            <CardDescription>
              Detailed performance metrics for each campaign
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Campaign</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">Date</th>
                    <th className="text-right p-2">Followers</th>
                    <th className="text-right p-2">Conversion</th>
                    <th className="text-right p-2">Churn Rate</th>
                    <th className="text-right p-2">Net Growth</th>
                  </tr>
                </thead>
                <tbody>
                  {(campaignData as CampaignWithMetrics[]).map((campaign: CampaignWithMetrics) => (
                    <tr key={campaign.campaign_id} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-medium">{campaign.campaign_name}</td>
                      <td className="p-2">
                        <Badge variant={campaign.campaign_type === 'CONTENT' ? 'default' : 'secondary'}>
                          {campaign.campaign_type}
                        </Badge>
                      </td>
                      <td className="p-2 text-sm text-muted-foreground">
                        {formatDate(campaign.campaign_date, 'date')}
                      </td>
                      <td className="p-2 text-right">{campaign.metrics?.followers || 0}</td>
                      <td className="p-2 text-right">{campaign.metrics?.conversionRate || 0}%</td>
                      <td className="p-2 text-right">{campaign.metrics?.churnRate || 0}%</td>
                      <td className="p-2 text-right">
                        <span className={`font-medium ${
                          (campaign.metrics?.netGrowth || 0) > 0 ? 'text-green-600' : 
                          (campaign.metrics?.netGrowth || 0) < 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {(campaign.metrics?.netGrowth || 0) >= 0 ? '+' : ''}{campaign.metrics?.netGrowth || 0}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function MetricCard({ 
  title, 
  value, 
  icon, 
  trend, 
  subtitle 
}: { 
  title: string
  value: string | number
  icon: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
  subtitle?: string 
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {icon}
            <span className="text-sm font-medium text-muted-foreground">{title}</span>
          </div>
          {trend && (
            <div className={`flex items-center ${
              trend === 'up' ? 'text-green-600' : 
              trend === 'down' ? 'text-red-600' : 'text-gray-600'
            }`}>
              {trend === 'up' ? <TrendingUp className="h-4 w-4" /> : 
               trend === 'down' ? <TrendingDown className="h-4 w-4" /> : null}
            </div>
          )}
        </div>
        <div className="mt-2">
          <div className="text-2xl font-bold">{value}</div>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}