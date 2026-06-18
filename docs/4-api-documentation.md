# API Documentation: Agentic Creator Intelligence Platform

## Overview

This document describes the backend API endpoints for the Creator Intelligence Platform. All endpoints follow a consistent response format and error handling pattern.

## Response Format

### Success Response
```json
{
  "success": true,
  "data": <response_data>,
  "meta": <optional_metadata>
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "status": 400,
    "detail": "Additional error details (optional)"
  }
}
```

## Endpoints

### Campaigns

#### `GET /api/campaigns`
Fetch all campaigns, sorted by date descending.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "campaign_id": 1,
      "campaign_name": "Summer Launch",
      "campaign_date": "2025-06-15T00:00:00.000Z",
      "campaign_type": "CONTENT"
    }
  ]
}
```

#### `POST /api/campaigns`
Create a new campaign.

**Request Body:**
```json
{
  "campaign_name": "Summer Launch",
  "campaign_date": "2025-06-15T00:00:00.000Z",
  "campaign_type": "CONTENT" // Optional, defaults to "CONTENT"
}
```

**Response:** Created campaign object with 201 status.

#### `PATCH /api/campaigns/[id]`
Update an existing campaign.

**Request Body:** Same as POST, but all fields optional.

#### `DELETE /api/campaigns/[id]`
Delete a campaign. Fails if campaign has existing attributions.

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Campaign deleted",
    "campaign_id": 1
  }
}
```

### Profiles

#### `GET /api/profiles`
Fetch profiles with filtering and pagination.

**Query Parameters:**
- `search`: Search current_username or historical usernames
- `status`: Filter by relationship status (`all`, `follower`, `following`, `mutual`, `pending`, `none`)
- `page`: Page number (default: 1)
- `pageSize`: Items per page (default: 20, max: 100)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "profile_pk": 1,
      "current_username": "john_doe",
      "first_seen_ts": "2025-01-01T00:00:00.000Z",
      "is_active_follower": true,
      "is_currently_following": false,
      "is_pending_outbound_request": false
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 20,
      "total": 150,
      "totalPages": 8,
      "hasNext": true,
      "hasPrev": false
    },
    "filters": {
      "search": "john",
      "status": "follower"
    }
  }
}
```

#### `GET /api/profiles/[username]`
Fetch detailed profile information including events, attributions, and history.

**Response:**
```json
{
  "success": true,
  "data": {
    "profile_pk": 1,
    "current_username": "john_doe",
    "notes": "Important influencer",
    "interaction_events": [
      {
        "event_id": 1,
        "event_type": "FOLLOWED_ME",
        "event_ts": "2025-01-01T00:00:00.000Z",
        "attribution": {
          "attribution_id": 1,
          "reason": "OP_CAMPAIGN",
          "campaign": {
            "campaign_id": 1,
            "campaign_name": "Summer Launch"
          }
        }
      }
    ],
    "tags": [],
    "username_history": []
  }
}
```

#### `PATCH /api/profiles/[username]`
Update profile notes.

**Request Body:**
```json
{
  "notes": "Updated notes or null to clear"
}
```

### Event Attribution

#### `POST /api/events/[eventId]/attribution`
Create or update attribution for an event.

**Request Body:**
```json
{
  "reason": "OP_CAMPAIGN",
  "campaign_id": 1 // Required if reason is OP_CAMPAIGN
}
```

#### `DELETE /api/events/[eventId]/attribution`
Remove attribution from an event.

### Bulk Attribution

#### `POST /api/attributions/bulk`
Apply attribution to multiple profiles' latest events.

**Request Body:**
```json
{
  "profile_pks": [1, 2, 3],
  "reason": "OP_CAMPAIGN",
  "campaign_id": 1,
  "target": "FOLLOWED" // or "UNFOLLOWED"
}
```

**Response:**
```json
{
  "success": true,
  "data": [/* created attribution objects */],
  "meta": {
    "summary": {
      "requested_profiles": 3,
      "matched_events": 2,
      "already_attributed": 0,
      "created": 2,
      "reason": "OP_CAMPAIGN",
      "target": "FOLLOWED"
    }
  }
}
```

### Data Ingestion

#### `POST /api/ingest`
Process Instagram data export snapshot.

**Request Body:**
```json
{
  "followers_1_json": "{...}",
  "following_json": "{...}",
  "pending_follow_requests_json": "{...}",
  "original_zip_filename": "instagram-username-2025-06-13-ABC123.zip"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "snapshot_date": "2025-06-13",
    "new_profiles": 25,
    "total_events_created": 10,
    "event_breakdown": {
      "FOLLOWED_ME": 5,
      "UNFOLLOWED_ME": 2,
      "I_FOLLOWED": 3
    },
    "profile_updates": 8
  }
}
```

## Error Codes

- `400`: Bad Request - Invalid input data
- `404`: Not Found - Resource doesn't exist
- `409`: Conflict - Resource already exists or constraint violation
- `422`: Unprocessable Entity - Validation failed
- `500`: Internal Server Error - Unexpected server error

## Implementation Notes

### Shared Utilities

All endpoints use shared utilities from [`src/lib/api.ts`](../src/lib/api.ts):
- `jsonSuccess()` and `jsonError()` for consistent response formatting
- `safeJson()` for safe request body parsing
- `parseWithSchema()` for Zod validation
- `paginationMeta()` for pagination metadata
- `parseId()` for numeric route parameter parsing

### Validation Schemas

Zod schemas are defined in [`src/lib/schemas.ts`](../src/lib/schemas.ts) for robust input validation with detailed error messages.

### Database Integration

All endpoints use Prisma ORM with SQLite database. Complex operations like ingestion use transactions to ensure data consistency.

### Next.js 15 Compatibility

Route handlers are compatible with Next.js 15's async `params` pattern for dynamic routes.