import { prisma } from '../../../lib/prisma'
import { jsonError, jsonSuccess, safeJson } from '../../../lib/api'

type TagCreateBody = {
  tagName?: string
}

// GET /api/tags - Get all tags
export async function GET() {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { tag_name: 'asc' },
    })
    return jsonSuccess(tags)
  } catch (err: any) {
    return jsonError('Failed to fetch tags', 500, { detail: err?.message })
  }
}

// POST /api/tags - Create a new tag
export async function POST(request: Request) {
  const parsed = await safeJson<TagCreateBody>(request)
  if (!parsed.ok) return parsed.response

  const { tagName } = parsed.value

  if (!tagName || typeof tagName !== 'string' || !tagName.trim()) {
    return jsonError('tagName is required and must be a non-empty string')
  }

  try {
    const created = await prisma.tag.create({
      data: {
        tag_name: tagName.trim(),
      },
    })
    return jsonSuccess(created, undefined, { status: 201 })
  } catch (err: any) {
    if (err.code === 'P2002') {
      return jsonError('A tag with that name already exists', 409)
    }
    return jsonError('Failed to create tag', 500, { detail: err?.message })
  }
}