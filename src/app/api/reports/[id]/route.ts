import { NextResponse } from 'next/server'
import { getArtifact } from '../../../../lib/agent/store'
import { jsonError } from '../../../../lib/api'
import { promises as fs } from 'fs'

/**
 * GET /api/reports/:id
 *
 * Serves a previously generated artifact (currently only CSV) by artifact id.
 * Spec decisions:
 *  - No auth / ACL layer added (internal prototype scope).
 *  - No retention / TTL; if file missing on disk we return 410 Gone (artifact record stale).
 *  - No range requests; whole-file response (sufficient for expected CSV sizes).
 *  - No caching (Cache-Control: no-store).
 *
 * Responses:
 *  200  -> file stream/bytes with appropriate headers
 *  404  -> artifact id not found
 *  410  -> artifact record exists but underlying file missing
 *  415  -> unsupported artifact type (future-proofing)
 *  500  -> unexpected IO error
 */
export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const id = ctx?.params?.id
  if (!id || !id.trim()) {
    return jsonError('Artifact id required', 400)
  }

  const artifact = getArtifact(id)
  if (!artifact) {
    return jsonError('Artifact not found', 404, { id })
  }

  if (artifact.type !== 'CSV') {
    return jsonError('Unsupported artifact type', 415, { type: artifact.type })
  }

  try {
    const data = await fs.readFile(artifact.path)
    // Use Uint8Array to satisfy BodyInit typing (Buffer not in DOM lib by default)
    const uint8 = new Uint8Array(data)
    return new NextResponse(uint8, {
      status: 200,
      headers: {
        'Content-Type': artifact.mime || 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(artifact.filename)}"`,
        'X-Artifact-Id': artifact.id,
        'X-Artifact-Type': artifact.type,
        'X-Artifact-Bytes': artifact.bytes != null ? String(artifact.bytes) : String(uint8.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: any) {
    // Distinguish missing file vs other IO error
    if (err?.code === 'ENOENT') {
      return jsonError('Artifact file missing (stale record)', 410, {
        id: artifact.id,
        path: artifact.path,
      })
    }
    return jsonError('Failed to read artifact', 500, {
      id: artifact.id,
      detail: err?.message,
    })
  }
}

/**
 * HEAD /api/reports/:id
 * Lightweight existence + metadata check without transferring the body.
 */
export async function HEAD(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const id = ctx?.params?.id
  if (!id || !id.trim()) {
    return new NextResponse(null, { status: 400 })
  }

  const artifact = getArtifact(id)
  if (!artifact) {
    return new NextResponse(null, { status: 404 })
  }

  if (artifact.type !== 'CSV') {
    return new NextResponse(null, { status: 415 })
  }

  // We do a quick stat to confirm existence; ignore stat errors (treated as 410)
  try {
    await fs.stat(artifact.path)
  } catch {
    return new NextResponse(null, { status: 410 })
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      'X-Artifact-Id': artifact.id,
      'X-Artifact-Type': artifact.type,
      'X-Artifact-Bytes': artifact.bytes != null ? String(artifact.bytes) : '',
      'Cache-Control': 'no-store',
    },
  })
}