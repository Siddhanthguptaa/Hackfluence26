'use client'

import { useState, useMemo } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Pencil, Trash2, Check, X, Tags, Plus, Hash } from 'lucide-react'
import { useTags, useTagMutations, type Tag } from '@/lib/hooks'

export function TagsManagerSheet() {
  const { data: rawTags, isLoading, isError, error } = useTags()
  const tags = useMemo<Tag[]>(() => {
    if (Array.isArray(rawTags)) return rawTags as Tag[]
    if (rawTags && Array.isArray((rawTags as any).data)) return (rawTags as any).data as Tag[]
    return []
  }, [rawTags])
  const { create, update, remove } = useTagMutations()
  
  const [newTagName, setNewTagName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const name = newTagName.trim()
    if (!name) return
    if (!create.isPending) {
      create.mutate(name, {
        onSuccess: () => {
          setNewTagName('')
        }
      })
    }
  }

  const handleSave = (tag: { tag_id: number; tag_name: string }) => {
    const name = editingName.trim()
    if (name && name !== tag.tag_name) {
      update.mutate({ id: tag.tag_id, tagName: name }, {
        onSuccess: () => {
          setEditingId(null)
          setEditingName('')
        }
      })
    } else {
      setEditingId(null)
      setEditingName('')
    }
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditingName('')
  }

  const handleDelete = (tag: { tag_id: number; tag_name: string }) => {
    if (remove.isPending) return
    if (window.confirm(`Delete tag "${tag.tag_name}"? This will remove it from all profiles.`)) {
      remove.mutate(tag.tag_id)
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          <Tags className="h-4 w-4 mr-2" />
          Manage Tags
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] sm:w-[500px] overflow-y-auto">
        <SheetHeader className="space-y-3 pb-6 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5" />
            Manage Tags
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Create New Tag */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Create New Tag
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateSubmit} className="flex gap-2">
                <Input
                  placeholder="Enter tag name..."
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="flex-1"
                />
                <Button 
                  type="submit" 
                  disabled={create.isPending || !newTagName.trim()}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {create.isPending ? 'Creating...' : 'Create'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Tags List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  All Tags
                </span>
                <Badge variant="outline" className="text-xs">
                  {tags?.length || 0} tags
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  <span className="ml-2 text-sm text-muted-foreground">Loading tags...</span>
                </div>
              ) : isError ? (
                <div className="text-center py-8">
                  <X className="h-8 w-8 text-destructive mx-auto mb-2" />
                  <p className="text-sm text-destructive">Error: {error?.message}</p>
                </div>
              ) : !tags || tags.length === 0 ? (
                <div className="text-center py-8">
                  <Hash className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No tags created yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Create your first tag above</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {tags.map((tag, index) => {
                    const isEditing = editingId === tag.tag_id
                    return (
                      <div key={tag.tag_id}>
                        {index > 0 && <Separator className="my-2" />}
                        <div className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50/50 group">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Hash className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            {isEditing ? (
                              <Input
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault()
                                    handleSave(tag)
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault()
                                    handleCancel()
                                  }
                                }}
                                autoFocus
                                className="h-8"
                              />
                            ) : (
                              <span className="font-medium truncate">{tag.tag_name}</span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {isEditing ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleSave(tag)}
                                  disabled={update.isPending}
                                  className="h-8 w-8 p-0"
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={handleCancel}
                                  disabled={update.isPending}
                                  className="h-8 w-8 p-0"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingId(tag.tag_id)
                                    setEditingName(tag.tag_name)
                                  }}
                                  className="h-8 w-8 p-0"
                                  title="Rename tag"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDelete(tag)}
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                  title="Delete tag"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </SheetContent>
    </Sheet>
  )
}