import { createHash } from 'crypto'

interface ContentAnalysisResult {
  suggestions: any[]
  colorPalette: any[]
  brandAnalysis: string[]
}

interface CacheEntry {
  data: ContentAnalysisResult
  timestamp: number
  fileHash: string
  fileName: string
  fileSize: number
}

const CACHE_KEY_PREFIX = 'content_analysis_cache_'
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Generate a hash for the file content to use as cache key
 */
export async function generateFileHash(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Get cached analysis result if it exists and is not expired
 */
export function getCachedAnalysis(fileHash: string): ContentAnalysisResult | null {
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${fileHash}`
    const cached = localStorage.getItem(cacheKey)
    
    if (!cached) return null
    
    const cacheEntry: CacheEntry = JSON.parse(cached)
    const now = Date.now()
    
    // Check if cache is expired
    if (now - cacheEntry.timestamp > CACHE_EXPIRY_MS) {
      localStorage.removeItem(cacheKey)
      return null
    }
    
    // Update last accessed time
    cacheEntry.timestamp = now
    localStorage.setItem(cacheKey, JSON.stringify(cacheEntry))
    
    return cacheEntry.data
  } catch (error) {
    console.error('Error reading from cache:', error)
    return null
  }
}

/**
 * Store analysis result in cache
 */
export function setCachedAnalysis(
  fileHash: string,
  fileName: string,
  fileSize: number,
  data: ContentAnalysisResult
): void {
  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${fileHash}`
    const cacheEntry: CacheEntry = {
      data,
      timestamp: Date.now(),
      fileHash,
      fileName,
      fileSize
    }
    
    localStorage.setItem(cacheKey, JSON.stringify(cacheEntry))
    
    // Clean up old cache entries (keep only last 10)
    cleanupOldCacheEntries()
  } catch (error) {
    console.error('Error storing in cache:', error)
  }
}

/**
 * Clean up old cache entries, keeping only the most recent 10
 */
function cleanupOldCacheEntries(): void {
  try {
    const cacheEntries: { key: string; timestamp: number }[] = []
    
    // Find all cache entries
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        try {
          const cached = localStorage.getItem(key)
          if (cached) {
            const entry: CacheEntry = JSON.parse(cached)
            cacheEntries.push({ key, timestamp: entry.timestamp })
          }
        } catch (e) {
          // Remove invalid entries
          localStorage.removeItem(key)
        }
      }
    }
    
    // Sort by timestamp (newest first) and keep only 10
    cacheEntries.sort((a, b) => b.timestamp - a.timestamp)
    
    if (cacheEntries.length > 10) {
      const toRemove = cacheEntries.slice(10)
      toRemove.forEach(entry => {
        localStorage.removeItem(entry.key)
      })
    }
  } catch (error) {
    console.error('Error cleaning up cache:', error)
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { totalEntries: number; totalSize: number } {
  let totalEntries = 0
  let totalSize = 0
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        totalEntries++
        const cached = localStorage.getItem(key)
        if (cached) {
          totalSize += cached.length
        }
      }
    }
  } catch (error) {
    console.error('Error getting cache stats:', error)
  }
  
  return { totalEntries, totalSize }
}

/**
 * Clear all cache entries
 */
export function clearCache(): void {
  try {
    const keysToRemove: string[] = []
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key))
  } catch (error) {
    console.error('Error clearing cache:', error)
  }
}
