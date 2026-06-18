'use client'

import { useState } from 'react'
import { CampaignManager } from '@/components/CampaignManager'
import { TagAnalyticsDashboard } from '@/components/TagAnalyticsDashboard'
import { ProfileList } from '@/components/ProfileList'
import { ProfileSheet } from '@/components/ProfileSheet'
import { BulkProfilesAttributionSheet } from '@/components/BulkProfilesAttributionSheet'
import { DataIngestion } from '@/components/DataIngestion'
import { ProfileIdentification } from '@/components/ProfileIdentification'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CampaignAnalyticsDashboard } from '@/components/CampaignAnalyticsDashboard'
import { SwarmCommand } from '@/components/SwarmCommand'
import { AIContentSuggestions } from '@/components/AIContentSuggestions'

export default function HomePage() {
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null)
  const [selectedProfilePks, setSelectedProfilePks] = useState<number[]>([])
  const [bulkAttributionOpen, setBulkAttributionOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  const clearSelection = () => {
    setSelectedProfilePks([])
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/images/igcrm.png" alt="IGCrm Logo" className="w-8 h-8" />
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-brand-primary">CREATOR</span>
              <span className="text-2xl font-bold text-gray-900">INTELLIGENCE</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-full bg-brand-primary flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
        </div>
      </header>

      {/* Welcome Section */}
      <section className="text-center py-16 px-6">
        <div className="w-20 h-20 mx-auto mb-6">
          <img src="/images/igcrm.png" alt="IGCrm Logo" className="w-20 h-20" />
        </div>
        <h1 className="text-5xl font-light mb-2">
          <span className="text-gray-500">Welcome to</span> <span className="font-bold text-brand-primary">CREATOR</span> <span className="font-bold text-gray-900">INTELLIGENCE</span>
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Investigate analytics from your social media platforms and get AI-powered insights to improve engagement and content strategy.
        </p>
      </section>

      {/* Main Content */}
      <div className="container mx-auto px-6 pb-16 space-y-8">

      {/* Data Ingestion */}
      <DataIngestion />
      
      {/* AI Content Suggestions */}
      <AIContentSuggestions />
      
      <Separator />

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 bg-white border border-gray-200 rounded-xl p-1">
          <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-brand-primary data-[state=active]:text-white">Tag Analytics</TabsTrigger>
          <TabsTrigger value="campaigns" className="rounded-lg data-[state=active]:bg-brand-primary data-[state=active]:text-white">Campaign Management</TabsTrigger>
          <TabsTrigger value="audience" className="rounded-lg data-[state=active]:bg-brand-primary data-[state=active]:text-white">Audience Management</TabsTrigger>
          <TabsTrigger value="attribution" className="rounded-lg data-[state=active]:bg-brand-primary data-[state=active]:text-white">Attribution Tracking</TabsTrigger>
          <TabsTrigger value="swarm" className="rounded-lg data-[state=active]:bg-brand-primary data-[state=active]:text-white">Agentic Swarm</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-brand-primary">Tag Analytics Dashboard</h2>
            <p className="text-gray-600">
              Analyze tag patterns and word clouds for followers vs churners to understand audience segments and engagement patterns.
            </p>
          </div>
          <CampaignAnalyticsDashboard />
          <TagAnalyticsDashboard />
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-brand-primary">Campaign Management</h2>
            <p className="text-gray-600">
              Create and manage your content and outbound follow campaigns for tracking attribution.
            </p>
          </div>
          <CampaignManager />
        </TabsContent>

        <TabsContent value="audience" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-brand-primary">Audience Management</h2>
            <p className="text-gray-600">
              Manage your audience profiles, tags, and track engagement patterns.
            </p>
          </div>
          <ProfileList
            onSelectProfile={(username) => setSelectedUsername(username)}
            selectedProfilePks={selectedProfilePks}
            onSelectionChange={setSelectedProfilePks}
            onBulkAttribution={() => setBulkAttributionOpen(true)}
          />
        </TabsContent>

        <TabsContent value="attribution" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-brand-primary">Attribution Tracking</h2>
            <p className="text-gray-600">
              Review and manage attribution assignments for recent profile interactions.
            </p>
          </div>
          <div className="grid gap-6">
            <ProfileIdentification />
          </div>
        </TabsContent>

        <TabsContent value="swarm" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Agentic Swarm Execution</h2>
            <p className="text-muted-foreground">
              Plan and execute multi-step data query, enrichment, and reporting workflows with streaming progress.
            </p>
          </div>
          <SwarmCommand />
        </TabsContent>
      </Tabs>
      </div>

      {/* Profile Detail Sheet */}
      <ProfileSheet
        username={selectedUsername}
        open={!!selectedUsername}
        onClose={() => setSelectedUsername(null)}
      />

      {/* Bulk Attribution Sheet */}
      <BulkProfilesAttributionSheet
        profilePks={selectedProfilePks}
        open={bulkAttributionOpen}
        onOpenChange={setBulkAttributionOpen}
        onCompleted={() => {
          clearSelection()
          // You might want to refresh the profile list here
        }}
      />

      {/* Footer */}
      <div className="text-center pt-8 border-t">
        <p className="text-sm text-muted-foreground">
          Creator Intelligence Platform - Local-first audience management and attribution tracking
        </p>
      </div>
    </main>
  )
}
