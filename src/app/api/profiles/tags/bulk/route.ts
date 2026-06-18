import { prisma } from '../../../../../lib/prisma'
import { jsonError, jsonSuccess, safeJson } from '../../../../../lib/api'

type BulkTagBody = {
  profilePks?: unknown
  tagId?: unknown
  action?: string
}

/**
 * POST /api/profiles/tags/bulk
 * Body: {
 *   profilePks: number[]
 *   tagId: number
 *   action: 'add' | 'remove'
 * }
 *
 * Bulk add or remove a tag from multiple profiles
 */
export async function POST(request: Request) {
  const parsed = await safeJson<BulkTagBody>(request)
  if (!parsed.ok) return parsed.response

  const body = parsed.value

  // Validate profilePks
  if (!Array.isArray(body.profilePks) || body.profilePks.length === 0) {
    return jsonError('profilePks must be a non-empty array of integers')
  }
  const profilePks: number[] = []
  for (const v of body.profilePks) {
    const n = Number(v)
    if (!Number.isInteger(n) || n <= 0) {
      return jsonError('profilePks must contain only positive integers')
    }
    profilePks.push(n)
  }

  // Validate tagId
  if (body.tagId === undefined || body.tagId === null) {
    return jsonError('tagId is required')
  }
  const tagId = Number(body.tagId)
  if (!Number.isInteger(tagId) || tagId <= 0) {
    return jsonError('tagId must be a positive integer')
  }

  // Validate action
  if (!body.action || (body.action !== 'add' && body.action !== 'remove')) {
    return jsonError('action must be either "add" or "remove"')
  }
  const action = body.action as 'add' | 'remove'

  try {
    // Check if tag exists
    const tag = await prisma.tag.findUnique({
      where: { tag_id: tagId },
      select: { tag_id: true, tag_name: true },
    })

    if (!tag) {
      return jsonError('Tag not found', 404)
    }

    // Check if profiles exist
    const existingProfiles = await prisma.profile.findMany({
      where: { profile_pk: { in: profilePks } },
      select: { profile_pk: true, current_username: true },
    })

    if (existingProfiles.length !== profilePks.length) {
      const existingPks = new Set(existingProfiles.map(p => p.profile_pk))
      const missingPks = profilePks.filter(pk => !existingPks.has(pk))
      return jsonError(`Some profiles not found: ${missingPks.join(', ')}`, 404)
    }

    let results: any[] = []
    let summary = {
      action,
      tag_name: tag.tag_name,
      requested_profiles: profilePks.length,
      processed: 0,
      skipped: 0,
      errors: 0,
    }

    if (action === 'add') {
      // Find existing associations to avoid duplicates
      const existingAssociations = await prisma.profileTag.findMany({
        where: {
          profile_pk: { in: profilePks },
          tag_id: tagId,
        },
        select: { profile_pk: true },
      })

      const existingPks = new Set(existingAssociations.map(a => a.profile_pk))
      const toAdd = profilePks.filter(pk => !existingPks.has(pk))

      summary.skipped = existingPks.size

      if (toAdd.length > 0) {
        const createData = toAdd.map(profile_pk => ({
          profile_pk,
          tag_id: tagId,
        }))

        await prisma.profileTag.createMany({
          data: createData,
        })

        summary.processed = toAdd.length
      }

      results = toAdd.map(pk => ({
        profile_pk: pk,
        username: existingProfiles.find(p => p.profile_pk === pk)?.current_username,
        status: 'added',
      }))

      // Add skipped profiles to results
      existingPks.forEach(pk => {
        results.push({
          profile_pk: pk,
          username: existingProfiles.find(p => p.profile_pk === pk)?.current_username,
          status: 'already_had_tag',
        })
      })

    } else if (action === 'remove') {
      // Find existing associations to remove
      const existingAssociations = await prisma.profileTag.findMany({
        where: {
          profile_pk: { in: profilePks },
          tag_id: tagId,
        },
        select: { profile_pk: true },
      })

      const existingPks = new Set(existingAssociations.map(a => a.profile_pk))
      const toRemove = Array.from(existingPks)
      const notHaving = profilePks.filter(pk => !existingPks.has(pk))

      summary.skipped = notHaving.length

      if (toRemove.length > 0) {
        await prisma.profileTag.deleteMany({
          where: {
            profile_pk: { in: toRemove },
            tag_id: tagId,
          },
        })

        summary.processed = toRemove.length
      }

      results = toRemove.map(pk => ({
        profile_pk: pk,
        username: existingProfiles.find(p => p.profile_pk === pk)?.current_username,
        status: 'removed',
      }))

      // Add skipped profiles to results
      notHaving.forEach(pk => {
        results.push({
          profile_pk: pk,
          username: existingProfiles.find(p => p.profile_pk === pk)?.current_username,
          status: 'did_not_have_tag',
        })
      })
    }

    return jsonSuccess(results, {
      summary,
      message: `Bulk tag ${action} completed. Processed: ${summary.processed}, Skipped: ${summary.skipped}`,
    })

  } catch (err: any) {
    return jsonError('Failed to process bulk tag operation', 500, { detail: err?.message })
  }
}