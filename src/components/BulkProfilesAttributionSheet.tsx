'use client'

import { useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useCampaigns, useAttributionMutations } from '@/lib/hooks'
import { attributionUtils, ATTRIBUTION_REASONS } from '@/lib/attribution'
import { Users, Play } from 'lucide-react'

interface BulkProfilesAttributionSheetProps {
  profilePks: number[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted?: () => void
}

export function BulkProfilesAttributionSheet({
  profilePks,
  open,
  onOpenChange,
  onCompleted
}: BulkProfilesAttributionSheetProps) {
  const [reason, setReason] = useState<string>('OP_CAMPAIGN')
  const [target, setTarget] = useState<'FOLLOWED' | 'UNFOLLOWED' | 'BOTH'>('FOLLOWED')
  const [campaignId, setCampaignId] = useState<string>('')

  const { data: campaigns } = useCampaigns()
  const { bulkAttribution } = useAttributionMutations()

  const needsCampaign = attributionUtils.requiresCampaign(reason)
  const parsedCampaignId = campaignId.trim() === '' ? null : parseInt(campaignId, 10)

  const handleApply = () => {
    if (profilePks.length === 0) return
    if (needsCampaign && !parsedCampaignId) return

    bulkAttribution.mutate({
      profile_pks: profilePks,
      reason,
      campaign_id: parsedCampaignId,
      target
    }, {
      onSuccess: () => {
        onOpenChange(false)
        if (onCompleted) onCompleted()
        // Reset form
        setReason('OP_CAMPAIGN')
        setTarget('FOLLOWED')
        setCampaignId('')
      }
    })
  }

  const disabled = profilePks.length === 0 || (needsCampaign && !parsedCampaignId) || bulkAttribution.isPending

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Bulk Attribution
          </SheetTitle>
          <SheetDescription>
            Apply attribution to the latest events for {profilePks.length} selected profiles.
            Existing attributions will not be overwritten.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 py-4">
          {/* Profile Count */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Selected Profiles:</span>
            <Badge variant="outline">
              {profilePks.length} profiles
            </Badge>
          </div>

          {/* Attribution Reason */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Attribution Reason</label>
            <Select
              value={reason}
              onValueChange={(value) => setReason(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {ATTRIBUTION_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {needsCampaign && !parsedCampaignId && (
              <p className="text-xs text-destructive">
                Campaign required for {reason}.
              </p>
            )}
          </div>

          {/* Target Events */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Target Events</label>
            <Select
              value={target}
              onValueChange={(value: any) => setTarget(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FOLLOWED">FOLLOWED (they followed me)</SelectItem>
                <SelectItem value="UNFOLLOWED">UNFOLLOWED (they unfollowed me)</SelectItem>
                <SelectItem value="BOTH">BOTH</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              For each profile, the latest event of the selected type(s) will be attributed.
            </p>
          </div>

          {/* Campaign Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Campaign {needsCampaign ? '(required)' : '(optional)'}
            </label>
            <Select
              value={campaignId || 'none'}
              onValueChange={(value) => setCampaignId(value === 'none' ? '' : value)}
            >
              <SelectTrigger className={needsCampaign && !campaignId ? 'border-destructive' : ''}>
                <SelectValue
                  placeholder={
                    needsCampaign ? 'Select campaign (required)' : 'Select campaign (optional)'
                  }
                />
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
          </div>

          {/* Help Text */}
          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-1">
            <p><strong>How this works:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>For each selected profile, we find their latest {target.toLowerCase()} event</li>
              <li>Only events that don't already have an attribution will be updated</li>
              <li>The attribution reason and campaign will be applied to qualifying events</li>
              <li>No existing attributions will be modified</li>
            </ul>
          </div>
        </div>

        <SheetFooter className="flex flex-col gap-2">
          <Button
            onClick={handleApply}
            disabled={disabled}
            className="w-full"
          >
            {bulkAttribution.isPending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Applying...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Apply Attribution to {profilePks.length} Profiles
              </>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={bulkAttribution.isPending}
            className="w-full"
          >
            Cancel
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            This operation cannot be undone. Only unattributed events will be modified.
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}