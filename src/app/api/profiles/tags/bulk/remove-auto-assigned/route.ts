import { prisma } from '../../../../../../lib/prisma'
import { jsonError, jsonSuccess, safeJson } from '../../../../../../lib/api'

type BulkRemoveAutoBody = {
  profilePks?: unknown
}

/**
 * POST /api/profiles/tags/bulk/remove-auto-assigned
 * Body: { profilePks: number[] }
 *
 * Removes ALL auto-assigned (auto_assigned = true) tag links for the specified profiles.
 * Does not touch manually assigned tags (auto_assigned = false).
 *
 * Response shape:
 * {
 *   success: true,
 *   data: {
 *     summary: {
 *       requested_profiles: number
 *       affected_profiles: number
 *       deleted_links: number
 *     },
 *     details: {
 *       profile_pk: number
 *       removed: number
 *     }[]
 *   }
 * }
 */
export async function POST(request: Request) {
  const parsed = await safeJson<BulkRemoveAutoBody>(request)
  if (!parsed.ok) return parsed.response
  const body = parsed.value

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

  try {
    // Fetch auto-assigned links to remove
    const links = await prisma.profileTag.findMany({
      where: {
        profile_pk: { in: profilePks },
        auto_assigned: true,
      },
      select: {
        profile_pk: true,
        tag_id: true,
      },
    })

    if (links.length === 0) {
      return jsonSuccess({
        summary: {
          requested_profiles: profilePks.length,
          affected_profiles: 0,
          deleted_links: 0,
        },
        details: [],
      }, { message: 'No auto-assigned tags found for provided profiles' })
    }

    // Group by profile_pk for detail reporting
    const removedCountByProfile = new Map<number, number>()
    for (const l of links) {
      removedCountByProfile.set(l.profile_pk, (removedCountByProfile.get(l.profile_pk) || 0) + 1)
    }

    // Delete all matching links
    const deletion = await prisma.profileTag.deleteMany({
      where: {
        profile_pk: { in: profilePks },
        auto_assigned: true,
      },
    })

    const details = Array.from(removedCountByProfile.entries()).map(([profile_pk, removed]) => ({
      profile_pk,
      removed,
    }))

    return jsonSuccess({
      summary: {
        requested_profiles: profilePks.length,
        affected_profiles: removedCountByProfile.size,
        deleted_links: deletion.count,
      },
      details,
    }, { message: `Removed ${deletion.count} auto-assigned tag link(s)` })
  } catch (err: any) {
    return jsonError('Failed to remove auto-assigned tags', 500, { detail: err?.message })
  }
}