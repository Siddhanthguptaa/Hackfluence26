import { z } from 'zod'
import { CampaignType, AttributionReason } from '@prisma/client'

// Campaign schemas
export const campaignCreateSchema = z.object({
  campaign_name: z.string().min(1, 'Campaign name is required').trim(),
  campaign_date: z.string().datetime('Invalid date format, use ISO datetime'),
  campaign_type: z.nativeEnum(CampaignType).optional().default('CONTENT'),
})

export const campaignUpdateSchema = z.object({
  campaign_name: z.string().min(1, 'Campaign name must not be empty').trim().optional(),
  campaign_date: z.string().datetime('Invalid date format, use ISO datetime').optional(),
  campaign_type: z.nativeEnum(CampaignType).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one field must be provided for update',
})

// Profile schemas
export const profileNotesUpdateSchema = z.object({
  notes: z.string().nullable(),
})

// Attribution schemas
export const attributionCreateSchema = z.object({
  reason: z.nativeEnum(AttributionReason),
  campaign_id: z.number().int().positive().optional(),
}).refine(data => {
  if (data.reason === 'OP_CAMPAIGN') {
    return data.campaign_id !== undefined
  }
  return data.campaign_id === undefined
}, {
  message: 'campaign_id is required when reason is OP_CAMPAIGN, and forbidden otherwise',
})

export const bulkAttributionSchema = z.object({
  profile_pks: z.array(z.number().int().positive()).min(1, 'At least one profile is required'),
  reason: z.nativeEnum(AttributionReason),
  campaign_id: z.number().int().positive().optional(),
  target: z.enum(['FOLLOWED', 'UNFOLLOWED']),
}).refine(data => {
  if (data.reason === 'OP_CAMPAIGN') {
    return data.campaign_id !== undefined
  }
  return data.campaign_id === undefined
}, {
  message: 'campaign_id is required when reason is OP_CAMPAIGN, and forbidden otherwise',
})

// Ingestion schema
export const ingestSchema = z.object({
  followers_1_json: z.string().min(1, 'followers_1_json is required'),
  following_json: z.string().min(1, 'following_json is required'),
  pending_follow_requests_json: z.string().min(1, 'pending_follow_requests_json is required'),
  original_zip_filename: z.string().min(1, 'original_zip_filename is required'),
})

// Query parameter schemas
export const profilesQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['all', 'follower', 'following', 'mutual', 'pending', 'none']).optional().default('all'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
})