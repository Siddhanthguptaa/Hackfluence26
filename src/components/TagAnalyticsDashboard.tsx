'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useTagAnalytics } from '@/lib/hooks'
import { TagWordCloud, TagWordCloudGrid } from '@/components/TagWordCloud'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import { 
  Users, 
  UserMinus, 
  TrendingUp, 
  TrendingDown,
  Tags,
  Download,
  Filter,
  Eye,
  BarChart3
} from 'lucide-react'

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8']

type TagItem = {
  tag_id: number
  tag_name: string
  count: number
  auto_assigned_count: number
  manual_count: number
  percentage: number
  profiles: string[]
}

type ComparisonItem = {
  tag_name: string
  follower_count: number
  churner_count: number
  follower_percentage: number
  churner_percentage: number
  ratio: number
  total_count: number
}

export function TagAnalyticsDashboard() {
  const [dateRange, setDateRange] = useState('30')
  const [minTagCount, setMinTagCount] = useState('2')
  const [viewMode, setViewMode] = useState<'cloud' | 'grid'>('cloud')
  const [showComparison, setShowComparison] = useState(true)

  const { data: analytics, isLoading } = useTagAnalytics({
    dateRange: parseInt(dateRange),
    minTagCount: parseInt(minTagCount)
  })

  const exportData = () => {
    if (!analytics) return
    
    const dataToExport = {
      summary: analytics.summary,
      followers: analytics.followers,
      churners: analytics.churners,
      comparison: analytics.comparison,
      exportDate: new Date().toISOString(),
      parameters: { dateRange, minTagCount }
    }
    
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tag-analytics-${dateRange}days.json`
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
          <span className="ml-3 text-muted-foreground">Loading tag analytics...</span>
        </CardContent>
      </Card>
    )
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">No tag analytics data available</p>
        </CardContent>
      </Card>
    )
  }

  const { summary, followers, churners, comparison } = analytics

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Tags className="h-5 w-5" />
                Tag Analytics Dashboard
              </CardTitle>
              <CardDescription>
                Analyze tag patterns for followers and churners to understand audience segments
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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

              <Select value={minTagCount} onValueChange={setMinTagCount}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Min 1 occurrence</SelectItem>
                  <SelectItem value="2">Min 2 occurrences</SelectItem>
                  <SelectItem value="3">Min 3 occurrences</SelectItem>
                  <SelectItem value="5">Min 5 occurrences</SelectItem>
                  <SelectItem value="10">Min 10 occurrences</SelectItem>
                </SelectContent>
              </Select>

              <Select value={viewMode} onValueChange={(value) => setViewMode(value as any)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cloud">Word Cloud</SelectItem>
                  <SelectItem value="grid">Tag Grid</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowComparison(!showComparison)}
              >
                <Eye className="h-4 w-4 mr-2" />
                {showComparison ? 'Hide' : 'Show'} Comparison
              </Button>

              <Button onClick={exportData} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Followers"
          value={summary.total_followers}
          icon={<Users className="h-4 w-4" />}
          subtitle={`Avg ${summary.follower_avg_tags_per_profile} tags/profile`}
        />
        
        <MetricCard
          title="Total Churners"
          value={summary.total_churners}
          icon={<UserMinus className="h-4 w-4" />}
          subtitle={`Avg ${summary.churner_avg_tags_per_profile} tags/profile`}
        />
        
        <MetricCard
          title="Unique Follower Tags"
          value={summary.total_unique_follower_tags}
          icon={<Tags className="h-4 w-4" />}
          subtitle="Distinct tags"
        />
        
        <MetricCard
          title="Unique Churner Tags"
          value={summary.total_unique_churner_tags}
          icon={<Tags className="h-4 w-4" />}
          subtitle="Distinct tags"
        />
      </div>

      {/* Word Clouds / Tag Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {viewMode === 'cloud' ? (
          <>
            <TagWordCloud
              data={followers.word_cloud_data}
              title="Follower Tags"
              colorScheme="green"
              maxWords={50}
            />
            <TagWordCloud
              data={churners.word_cloud_data}
              title="Churner Tags"
              colorScheme="red"
              maxWords={50}
            />
          </>
        ) : (
          <>
            <TagWordCloudGrid
              data={followers.word_cloud_data}
              title="Follower Tags"
              colorScheme="green"
              maxWords={50}
            />
            <TagWordCloudGrid
              data={churners.word_cloud_data}
              title="Churner Tags"
              colorScheme="red"
              maxWords={50}
            />
          </>
        )}
      </div>

      {/* Tag Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Follower Tag List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Top Follower Tags
            </CardTitle>
            <CardDescription>
              Most common tags among new followers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(followers.tag_list as TagItem[]).slice(0, 10).map((tag: TagItem, index: number) => (
                <div key={tag.tag_id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 bg-green-100 text-green-800 text-xs font-bold rounded-full">
                      {index + 1}
                    </span>
                    <span className="font-medium">{tag.tag_name}</span>
                    {tag.auto_assigned_count > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {tag.auto_assigned_count} auto
                      </Badge>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-700">{tag.count}</div>
                    <div className="text-xs text-green-600">{tag.percentage}%</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Churner Tag List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Top Churner Tags
            </CardTitle>
            <CardDescription>
              Most common tags among users who unfollowed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(churners.tag_list as TagItem[]).slice(0, 10).map((tag: TagItem, index: number) => (
                <div key={tag.tag_id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 bg-red-100 text-red-800 text-xs font-bold rounded-full">
                      {index + 1}
                    </span>
                    <span className="font-medium">{tag.tag_name}</span>
                    {tag.auto_assigned_count > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {tag.auto_assigned_count} auto
                      </Badge>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-red-700">{tag.count}</div>
                    <div className="text-xs text-red-600">{tag.percentage}%</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comparison Chart */}
      {showComparison && comparison.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Tag Comparison: Followers vs Churners
            </CardTitle>
            <CardDescription>
              Compare tag frequency between followers and churners
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparison.slice(0, 15)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="tag_name" 
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis />
                  <Tooltip 
                    formatter={(value, name) => [
                      value,
                      name === 'follower_count' ? 'Followers' : 'Churners'
                    ]}
                  />
                  <Bar dataKey="follower_count" fill="#22c55e" name="Followers" />
                  <Bar dataKey="churner_count" fill="#ef4444" name="Churners" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparison Table */}
      {showComparison && comparison.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Tag Comparison</CardTitle>
            <CardDescription>
              Comprehensive breakdown of tag performance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Tag</th>
                    <th className="text-right p-2">Followers</th>
                    <th className="text-right p-2">Churners</th>
                    <th className="text-right p-2">F/C Ratio</th>
                    <th className="text-right p-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(comparison as ComparisonItem[]).slice(0, 20).map((item: ComparisonItem) => (
                    <tr key={item.tag_name} className="border-b hover:bg-muted/50">
                      <td className="p-2 font-medium">{item.tag_name}</td>
                      <td className="p-2 text-right">
                        <span className="text-green-700 font-medium">
                          {item.follower_count}
                        </span>
                        <span className="text-xs text-green-600 ml-1">
                          ({item.follower_percentage}%)
                        </span>
                      </td>
                      <td className="p-2 text-right">
                        <span className="text-red-700 font-medium">
                          {item.churner_count}
                        </span>
                        <span className="text-xs text-red-600 ml-1">
                          ({item.churner_percentage}%)
                        </span>
                      </td>
                      <td className="p-2 text-right">
                        <span className={`font-medium ${
                          item.ratio === Infinity ? 'text-green-600' :
                          item.ratio > 2 ? 'text-green-600' :
                          item.ratio > 1 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {item.ratio === Infinity ? '∞' : item?.ratio?.toFixed(1)}
                        </span>
                      </td>
                      <td className="p-2 text-right font-medium">{item.total_count}</td>
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
  subtitle 
}: { 
  title: string
  value: string | number
  icon: React.ReactNode
  subtitle?: string 
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center space-x-2">
          {icon}
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
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