/**
 * generate_spreadsheet Tool
 *
 * PURPOSE:
 *   Produce a CSV artifact from provided row data & column ordering, persist it
 *   to ./tmp/agents, register artifact metadata in in-memory store, and return
 *   a structured descriptor for downstream reporting steps.
 *
 * SPEC DECISIONS (Phase 2):
 *   - Only CSV output.
 *   - No retention / cleanup.
 *   - In-memory artifact registry (registerArtifact in store).
 *   - Caller supplies columns (explicit ordering); any missing keys render as empty.
 *   - Rows provided as array of generic objects (Record<string, any>).
 *   - Soft guardrails: if rows > 100_000 or columns > 150 we still proceed but emit warnings.
 *
 * OUTPUT:
 *   {
 *     artifactId: string
 *     filename: string
 *     path: string
 *     columns: string[]
 *     rowCount: number
 *     bytes: number
 *     warnings?: string[]
 *     downloadUrl?: string   // (populated later by API route, not here)
 *   }
 *
 * ERROR HANDLING:
 *   - Throws GenerateSpreadsheetError with codes for orchestrator to classify.
 *
 * FUTURE:
 *   - Stream large datasets.
 *   - Alternate formats (XLSX / Parquet).
 *   - Column inference / schema typing.
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import { registerArtifact } from '../store'

/* ---------------------------------- *
 * Error Type
 * ---------------------------------- */

export type GenerateSpreadsheetErrorCode =
  | 'INVALID_PARAMS'
  | 'IO_ERROR'
  | 'INTERNAL'

export class GenerateSpreadsheetError extends Error {
  code: GenerateSpreadsheetErrorCode
  constructor(code: GenerateSpreadsheetErrorCode, message: string) {
    super(message)
    this.name = 'GenerateSpreadsheetError'
    this.code = code
  }
}

/* ---------------------------------- *
 * Types
 * ---------------------------------- */

export interface GenerateSpreadsheetParams {
  columns: string[]              // ordered list of column names
  rows: Array<Record<string, any>>
  filename?: string              // optional base filename (will append .csv if missing)
  artifactType?: 'CSV'           // future extension
}

export interface GenerateSpreadsheetResult {
  artifactId: string
  filename: string
  path: string
  columns: string[]
  rowCount: number
  bytes: number
  warnings?: string[]
  // downloadUrl?: string (deliberately omitted here; API route will attach)
}

/* ---------------------------------- *
 * Helpers
 * ---------------------------------- */

function debugLog(...args: any[]) {
  if (process.env.AGENT_DEBUG === '1') {
    // eslint-disable-next-line no-console
    console.log('[AGENT_SPREADSHEET]', ...args)
  }
}

function escapeCsvCell(v: any): string {
  if (v === null || v === undefined) return ''
  let s: string
  if (typeof v === 'object') {
    try {
      s = JSON.stringify(v)
    } catch {
      s = String(v)
    }
  } else {
    s = String(v)
  }
  if (/[",\n\r]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function ensureCsvExtension(name: string): string {
  if (!name.toLowerCase().endsWith('.csv')) return name + '.csv'
  return name
}

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return prefix + '_' + crypto.randomUUID().replace(/-/g, '')
  }
  return prefix + '_' + Math.random().toString(36).slice(2, 14)
}

/* ---------------------------------- *
 * Main Tool
 * ---------------------------------- */

export async function generateSpreadsheetTool(params: GenerateSpreadsheetParams): Promise<GenerateSpreadsheetResult> {
  if (!params || !Array.isArray(params.columns) || params.columns.length === 0) {
    throw new GenerateSpreadsheetError('INVALID_PARAMS', 'columns must be a non-empty array')
  }
  if (!Array.isArray(params.rows)) {
    throw new GenerateSpreadsheetError('INVALID_PARAMS', 'rows must be an array')
  }

  const columns = params.columns.map(c => String(c))
  const rows = params.rows
  const rowCount = rows.length

  const warnings: string[] = []
  if (rowCount > 100_000) {
    warnings.push(`Row count ${rowCount} is large; consider reducing scope`)
  }
  if (columns.length > 150) {
    warnings.push(`Column count ${columns.length} is large; consider pruning`)
  }

  const artifactId = makeId('csv')
  const baseDir = path.join(process.cwd(), 'tmp', 'agents')
  const filename = ensureCsvExtension(params.filename?.trim() || `${artifactId}.csv`)
  const fullPath = path.join(baseDir, filename)

  await fs.mkdir(baseDir, { recursive: true })

  // Construct CSV content
  const headerLine = columns.map(escapeCsvCell).join(',')
  const lines: string[] = [headerLine]

  for (const r of rows) {
    const line = columns.map(col => escapeCsvCell(r[col])).join(',')
    lines.push(line)
  }

  const csv = lines.join('\n')
  const buf = Buffer.from(csv, 'utf8')
  try {
    await fs.writeFile(fullPath, buf)
  } catch (e: any) {
    throw new GenerateSpreadsheetError('IO_ERROR', `Failed to write CSV: ${e?.message || 'unknown error'}`)
  }

  // Register artifact
  const rec = registerArtifact({
    id: artifactId,
    type: 'CSV',
    filename,
    path: fullPath,
    mime: 'text/csv',
    meta: {
      columns,
      rowCount,
      warnings,
    },
    bytes: buf.byteLength,
  })

  debugLog('generated', { artifactId, filename, bytes: buf.byteLength, rows: rowCount })

  return {
    artifactId: rec.id,
    filename: rec.filename,
    path: rec.path,
    columns,
    rowCount,
    bytes: buf.byteLength,
    warnings: warnings.length ? warnings : undefined,
  }
}

/* ---------------------------------- *
 * Lightweight Agent Wrapper (Reporting Agent Skeleton)
 * ---------------------------------- */

export interface ReportingAgentInput extends GenerateSpreadsheetParams {
  stepId: string
}

export interface ReportingAgentOutput extends GenerateSpreadsheetResult {
  stepId: string
}

export async function runReportingAgent(input: ReportingAgentInput): Promise<ReportingAgentOutput> {
  const { stepId, ...toolParams } = input
  debugLog('report_start', { stepId, rows: toolParams.rows.length, cols: toolParams.columns.length })
  const res = await generateSpreadsheetTool(toolParams)
  debugLog('report_done', { stepId, artifactId: res.artifactId })
  return {
    stepId,
    ...res,
  }
}