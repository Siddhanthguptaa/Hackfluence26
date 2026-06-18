'use client'

import { useState, useEffect } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProfile, useCampaigns, useAttributionMutations, api } from '@/lib/hooks'
import { useQueryClient } from '@tanstack/react-query'
import { formatDate } from '@/lib/dates'
import { eventUtils } from '@/lib/events'
import { attributionUtils, ATTRIBUTION_REASONS } from '@/lib/attribution'
import { UserCheck, UserX, Hash, Save, X, Plus, LogIn, LogOut } from 'lucide-react'
import { toast } from 'sonner'

interface ProfileSheetProps {
  username: string | null
  open: boolean
  onClose: () => void
}

// Event Attribution Editor Component
function EventAttributionEditor({
  event,
  campaigns,
  onSet,
  onRemove,
  isSetting,
  isRemoving,
}: {
  event: any
  campaigns?: any[]
  onSet: (eventId: number, data: { reason: string; campaign_id: number | null }) => void
  onRemove: (eventId: number) => void
  isSetting: boolean
  isRemoving: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [reason, setReason] = useState<string>(event.attribution?.reason ?? '')
  const [campaignId, setCampaignId] = useState<string>(
    event.attribution?.campaign_id != null ? String(event.attribution.campaign_id) : ''
  )

  const currentLabel = event.attribution
    ? attributionUtils.formatAttribution(event.attribution)
    : 'Set attribution'

  const requiresCampaign = attributionUtils.requiresCampaign(reason)
  const canSave = !!reason && (!requiresCampaign || !!campaignId)

  const handleSave = () => {
    if (!canSave) return
    
    onSet(event.event_id, {
      reason,
      campaign_id: campaignId ? parseInt(campaignId, 10) : null,
    })
    setEditing(false)
  }

  const handleCancel = () => {
    setReason(event.attribution?.reason ?? '')
    setCampaignId(event.attribution?.campaign_id != null ? String(event.attribution.campaign_id) : '')
    setEditing(false)
  }

  return (
    <div className="space-y-2">
      {!editing && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setEditing(true)}
          >
            {currentLabel}
          </Button>
          {event.attribution && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-red-600 hover:text-red-700"
              disabled={isRemoving}
              onClick={() => onRemove(event.event_id)}
            >
              {isRemoving ? 'Removing...' : 'Clear'}
            </Button>
          )}
        </div>
      )}
      
      {editing && (
        <div className="p-3 border rounded-md bg-muted/30 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">Reason</label>
              <Select
                value={reason || undefined}
                onValueChange={(val) => setReason(val)}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Reason" />
                </SelectTrigger>
                <SelectContent>
                  {ATTRIBUTION_REASONS.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">
                Campaign {requiresCampaign ? '(required)' : '(optional)'}
              </label>
              <Select
                value={campaignId || 'none'}
                onValueChange={(val) => setCampaignId(val === 'none' ? '' : val)}
              >
                <SelectTrigger className={`h-7 text-xs ${requiresCampaign && !campaignId ? 'border-red-500' : ''}`}>
                  <SelectValue placeholder="Campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No campaign</SelectItem>
                  {campaigns?.map(c => (
                    <SelectItem key={c.campaign_id} value={String(c.campaign_id)}>
                      {c.campaign_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {requiresCampaign && !campaignId && (
                <p className="text-[10px] text-red-600">Select a campaign for OP_CAMPAIGN attribution.</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!canSave || isSetting}
              onClick={handleSave}
            >
              {isSetting ? 'Saving...' : 'Save'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ProfileSheet({ username, open, onClose }: ProfileSheetProps) {
  const queryClient = useQueryClient()
  const { data: profile, isLoading, isError, error } = useProfile(username || '')
  const { data: campaigns } = useCampaigns()
  const { setAttribution, deleteAttribution } = useAttributionMutations()

  // Get the appropriate icon component
  const getIconComponent = (iconName: string) => {
    switch (iconName) {
      case 'Plus': return Plus
      case 'UserCheck': return UserCheck
      case 'UserX': return UserX
      case 'LogIn': return LogIn
      case 'LogOut': return LogOut
      default: return Hash
    }
  }

  if (!username) return null

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-[400px] sm:w-[600px] overflow-y-auto">
        <SheetHeader className="space-y-3 pb-6 border-b">
          <SheetTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {profile?.is_active_follower ? (
                <Badge className="bg-green-500 hover:bg-green-600 px-3 py-1">
                  <UserCheck className="mr-1 h-3 w-3" />
                  Active Follower
                </Badge>
              ) : (
                <Badge variant="outline" className="border-red-500 text-red-500 px-3 py-1">
                  <UserX className="mr-1 h-3 w-3" />
                  Not Following
                </Badge>
              )}
            </div>
          </SheetTitle>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">@{username}</h2>
            <SheetDescription className="text-sm">
              {profile && `First seen: ${formatDate(profile.first_seen_ts, 'date')}`}
            </SheetDescription>
          </div>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            <span className="ml-2 text-sm text-muted-foreground">Loading profile...</span>
          </div>
        ) : isError ? (
          <div className="text-center py-8">
            <div className="mb-3">
              <X className="h-12 w-12 text-destructive mx-auto" />
            </div>
            <h3 className="text-lg font-semibold text-destructive mb-2">Error Loading Profile</h3>
            <p className="text-sm text-muted-foreground">{error?.message}</p>
          </div>
        ) : !profile ? (
          <div className="text-center py-8">
            <div className="mb-3">
              <UserX className="h-12 w-12 text-muted-foreground mx-auto" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Profile Unavailable</h3>
            <p className="text-sm text-muted-foreground">Profile data could not be loaded.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Interaction Timeline */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Interaction Timeline</h3>
                <Badge variant="outline" className="text-xs">
                  {profile.interaction_events?.length || 0} events
                </Badge>
              </div>

              <div className="space-y-3">
                {!profile.interaction_events || profile.interaction_events.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="mb-3">
                      <Hash className="h-12 w-12 text-muted-foreground mx-auto" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">No Events Yet</h3>
                    <p className="text-sm text-muted-foreground">This profile has no recorded interactions.</p>
                  </div>
                ) : (
                  profile.interaction_events.map((event) => {
                    const { iconName, color, text } = eventUtils.getEventVisuals(event.event_type)
                    const Icon = getIconComponent(iconName)

                    return (
                      <div key={event.event_id} className="flex items-start gap-3 p-3 border rounded-lg">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${color} flex-shrink-0`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-grow min-w-0 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-sm">{text}</h4>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(event.event_ts, 'datetime')}
                            </span>
                          </div>

                          <EventAttributionEditor
                            event={event}
                            campaigns={campaigns}
                            onSet={(eventId, data) =>
                              setAttribution.mutate({ eventId, data })
                            }
                            onRemove={(eventId) =>
                              deleteAttribution.mutate(eventId)
                            }
                            isSetting={setAttribution.isPending}
                            isRemoving={deleteAttribution.isPending}
                          />
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}