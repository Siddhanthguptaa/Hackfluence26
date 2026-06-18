'use client'

import { useState, useMemo, useRef, useEffect, type MouseEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { TagChip } from '@/components/ui/TagChip'
import { TagSelector } from '@/components/ui/TagSelector'
import { TagsManagerSheet } from '@/components/TagsManagerSheet'
import { BulkTagsSheet } from '@/components/BulkTagsSheet'
import { useProfiles, useTags, useProfileTagMutations } from '@/lib/hooks'
import { formatDate } from '@/lib/dates'
import { Search, UserCheck, UserX, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Pencil, Check, X, Hash } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import type { Profile, Tag } from '@/lib/hooks'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface ProfileListProps {
  onSelectProfile: (username: string) => void
  selectedProfilePks?: number[]
  onSelectionChange?: (profilePks: number[]) => void
  onBulkAttribution?: () => void
}

// API function for updating profile notes
const updateProfileNotes = async ({ username, notes }: { username: string; notes: string }) => {
  const res = await fetch(`/api/profiles/${encodeURIComponent(username)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ notes }),
  })
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(msg || 'Failed to update notes')
  }
  return res.json()
}

// Notes cell component with inline editing
function NotesCell({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState<string>(profile.notes ?? '')

  const updateNotesMutation = useMutation({
    mutationFn: updateProfileNotes,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      setEditing(false)
    },
  })

  const save = () => {
    if (!updateNotesMutation.isPending) {
      updateNotesMutation.mutate({
        username: profile.current_username,
        notes: value,
      })
    }
  }

  return (
    <div className="w-full max-w-[300px]" onClick={(e) => e.stopPropagation()}>
      {!editing ? (
        <div className="group flex items-center gap-2">
          {profile.notes && profile.notes.length > 0 ? (
            <span title={profile.notes} className="truncate text-sm flex-1">
              {profile.notes}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs flex-1">No notes</span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={2}
            autoFocus
            className="text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setEditing(false)
                setValue(profile.notes ?? '')
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                save()
              }
            }}
          />
          <div className="flex gap-1">
            <Button size="sm" onClick={save} disabled={updateNotesMutation.isPending} className="h-7 text-xs">
              <Check className="h-3 w-3 mr-1" />
              {updateNotesMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={updateNotesMutation.isPending}
              onClick={() => {
                setEditing(false)
                setValue(profile.notes ?? '')
              }}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Tags cell component with inline tag management
function TagsCell({ profile }: { profile: Profile }) {
  const { data: allTags } = useTags()
  const { addTag, removeTag } = useProfileTagMutations()

  // Bring auto_assigned flag forward from pivot
  const profileTags = (profile.tags?.map(pt => ({
    tag_id: pt.tag.tag_id,
    tag_name: pt.tag.tag_name,
    auto_assigned: pt.auto_assigned ?? false,
  })) || [])

  const availableTags = allTags?.filter(tag =>
    !profileTags.some(pt => pt.tag_id === tag.tag_id)
  ) || []

  const handleAddTag = (tagId: number) => {
    addTag.mutate({ username: profile.current_username, tagId })
  }

  const handleRemoveTag = (tagId: number) => {
    removeTag.mutate({ username: profile.current_username, tagId })
  }

  return (
    <div className="w-full max-w-[250px]" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap gap-1">
        {profileTags.map((tag) => {
          const isAuto = tag.auto_assigned
          return (
            <TagChip
              key={tag.tag_id}
              size="sm"
              variant={isAuto ? 'outline' : 'secondary'}
              onRemove={() => handleRemoveTag(tag.tag_id)}
              disabled={removeTag.isPending}
              className={isAuto ? 'border-dashed' : undefined}
            >
              <span
                title={
                  isAuto
                    ? 'Automatically inferred tag (classifier)'
                    : 'Manually assigned tag'
                }
                className="flex items-center gap-0.5"
              >
                {tag.tag_name}
                {isAuto && <span className="text-[9px] leading-none text-muted-foreground">*</span>}
              </span>
            </TagChip>
          )
        })}
        {availableTags.length > 0 && (
          <TagSelector
            availableTags={availableTags}
            onSelect={handleAddTag}
            disabled={addTag.isPending}
            variant="icon"
            size="sm"
          />
        )}
        {profileTags.length === 0 && availableTags.length === 0 && (
          <span className="text-muted-foreground text-xs">No tags</span>
        )}
      </div>
    </div>
  )
}

export function ProfileList({
  onSelectProfile,
  selectedProfilePks = [],
  onSelectionChange,
  onBulkAttribution
}: ProfileListProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [tagFilter, setTagFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(25)
  // Index of the last checkbox that was interacted with (for shift+click range selection)
  const [lastCheckedIndex, setLastCheckedIndex] = useState<number | null>(null)
  // Capture whether the pointer interaction that will trigger onCheckedChange had Shift pressed.
  const pointerShiftRef = useRef<boolean | null>(null)

  const { data: rawTags } = useTags()
  const allTags = useMemo<Tag[]>(() => {
    if (Array.isArray(rawTags)) return rawTags as Tag[]
    if (rawTags && Array.isArray((rawTags as any).data)) return (rawTags as any).data as Tag[]
    return []
  }, [rawTags])
  const { data: profilesResponse, isLoading, isError, error } = useProfiles({
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: searchQuery || undefined,
    page,
    pageSize,
    sortBy: 'first_seen_ts',
    sortDir: 'desc'
  })

  let profiles = profilesResponse?.data || []
  let total = profilesResponse?.total || 0
  let totalPages = profilesResponse?.totalPages || 1

  // Tooltip text for selected profiles (best-effort: visible names first, then try to fetch more)
  const [selectedNamesTooltip, setSelectedNamesTooltip] = useState<string>('')
  useEffect(() => {
    if (!selectedProfilePks || selectedProfilePks.length === 0) {
      setSelectedNamesTooltip('')
      return
    }

    // Build a quick map from currently-loaded profiles
    const visibleMap = new Map<number, string>(profiles.map((p: any) => [p.profile_pk, p.current_username]))
    const missingPks = selectedProfilePks.filter(pk => !visibleMap.has(pk))
    const visibleNames = selectedProfilePks.map(pk => visibleMap.get(pk) ?? `#${pk}`)

    // If everything is visible, set tooltip immediately
    if (missingPks.length === 0) {
      setSelectedNamesTooltip(visibleNames.join(', '))
      return
    }

    // Otherwise, attempt a best-effort fetch to resolve missing PKs (non-blocking)
    let cancelled = false
    ;(async () => {
      try {
        // Request a larger page to try and capture selected profiles across pages.
        // This is best-effort and intentionally conservative to avoid heavy queries.
        const pageSizeFetch = Math.max(100, selectedProfilePks.length)
        const res = await fetch(`/api/profiles?page=1&pageSize=${pageSizeFetch}`)
        if (!res.ok) {
          if (!cancelled) setSelectedNamesTooltip(visibleNames.join(', '))
          return
        }
        const json = await res.json()
        const candidates = (json.data && json.data.data) || json.data || []
        const fetchedMap = new Map<number, string>(candidates.map((p: any) => [p.profile_pk, p.current_username]))
        const fullNames = selectedProfilePks.map(pk => fetchedMap.get(pk) ?? visibleMap.get(pk) ?? `#${pk}`)
        if (!cancelled) setSelectedNamesTooltip(fullNames.join(', '))
      } catch {
        if (!cancelled) setSelectedNamesTooltip(visibleNames.join(', '))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedProfilePks, profilesResponse, profiles])

  // Apply client-side tag filtering
  if (tagFilter !== 'all' && tagFilter) {
    const tagId = parseInt(tagFilter, 10)
    profiles = profiles.filter(profile =>
      profile.tags?.some(pt => pt.tag.tag_id === tagId)
    )
    total = profiles.length
    totalPages = Math.ceil(total / pageSize)
  }

  // Status filter semantics:
  // follower  = they follow me AND I do NOT follow them back
  // following = I follow them AND they do NOT follow me back
  // mutual    = both follow each other
  // pending   = I have an outstanding follow request
  // none      = all flags false
  const statusOptions = [
    { key: 'all', label: 'All' },
    { key: 'follower', label: 'Followers' },
    { key: 'following', label: 'Following' },
    { key: 'mutual', label: 'Mutual' },
    { key: 'pending', label: 'Pending' },
    { key: 'none', label: 'No Connection' }
  ]

  // Map backend event_type codes to human readable labels for the Last Interaction column
  function formatEventType(eventType: string | undefined): string {
    if (!eventType) return '—'
    switch (eventType) {
      case 'FOLLOWED_ME': return 'Followed Me'
      case 'UNFOLLOWED_ME': return 'Unfollowed Me'
      case 'I_FOLLOWED': return 'I Followed'
      case 'I_UNFOLLOWED': return 'I Unfollowed'
      case 'FOLLOW_REQUEST_SENT': return 'Follow Request Sent'
      case 'PENDING_REQUEST_CANCELLED': return 'Request Cancelled'
      default: return eventType
    }
  }

  // Get status badge for profile
  const getStatusBadge = (profile: Profile) => {
    const isFollower = profile.is_active_follower
    const isFollowing = profile.is_currently_following
    const isPending = profile.is_pending_outbound_request

    if (isFollower && isFollowing) {
      return (
        <Badge className="bg-blue-600 hover:bg-blue-700">
          <UserCheck className="mr-1 h-3 w-3" />
          Mutual
        </Badge>
      )
    } else if (isFollower) {
      return (
        <Badge className="bg-green-500 hover:bg-green-600">
          <UserCheck className="mr-1 h-3 w-3" />
          Follower
        </Badge>
      )
    } else if (isFollowing) {
      return (
        <Badge className="bg-amber-500 hover:bg-amber-600">
          <UserCheck className="mr-1 h-3 w-3" />
          Following
        </Badge>
      )
    } else if (isPending) {
      return (
        <Badge className="bg-purple-500 hover:bg-purple-600">
          <UserCheck className="mr-1 h-3 w-3" />
          Pending
        </Badge>
      )
    } else {
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <UserX className="mr-1 h-3 w-3" />
          None
        </Badge>
      )
    }
  }

  // Handle row selection
  const handleRowSelection = (profilePk: number, checked: boolean) => {
    if (!onSelectionChange) return
    
    const newSelection = checked 
      ? [...selectedProfilePks, profilePk]
      : selectedProfilePks.filter(pk => pk !== profilePk)
    
    onSelectionChange(newSelection)
  }

  // Handle click on a row checkbox or modified row click, supporting shift+click to select ranges.
  const handleRowClick = (profilePk: number, index: number, e: MouseEvent) => {
    if (!onSelectionChange) return

    const currentlySelected = selectedProfilePks.includes(profilePk)
    const intendedChecked = !currentlySelected
    const shift = e.shiftKey

    if (shift && lastCheckedIndex !== null) {
      const start = Math.min(lastCheckedIndex, index)
      const end = Math.max(lastCheckedIndex, index)
      const rangePks = profiles.slice(start, end + 1).map(p => p.profile_pk)

      if (intendedChecked) {
        const newSelection = Array.from(new Set([...selectedProfilePks, ...rangePks]))
        onSelectionChange(newSelection)
      } else {
        const removeSet = new Set(rangePks)
        const newSelection = selectedProfilePks.filter(pk => !removeSet.has(pk))
        onSelectionChange(newSelection)
      }
    } else {
      handleRowSelection(profilePk, intendedChecked)
    }

    setLastCheckedIndex(index)
  }

  // Checkbox toggle handler using pointerShiftRef to know if Shift was held on pointer down
  const handleCheckboxToggle = (profilePk: number, index: number, targetChecked: boolean) => {
    if (!onSelectionChange) return
    const shift = pointerShiftRef.current
    pointerShiftRef.current = null

    if (shift && lastCheckedIndex !== null) {
      const start = Math.min(lastCheckedIndex, index)
      const end = Math.max(lastCheckedIndex, index)
      const rangePks = profiles.slice(start, end + 1).map(p => p.profile_pk)
      if (targetChecked) {
        const newSelection = Array.from(new Set([...selectedProfilePks, ...rangePks]))
        onSelectionChange(newSelection)
      } else {
        const removeSet = new Set(rangePks)
        const newSelection = selectedProfilePks.filter(pk => !removeSet.has(pk))
        onSelectionChange(newSelection)
      }
    } else {
      handleRowSelection(profilePk, targetChecked)
    }
    setLastCheckedIndex(index)
  }

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return
    
    if (checked) {
      const allVisiblePks = profiles.map(p => p.profile_pk)
      const newSelection = Array.from(new Set([...selectedProfilePks, ...allVisiblePks]))
      onSelectionChange(newSelection)
    } else {
      const visiblePkSet = new Set(profiles.map(p => p.profile_pk))
      const newSelection = selectedProfilePks.filter(pk => !visiblePkSet.has(pk))
      onSelectionChange(newSelection)
    }
  }

  const allVisibleSelected = profiles.length > 0 && profiles.every(p => selectedProfilePks.includes(p.profile_pk))
  const someVisibleSelected = profiles.some(p => selectedProfilePks.includes(p.profile_pk))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Profiles</span>
          <div className="flex items-center gap-3">
            {selectedProfilePks.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Badge variant="outline" className="text-sm">
                    {selectedProfilePks.length} selected
                  </Badge>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="max-h-40 overflow-auto text-sm">
                    {selectedNamesTooltip ? (
                      selectedNamesTooltip.split(', ').map((n, i) => (
                        <div key={i} className="py-0.5">{n}</div>
                      ))
                    ) : (
                      <div className="text-muted-foreground">Loading...</div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <TagsManagerSheet />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Search */}
          <div className="space-y-2">
            <label htmlFor="search" className="text-sm font-medium">Search Username</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Search usernames..."
                className="pl-8"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPage(1)
                }}
              />
            </div>
          </div>

          {/* Status Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <Button
                  key={option.key}
                  size="sm"
                  variant={statusFilter === option.key ? 'default' : 'outline'}
                  onClick={() => {
                    setStatusFilter(option.key)
                    setPage(1)
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Tag Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Filter by Tag</label>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={tagFilter === 'all' ? 'default' : 'outline'}
                onClick={() => {
                  setTagFilter('all')
                  setPage(1)
                }}
              >
                All Tags
              </Button>
              {allTags?.map((tag) => (
                <Button
                  key={tag.tag_id}
                  size="sm"
                  variant={tagFilter === String(tag.tag_id) ? 'default' : 'outline'}
                  onClick={() => {
                    setTagFilter(String(tag.tag_id))
                    setPage(1)
                  }}
                  className="flex items-center gap-1"
                >
                  <Hash className="h-3 w-3" />
                  {tag.tag_name}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Results Summary */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total > 0 ? `Showing ${((page - 1) * pageSize) + 1}-${Math.min(page * pageSize, total)} of ${total}` : 'No results'}
          </span>
          {selectedProfilePks.length > 0 && (
            <span>{selectedProfilePks.length} profiles selected across all pages</span>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            <span className="ml-2 text-sm text-muted-foreground">Loading profiles...</span>
          </div>
        ) : isError ? (
          <div className="text-center py-8">
            <p className="text-sm text-destructive">Error: {error?.message}</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {onSelectionChange && (
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={allVisibleSelected ? true : (someVisibleSelected ? 'indeterminate' as any : false)}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                  )}
                  <TableHead>Username</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Interaction Reason</TableHead>
                  <TableHead>Last Interaction At</TableHead>
                  <TableHead>First Seen</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.length === 0 ? (
                 <TableRow>
                   <TableCell
                     colSpan={onSelectionChange ? 8 : 7}
                     className="h-24 text-center text-muted-foreground"
                   >
                      <div className="flex flex-col items-center justify-center py-4">
                        <Search className="h-8 w-8 mb-2 text-muted-foreground" />
                        <p>No profiles found</p>
                        <p className="text-xs">Try adjusting your filters</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  profiles.map((profile, idx) => (
                    <TableRow
                      key={profile.profile_pk}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={(e) => {
                        // Support row-based multi-select with Shift / Cmd / Ctrl
                        // - Shift+Click: range select based on last anchor
                        // - Cmd/Ctrl+Click: toggle single row without opening sheet
                        if ((e.shiftKey || e.metaKey || e.ctrlKey) && onSelectionChange) {
                          e.preventDefault();
                          e.stopPropagation();
                          handleRowClick(profile.profile_pk, idx, e as unknown as MouseEvent);
                          return;
                        }
                        onSelectProfile(profile.current_username);
                      }}
                    >
                      {onSelectionChange && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div
                            onPointerDown={(e) => {
                              // Record whether shift was held for this pointer interaction
                              pointerShiftRef.current = e.shiftKey
                            }}
                            onClick={(e) => {
                              // Prevent row onClick bubbling when clicking the checkbox container
                              e.stopPropagation()
                            }}
                          >
                            <Checkbox
                              checked={selectedProfilePks.includes(profile.profile_pk)}
                              onCheckedChange={(checked) => {
                                handleCheckboxToggle(profile.profile_pk, idx, checked === true)
                              }}
                              // Keyboard (space) toggles won't trigger pointerDown; shift selection not expected for keyboard by default.
                            />
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="font-medium">
                        <a
                          href={`https://instagram.com/${profile.current_username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          @{profile.current_username}
                        </a>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(profile)}
                      </TableCell>
                      <TableCell>
                        {profile.interaction_events?.[0]?.attribution?.reason
                          ? profile.interaction_events[0].attribution.reason +
                            (profile.interaction_events[0].attribution.campaign?.campaign_name
                              ? ` (${profile.interaction_events[0].attribution.campaign.campaign_name})`
                              : '')
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {profile.interaction_events?.[0]?.event_ts
                          ? formatDate(profile.interaction_events[0].event_ts, 'datetime')
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {formatDate(profile.first_seen_ts, 'date')}
                      </TableCell>
                      <TableCell>
                        <TagsCell profile={profile} />
                      </TableCell>
                      <TableCell>
                        <NotesCell profile={profile} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(1)}
                disabled={page === 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(page + 1)}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Floating Island for Multi-Select Actions */}
      {selectedProfilePks.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="rounded-full border bg-background/95 supports-[backdrop-filter]:bg-background/70 backdrop-blur px-4 py-3 shadow-lg flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Badge variant="secondary" className="text-xs">
                    {selectedProfilePks.length} selected
                  </Badge>
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  <div className="max-h-40 overflow-auto text-xs">
                    {selectedNamesTooltip ? (
                      selectedNamesTooltip.split(', ').map((n, i) => (
                        <div key={i} className="py-0.5">{n}</div>
                      ))
                    ) : (
                      <div className="text-muted-foreground">Loading...</div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <BulkTagsSheet profilePks={selectedProfilePks} />
              {onBulkAttribution && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onBulkAttribution}
                >
                  Bulk Attribution
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  // Export functionality
                  const selectedProfiles = profiles.filter(p => selectedProfilePks.includes(p.profile_pk));
                  const csvData = selectedProfiles.map(p =>
                    `${p.current_username},${p.is_active_follower ? 'Follower' : 'Not Following'}`
                  ).join('\n');
                  const blob = new Blob([`Username,Status\n${csvData}`], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `selected-profiles-${selectedProfilePks.length}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onSelectionChange?.([])}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}