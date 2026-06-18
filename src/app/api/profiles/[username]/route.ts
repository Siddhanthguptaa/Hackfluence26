import { prisma } from '../../../../lib/prisma'
import { jsonError, jsonSuccess, safeJson } from '../../../../lib/api'

// GET /api/profiles/[username]
// Returns detailed profile including:
//  - interaction_events (latest first) with attribution (+ campaign)
//  - tags
//  - username_history
export async function GET(
  _request: Request,
  context: { params: Promise<{ username: string }> },
) {
  const params = await context.params
  const username = params?.username
  if (!username || !username.trim()) {
    return jsonError('username parameter required', 400)
  }

  try {
    const profile = await prisma.profile.findUnique({
      where: { current_username: username },
      include: {
        interaction_events: {
          orderBy: { event_ts: 'desc' },
          include: {
            attribution: {
              include: {
                campaign: true,
              },
            },
          },
        },
        // Include auto_assigned flag on profile tag pivot
        tags: {
          select: {
            auto_assigned: true,
            tag: true,
          },
        },
        username_history: {
          orderBy: { changed_at: 'desc' },
        },
      },
    })

    if (!profile) {
      return jsonError('Profile not found', 404)
    }

    // Shape tags to a simpler array if desired; keep raw for now
    return jsonSuccess(profile)
  } catch (err: any) {
    return jsonError('Failed to fetch profile', 500, { detail: err?.message })
  }
}

// PATCH /api/profiles/[username]
// Body: { notes?: string }
// Only notes are mutable for now (per SRD)
export async function PATCH(
  request: Request,
  context: { params: Promise<{ username: string }> },
) {
  const params = await context.params
  const username = params?.username
  if (!username || !username.trim()) {
    return jsonError('username parameter required', 400)
  }

  const parsed = await safeJson<Partial<{ notes: string | null }>>(request)
  if (!parsed.ok) return parsed.response

  const body = parsed.value

  if (!body || !Object.prototype.hasOwnProperty.call(body, 'notes')) {
    return jsonError('Provide notes field to update', 400)
  }

  // Normalize notes: allow null to clear
  let notes: string | null = null
  if (body.notes !== null && body.notes !== undefined) {
    if (typeof body.notes !== 'string') {
      return jsonError('notes must be a string or null', 400)
    }
    notes = body.notes.trim()
    if (notes.length === 0) notes = null
  }

  try {
    const updated = await prisma.profile.update({
      where: { current_username: username },
      data: { notes },
      select: {
        profile_pk: true,
        current_username: true,
        notes: true,
        first_seen_ts: true,
        is_active_follower: true,
        is_currently_following: true,
        is_pending_outbound_request: true,
      },
    })
    return jsonSuccess(updated)
  } catch (err: any) {
    if (err.code === 'P2025') {
      return jsonError('Profile not found', 404)
    }
    return jsonError('Failed to update profile', 500, { detail: err?.message })
  }
}