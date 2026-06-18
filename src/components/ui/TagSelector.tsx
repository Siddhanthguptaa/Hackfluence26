'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Plus, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Tag {
  tag_id: number
  tag_name: string
}

interface TagSelectorProps {
  availableTags: Tag[]
  onSelect: (tagId: number) => void
  disabled?: boolean
  variant?: 'button' | 'icon'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function TagSelector({
  availableTags,
  onSelect,
  disabled = false,
  variant = 'button',
  size = 'md',
  className,
}: TagSelectorProps) {
  const [open, setOpen] = useState(false)

  const handleSelectTag = (tagId: number) => {
    onSelect(tagId)
    setOpen(false)
  }

  const sizeClasses = {
    sm: 'h-5 px-2 text-xs',
    md: 'h-6 px-2.5 text-sm',
    lg: 'h-7 px-3 text-sm',
  }

  const iconSizeClasses = {
    sm: 'h-5 w-5 p-0',
    md: 'h-6 w-6 p-0',
    lg: 'h-7 w-7 p-0',
  }

  const iconSize = {
    sm: 'h-2.5 w-2.5',
    md: 'h-3 w-3',
    lg: 'h-3.5 w-3.5',
  }

  if (availableTags.length === 0) {
    return null
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            variant === 'icon' ? iconSizeClasses[size] : sizeClasses[size],
            'border-dashed',
            className
          )}
        >
          <Plus className={iconSize[size]} />
          {variant === 'button' && (
            <span className="ml-1">Add Tag</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-2">
          <div className="text-xs font-medium text-muted-foreground mb-2 px-2">
            Select a tag to add:
          </div>
          <div className="max-h-48 overflow-y-auto">
            {availableTags.map((tag) => (
              <Button
                key={tag.tag_id}
                variant="ghost"
                size="sm"
                className="w-full justify-start text-left h-8 px-2"
                onClick={() => handleSelectTag(tag.tag_id)}
              >
                <Hash className="h-3 w-3 mr-2 text-muted-foreground" />
                <span className="truncate">{tag.tag_name}</span>
              </Button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}