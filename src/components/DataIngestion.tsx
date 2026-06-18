'use client'

import { useState, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Upload, FileArchive, CheckCircle, AlertCircle, Loader2, X, File } from 'lucide-react'
import { toast } from 'sonner'

type FileStatus = 'pending' | 'processing' | 'success' | 'error'

interface ProcessedFile {
  id: string
  file: File
  status: FileStatus
  result?: IngestionResult
  error?: string
  startTime?: number
  endTime?: number
  // added: effective snapshot timestamp (ms) used to order imports and send to API
  snapshotTime?: number
}

interface IngestionResult {
  snapshot_date: string
  new_profiles: number
  total_events_created: number
  event_breakdown: Record<string, number>
  profile_updates: number
}

export function DataIngestion() {
  const [files, setFiles] = useState<ProcessedFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const generateFileId = (file: File) => `${file.name}-${file.size}-${file.lastModified}`

  // Helper: parse YYYY-MM-DD from filename (e.g., instagram-user-2025-06-13-ABC.zip)
  const parseDateFromFilename = (filename: string): number | undefined => {
    const match = filename.match(/(\d{4}-\d{2}-\d{2})/)
    if (!match) return undefined
    const d = new Date(match[1] + 'T00:00:00Z')
    if (isNaN(d.getTime())) return undefined
    return d.getTime()
  }

  // Helper: inspect ZIP internals to find stored timestamps for required files.
  // Returns the latest internal file timestamp in ms, or undefined if none found.
  const getInnerLatestTimestamp = async (file: File): Promise<number | undefined> => {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const zipContents = await zip.loadAsync(arrayBuffer)

      const paths = [
        'connections/followers_and_following/followers_1.json',
        'connections/followers_and_following/following.json',
        'connections/followers_and_following/pending_follow_requests.json',
      ]

      const candidateDates: number[] = []
      for (const path of paths) {
        let zipFile = zipContents.file(path)
        if (!zipFile) {
          const allFiles = Object.keys(zipContents.files)
          const matchingFile = allFiles.find(fn => fn.endsWith(path) || fn.includes(path.replace('connections/', '')))
          if (matchingFile) zipFile = zipContents.file(matchingFile)
        }
        if (zipFile && zipFile.date) {
          candidateDates.push(zipFile.date.getTime())
        }
      }

      if (candidateDates.length === 0) return undefined
      return Math.max(...candidateDates)
    } catch {
      return undefined
    }
  }

  // Determine the "effective" timestamp for ordering and ingestion:
  // Prefer internal ZIP timestamp if >= year 2010, otherwise fall back to the filename date.
  const getEffectiveTimestamp = async (file: File): Promise<number | undefined> => {
    const cutoff = new Date('2010-01-01T00:00:00Z').getTime()
    const inner = await getInnerLatestTimestamp(file)
    if (inner && inner >= cutoff) return inner
    const parsed = parseDateFromFilename(file.name)
    if (parsed) return parsed
    // If we have an inner timestamp even if < 2010, still return it as last resort
    return inner
  }

  const processFile = async (processedFile: ProcessedFile) => {
    const { file } = processedFile

    // Update status to processing
    setFiles(prev => prev.map(f => 
      f.id === processedFile.id 
        ? { ...f, status: 'processing' as FileStatus, startTime: typeof window !== 'undefined' ? Date.now() : 0 }
        : f
    ))

    try {
      // Read the ZIP file
      const arrayBuffer = await file.arrayBuffer()
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const zipContents = await zip.loadAsync(arrayBuffer)

      // Extract required files and their stored timestamps inside the ZIP
      const extractFile = async (path: string): Promise<{ text: string; dateMs: number | null }> => {
        // Try exact path first
        let zipFile = zipContents.file(path)
        
        // If not found, try with any root directory prefix
        if (!zipFile) {
          const allFiles = Object.keys(zipContents.files)
          const matchingFile = allFiles.find(fileName => 
            fileName.endsWith(path) || fileName.includes(path.replace('connections/', ''))
          )
          
          if (matchingFile) {
            zipFile = zipContents.file(matchingFile)
          }
        }

        if (!zipFile) {
          throw new Error(`Required file not found: ${path}`)
        }

        // JSZip exposes a .date property on the file entry (Date)
        const dateMs = zipFile.date ? zipFile.date.getTime() : null
        const text = await zipFile.async('text')
        return { text, dateMs }
      }

      // Extract all required texts and collect inner timestamps
      const followers1 = await extractFile('connections/followers_and_following/followers_1.json')
      const following = await extractFile('connections/followers_and_following/following.json')
      const pending = await extractFile('connections/followers_and_following/pending_follow_requests.json')

      // Determine candidate internal timestamp & apply the "reasonable" rule
      const candidateDates = [followers1.dateMs, following.dateMs, pending.dateMs].filter(d => typeof d === 'number') as number[]
      const innerFileLastModified = candidateDates.length > 0 ? Math.max(...candidateDates) : undefined
      const cutoff = new Date('2010-01-01T00:00:00Z').getTime()

      // Prefer a precomputed snapshotTime on the processedFile (computed during addFiles),
      // otherwise apply the same reasoning here.
      let finalTimestamp = processedFile.snapshotTime
      if (!finalTimestamp) {
        if (innerFileLastModified && innerFileLastModified >= cutoff) {
          finalTimestamp = innerFileLastModified
        } else {
          // Try parse from filename as fallback
          const parsed = ((): number | undefined => {
            const match = file.name.match(/(\d{4}-\d{2}-\d{2})/)
            if (!match) return undefined
            const d = new Date(match[1] + 'T00:00:00Z')
            if (isNaN(d.getTime())) return undefined
            return d.getTime()
          })()
          finalTimestamp = parsed ?? innerFileLastModified
        }
      }

      const snapshotDateStr = finalTimestamp ? new Date(finalTimestamp).toISOString().slice(0,10) : undefined

      // Send to ingestion API (use inner-file timestamp if present)
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          followers_1_json: followers1.text,
          following_json: following.text,
          pending_follow_requests_json: pending.text,
          original_zip_filename: file.name,
          // send the chosen timestamp (ms) and also a snapshot_date (YYYY-MM-DD) when available
          file_last_modified: finalTimestamp,
          snapshot_date: snapshotDateStr,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText || 'Ingestion failed')
      }

      const responseData = await response.json()
      const result = responseData.data || responseData

      // Update status to success
      setFiles(prev => prev.map(f => 
        f.id === processedFile.id 
          ? { ...f, status: 'success' as FileStatus, result, endTime: typeof window !== 'undefined' ? Date.now() : 0 }
          : f
      ))

      toast.success(`Successfully processed ${file.name}`)

    } catch (err: any) {
      const errorMessage = err.message || 'An error occurred during ingestion'
      
      // Update status to error
      setFiles(prev => prev.map(f => 
        f.id === processedFile.id 
          ? { ...f, status: 'error' as FileStatus, error: errorMessage, endTime: typeof window !== 'undefined' ? Date.now() : 0 }
          : f
      ))

      toast.error(`Failed to process ${file.name}: ${errorMessage}`)
    }
  }

  const addFiles = useCallback(async (newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles)
    
    // Filter ZIP files and check for duplicates
    const validFiles = fileArray.filter(file => {
      if (!file.name.endsWith('.zip')) {
        toast.error(`${file.name} is not a ZIP file`)
        return false
      }
      return true
    })

    if (validFiles.length === 0) return

    // Create processed file objects
    const processedFiles: ProcessedFile[] = validFiles.map(file => ({
      id: generateFileId(file),
      file,
      status: 'pending' as FileStatus,
    }))

    // Check for duplicates
    const existingFileIds = new Set(files.map(f => f.id))
    const newFilesToAdd = processedFiles.filter(pf => !existingFileIds.has(pf.id))
    const duplicates = processedFiles.filter(pf => existingFileIds.has(pf.id))

    if (duplicates.length > 0) {
      toast.warning(`${duplicates.length} file(s) already added`)
    }

    if (newFilesToAdd.length === 0) return

    // Compute effective snapshot timestamps for new files (in parallel),
    // so we can sort and import oldest -> newest.
    const timestampPromises = newFilesToAdd.map(pf => getEffectiveTimestamp(pf.file))
    const timestamps = await Promise.all(timestampPromises)
    for (let i = 0; i < newFilesToAdd.length; i++) {
      newFilesToAdd[i].snapshotTime = timestamps[i]
    }

    // Sort by snapshotTime ascending (oldest first). Files without a timestamp go last.
    newFilesToAdd.sort((a, b) => {
      const ta = a.snapshotTime ?? Number.MAX_SAFE_INTEGER
      const tb = b.snapshotTime ?? Number.MAX_SAFE_INTEGER
      return ta - tb
    })

    // Add files to state
    setFiles(prev => [...prev, ...newFilesToAdd])

    // Process files one by one
    for (const processedFile of newFilesToAdd) {
      await processFile(processedFile)
    }
  }, [files])

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files
    if (selectedFiles) {
      addFiles(selectedFiles)
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const droppedFiles = e.dataTransfer.files
    if (droppedFiles) {
      addFiles(droppedFiles)
    }
  }

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId))
  }

  const clearAllFiles = () => {
    setFiles([])
  }

  const getFileStatusIcon = (status: FileStatus) => {
    switch (status) {
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <File className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getFileStatusBadge = (status: FileStatus) => {
    switch (status) {
      case 'processing':
        return <Badge className="bg-blue-500 text-white">Processing</Badge>
      case 'success':
        return <Badge className="bg-green-500 text-white">Success</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      default:
        return <Badge variant="outline">Pending</Badge>
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getProcessingTime = (file: ProcessedFile) => {
    if (!file.startTime) return null
    const endTime = file.endTime || (typeof window !== 'undefined' ? Date.now() : 0)
    const duration = Math.round((endTime - file.startTime) / 1000)
    return `${duration}s`
  }

  const processingFiles = files.filter(f => f.status === 'processing')
  const completedFiles = files.filter(f => f.status === 'success' || f.status === 'error')
  const pendingFiles = files.filter(f => f.status === 'pending')

  return (
    <div className="brand-card p-8 space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-brand-primary">
          Data Ingestion
        </h2>
        <p className="text-gray-600 text-base">
          Upload your Instagram data export ZIP files to import user data. You can select multiple files or drag and drop them.
        </p>
      </div>
      {/* Upload Section */}
        <div className="space-y-4">
          <div
            className={`border-2 border-dashed rounded-xl p-8 transition-colors border-brand-primary ${
              isDragOver 
                ? 'border-opacity-60 bg-brand-secondary' 
                : 'border-opacity-30 bg-brand-accent'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="text-center space-y-6">
              <FileArchive className="h-12 w-12 mx-auto text-brand-primary" />
              <div className="space-y-3">
                <h3 className="text-lg font-medium text-gray-900">
                  {isDragOver ? 'Drop ZIP files here' : 'Upload Instagram Data Exports'}
                </h3>
                <p className="text-sm text-gray-600 max-w-md mx-auto">
                  {isDragOver 
                    ? 'Release to add the files to the processing queue'
                    : 'Drag and drop ZIP files here, or click to select multiple files. Each file will be processed individually.'
                  }
                </p>
              </div>
              <Button
                onClick={handleFileSelect}
                disabled={processingFiles.length > 0}
                className="brand-button px-8 py-3"
              >
                <Upload className="h-4 w-4 mr-2" />
                Select ZIP Files
              </Button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Processing Queue</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {files.length} file{files.length !== 1 ? 's' : ''} total
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearAllFiles}
                  disabled={processingFiles.length > 0}
                >
                  Clear All
                </Button>
              </div>
            </div>

            {/* Processing Status Summary */}
            {(processingFiles.length > 0 || pendingFiles.length > 0) && (
              <div className="flex items-center gap-4 text-sm">
                {processingFiles.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    <span>Processing {processingFiles.length} file{processingFiles.length !== 1 ? 's' : ''}</span>
                  </div>
                )}
                {pendingFiles.length > 0 && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{pendingFiles.length} pending</span>
                  </div>
                )}
              </div>
            )}

            {/* File List */}
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className={`border rounded-lg p-4 transition-colors ${
                    file.status === 'processing' ? 'bg-blue-50 border-blue-200' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {getFileStatusIcon(file.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{file.file.name}</span>
                          {getFileStatusBadge(file.status)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          <span>{formatFileSize(file.file.size)}</span>
                          {getProcessingTime(file) && (
                            <span className="ml-2">• {getProcessingTime(file)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(file.id)}
                      disabled={file.status === 'processing'}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Success Results */}
                  {file.status === 'success' && file.result && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                        <div>
                          <div className="text-lg font-bold text-green-700">{file.result.new_profiles}</div>
                          <div className="text-xs text-green-600">New Profiles</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-green-700">{file.result.total_events_created}</div>
                          <div className="text-xs text-green-600">Events Created</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-green-700">{file.result.profile_updates}</div>
                          <div className="text-xs text-green-600">Profiles Updated</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-green-700">{file.result.snapshot_date}</div>
                          <div className="text-xs text-green-600">Snapshot Date</div>
                        </div>
                      </div>
                      
                      {Object.keys(file.result.event_breakdown).length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs font-medium text-green-800 mb-2">Event Breakdown:</div>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(file.result.event_breakdown).map(([eventType, count]) => (
                              <Badge key={eventType} variant="outline" className="border-green-300 text-green-700 text-xs">
                                {eventType}: {count}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error Display */}
                  {file.status === 'error' && file.error && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="font-medium text-red-800 text-sm">Processing Error</div>
                          <div className="text-sm text-red-700 mt-1">{file.error}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Processing Progress */}
                  {file.status === 'processing' && (
                    <div className="mt-3">
                      <div className="flex items-center gap-2 text-sm text-blue-700">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Processing Instagram data export...</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="space-y-2">
          <h4 className="font-medium text-gray-900">How to get your Instagram Data:</h4>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
            <li>Go to Instagram Settings & Privacy → Account Center → Your information and permissions → Download your information</li>
            <li>Request a download of your data in JSON format</li>
            <li>Instagram will email you a download link (this can take a few days)</li>
            <li>Download the ZIP files and upload them here (you can upload multiple exports)</li>
          </ol>
        </div>
    </div>
  )
}