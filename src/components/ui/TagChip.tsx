'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TagChipProps {
  children: React.ReactNode
  onRemove?: () => void
  disabled?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'secondary' | 'outline' | 'destructive'
}

export function TagChip({
  children,
  onRemove,
  disabled = false,
  className,
  size = 'md',
  variant = 'secondary',
}: TagChipProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 h-5',
    md: 'text-sm px-2.5 py-0.5 h-6',
    lg: 'text-sm px-3 py-1 h-7',
  }

  return (
    <Badge
      variant={variant}
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        sizeClasses[size],
        className
      )}
    >
      <span className="truncate">{children}</span>
      {onRemove && (
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-auto p-0 hover:bg-transparent',
            size === 'sm' ? 'ml-0.5' : 'ml-1',
            disabled ? 'opacity-50 cursor-not-allowed' : 'hover:text-destructive'
          )}
          onClick={(e) => {
            e.stopPropagation()
            if (!disabled) {
              onRemove()
            }
          }}
          disabled={disabled}
          aria-label="Remove tag"
        >
          <X className={cn(
            size === 'sm' ? 'h-2.5 w-2.5' : 
            size === 'md' ? 'h-3 w-3' : 
            'h-3.5 w-3.5'
          )} />
        </Button>
      )}
    </Badge>
  )
}