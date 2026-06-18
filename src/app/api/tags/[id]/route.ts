import { prisma } from '../../../../lib/prisma'
import { jsonError, jsonSuccess, safeJson, parseId } from '../../../../lib/api'

type TagUpdateBody = {
  tagName?: string
}

// PATCH /api/tags/[id] - Update a tag
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params
  const id = parseId(params?.id)
  if (!id) return jsonError('Invalid tag id', 400)

  const parsed = await safeJson<TagUpdateBody>(request)
  if (!parsed.ok) return parsed.response

  const { tagName } = parsed.value

  if (!tagName || typeof tagName !== 'string' || !tagName.trim()) {
    return jsonError('tagName is required and must be a non-empty string')
  }

  try {
    const updated = await prisma.tag.update({
      where: { tag_id: id },
      data: {
        tag_name: tagName.trim(),
      },
    })
    return jsonSuccess(updated)
  } catch (err: any) {
    if (err.code === 'P2025') {
      return jsonError('Tag not found', 404)
    }
    if (err.code === 'P2002') {
      return jsonError('A tag with that name already exists', 409)
    }
    return jsonError('Failed to update tag', 500, { detail: err?.message })
  }
}

// DELETE /api/tags/[id] - Delete a tag
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params
  const id = parseId(params?.id)
  if (!id) return jsonError('Invalid tag id', 400)

  try {
    // Check if tag is in use
    const profileTagCount = await prisma.profileTag.count({
      where: { tag_id: id },
    })

    if (profileTagCount > 0) {
      return jsonError(
        'Cannot delete tag that is currently assigned to profiles. Remove from all profiles first.',
        409,
        { profiles_using_tag: profileTagCount },
      )
    }

    await prisma.tag.delete({
      where: { tag_id: id },
    })

    return jsonSuccess({
      message: 'Tag deleted',
      tag_id: id,
    })
  } catch (err: any) {
    if (err.code === 'P2025') {
      return jsonError('Tag not found', 404)
    }
    return jsonError('Failed to delete tag', 500, { detail: err?.message })
  }
}