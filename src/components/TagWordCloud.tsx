'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface WordCloudData {
  text: string
  value: number
}

interface TagWordCloudProps {
  data: WordCloudData[]
  title: string
  maxWords?: number
  colorScheme?: 'blue' | 'green' | 'red' | 'purple'
}

export function TagWordCloud({ 
  data, 
  title, 
  maxWords = 50,
  colorScheme = 'blue' 
}: TagWordCloudProps) {
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return []
    
    // Sort by value and take only the top words
    const sortedData = data
      .slice(0, maxWords)
      .sort((a, b) => b.value - a.value)
    
    const maxValue = sortedData[0]?.value || 1
    const minValue = sortedData[sortedData.length - 1]?.value || 1
    
    // Calculate font sizes (12px to 48px)
    return sortedData.map((item, index) => {
      const normalizedValue = (item.value - minValue) / (maxValue - minValue)
      const fontSize = Math.max(12, Math.min(48, 12 + normalizedValue * 36))
      
      return {
        ...item,
        fontSize,
        opacity: Math.max(0.4, 0.4 + normalizedValue * 0.6)
      }
    })
  }, [data, maxWords])

  const getColorClass = (index: number) => {
    const colors = {
      blue: [
        'text-blue-600',
        'text-blue-500', 
        'text-blue-700',
        'text-blue-400',
        'text-blue-800'
      ],
      green: [
        'text-green-600',
        'text-green-500',
        'text-green-700', 
        'text-green-400',
        'text-green-800'
      ],
      red: [
        'text-red-600',
        'text-red-500',
        'text-red-700',
        'text-red-400', 
        'text-red-800'
      ],
      purple: [
        'text-purple-600',
        'text-purple-500',
        'text-purple-700',
        'text-purple-400',
        'text-purple-800'
      ]
    }
    
    return colors[colorScheme][index % colors[colorScheme].length]
  }

  if (!processedData.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            No tag data available
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {title}
          <span className="text-sm font-normal text-muted-foreground">
            {processedData.length} tags
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 justify-center items-center min-h-[200px] p-4">
          {processedData.map((item, index) => (
            <span
              key={item.text}
              className={`
                font-semibold cursor-default transition-all duration-200 hover:scale-110
                ${getColorClass(index)}
              `}
              style={{
                fontSize: `${item.fontSize}px`,
                opacity: item.opacity,
                lineHeight: 1.2
              }}
              title={`${item.text}: ${item.value} occurrences`}
            >
              {item.text}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Alternative grid-based layout for better space utilization
export function TagWordCloudGrid({ 
  data, 
  title, 
  maxWords = 50,
  colorScheme = 'blue' 
}: TagWordCloudProps) {
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return []
    
    const sortedData = data
      .slice(0, maxWords)
      .sort((a, b) => b.value - a.value)
    
    const maxValue = sortedData[0]?.value || 1
    
    return sortedData.map((item, index) => {
      const normalizedValue = item.value / maxValue
      
      return {
        ...item,
        size: normalizedValue > 0.8 ? 'large' : 
              normalizedValue > 0.5 ? 'medium' : 
              normalizedValue > 0.2 ? 'small' : 'tiny',
        rank: index + 1
      }
    })
  }, [data, maxWords])

  const getSizeClass = (size: string) => {
    switch (size) {
      case 'large': return 'text-2xl px-4 py-2'
      case 'medium': return 'text-lg px-3 py-1.5'
      case 'small': return 'text-base px-2 py-1'
      case 'tiny': return 'text-sm px-2 py-1'
      default: return 'text-base px-2 py-1'
    }
  }

  const getColorClass = (index: number) => {
    const colors = {
      blue: [
        'bg-blue-100 text-blue-800 border-blue-200',
        'bg-blue-50 text-blue-700 border-blue-100',
        'bg-blue-200 text-blue-900 border-blue-300'
      ],
      green: [
        'bg-green-100 text-green-800 border-green-200',
        'bg-green-50 text-green-700 border-green-100',
        'bg-green-200 text-green-900 border-green-300'
      ],
      red: [
        'bg-red-100 text-red-800 border-red-200',
        'bg-red-50 text-red-700 border-red-100',
        'bg-red-200 text-red-900 border-red-300'
      ],
      purple: [
        'bg-purple-100 text-purple-800 border-purple-200',
        'bg-purple-50 text-purple-700 border-purple-100',
        'bg-purple-200 text-purple-900 border-purple-300'
      ]
    }
    
    return colors[colorScheme][index % colors[colorScheme].length]
  }

  if (!processedData.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-40 text-muted-foreground">
            No tag data available
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {title}
          <span className="text-sm font-normal text-muted-foreground">
            {processedData.length} tags
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 p-2">
          {processedData.map((item, index) => (
            <span
              key={item.text}
              className={`
                rounded-lg border font-medium transition-all duration-200 hover:scale-105 cursor-default
                ${getSizeClass(item.size)}
                ${getColorClass(index)}
              `}
              title={`${item.text}: ${item.value} occurrences (Rank #${item.rank})`}
            >
              {item.text}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}