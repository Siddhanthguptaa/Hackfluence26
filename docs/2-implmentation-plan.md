## Implementation Plan: Agentic Creator Intelligence Platform

### 1. Project Overview & Philosophy

This document outlines the implementation plan for our Creator Intelligence Platform. The primary goal is to build a clean, robust, and maintainable foundation based on the simplified System Requirements Document (SRD).

### 2. Technology Stack

The project will use the following technologies, consistent with the previous implementation:

*   **Framework:** Next.js (with App Router)
*   **Language:** TypeScript
*   **Database:** SQLite
*   **ORM:** Prisma
*   **UI:** React, Tailwind CSS
*   **UI Components:** shadcn/ui
*   **Server State Management:** TanStack Query (React Query)
*   **Client State Management:** React Hooks (`useState`, `useContext`)
*   **Icons:** Lucide React
*   **Notifications:** Sonner (React Hot Toast)

### 3. Database Schema

The database is the cornerstone of the application. The following Prisma schema is designed to meet all requirements of the SRD.

**File:** `prisma/schema.prisma`

```prisma
// This is your Prisma schema file.

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

// --- ENUMS ---

enum CampaignType {
  CONTENT
  OUTBOUND_FOLLOW
}

enum EventType {
  FOLLOWED_ME
  UNFOLLOWED_ME
  I_FOLLOWED
  I_UNFOLLOWED
  FOLLOW_REQUEST_SENT
  PENDING_REQUEST_CANCELLED // As per SRD FR-1.3.3
}

enum AttributionReason {
  DISCOVERY
  INIT
  OP_CAMPAIGN
  // Add other reasons as needed for manual attribution
}

// --- MODELS ---

// Master table for every unique Instagram user.
model Profile {
  profile_pk                  Int      @id @default(autoincrement())
  current_username            String   @unique
  first_seen_ts               DateTime @default(now())
  notes                       String?

  // State flags for efficient filtering and status checks, as per SRD.
  is_active_follower          Boolean  @default(false) // Do they follow me?
  is_currently_following      Boolean  @default(false) // Do I follow them?
  is_pending_outbound_request Boolean  @default(false) // Did I send a follow request?

  // Relations
  interaction_events InteractionEvent[]
  tags               ProfileTag[]
  username_history   UsernameHistory[]
}

// Tracks historical usernames to handle renames.
model UsernameHistory {
  id         Int      @id @default(autoincrement())
  profile_pk Int
  username   String
  changed_at DateTime @default(now())

  profile Profile @relation(fields: [profile_pk], references: [profile_pk])

  @@index([profile_pk])
  @@index([username])
}

// An immutable log of every interaction.
model InteractionEvent {
  event_id   Int       @id @default(autoincrement())
  profile_pk Int
  event_type EventType
  event_ts   DateTime

  profile     Profile      @relation(fields: [profile_pk], references: [profile_pk])
  attribution Attribution?

  @@index([profile_pk])
  @@index([event_ts])
}

// Tracks creator's content or outreach efforts.
model Campaign {
  campaign_id   Int          @id @default(autoincrement())
  campaign_name String       @unique
  campaign_date DateTime
  campaign_type CampaignType @default(CONTENT)

  attributions Attribution[]
}

// Connects an event to a reason or a campaign.
model Attribution {
  attribution_id Int             @id @default(autoincrement())
  event_id       Int             @unique // An event can only have one attribution
  reason         AttributionReason
  campaign_id    Int?

  event    InteractionEvent @relation(fields: [event_id], references: [event_id])
  campaign Campaign?        @relation(fields: [campaign_id], references: [campaign_id])

  @@index([campaign_id])
}

// Tracks processed snapshot dates for idempotence, as per SRD FR-1.2.
model Snapshot {
  snapshot_date String   @id @unique // YYYY-MM-DD format
  processed_at  DateTime @default(now())
}

// Models for audience segmentation via tags.
model Tag {
  tag_id   Int    @id @default(autoincrement())
  tag_name String @unique

  profiles ProfileTag[]
}

model ProfileTag {
  profile_pk Int
  tag_id     Int

  profile Profile @relation(fields: [profile_pk], references: [profile_pk])
  tag     Tag     @relation(fields: [tag_id], references: [tag_id])

  @@id([profile_pk, tag_id])
}
```

### 4. Planned File Structure

```
.
├── prisma/
│   └── schema.prisma         # The database schema defined above
├── public/
│   └── ...
├── scripts/
│   └── seed.ts               # (Optional) Script to populate DB for demos
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── campaigns/
│   │   │   │   ├── [id]/route.ts # GET, PATCH, DELETE single campaign
│   │   │   │   └── route.ts      # GET, POST campaigns
│   │   │   ├── events/
│   │   │   │   └── [eventId]/
│   │   │   │       └── attribution/
│   │   │   │           └── route.ts  # POST, DELETE attribution
│   │   │   ├── ingest/
│   │   │   │   └── route.ts      # POST new snapshot data
│   │   │   ├── profiles/
│   │   │   │   ├── [username]/
│   │   │   │   │   └── route.ts  # GET, PATCH single profile
│   │   │   │   └── route.ts      # GET paginated/filtered profiles
│   │   │   └── attributions/
│   │   │       └── bulk/
│   │   │           └── route.ts  # POST bulk attribution
│   │   └── page.tsx              # Main application page
│   │   └── layout.tsx            # Root layout
│   ├── components/
│   │   ├── ui/                   # shadcn-ui components
│   │   ├── CampaignManager.tsx   # Component for FR-2.2
│   │   ├── ProfileList.tsx       # Component for FR-2.1
│   │   ├── ProfileSheet.tsx      # Component for FR-2.3
│   │   ├── BulkProfilesAttributionSheet.tsx # Component for FR-3.2
│   │   └── Providers.tsx         # TanStack Query, Toaster, etc.
│   └── lib/
│       ├── prisma.ts             # Prisma client singleton
│       ├── utils.ts              # General utility functions (e.g., clsx)
│       └── dates.ts              # Date formatting utilities
└── ... (config files: next.config.ts, tsconfig.json, etc.)
```

### 5. Detailed Implementation Plan

#### Phase 0: Project Setup & Foundation

1.  **Initialize Project:**
    *   Run `pnpm create next-app@latest` with TypeScript, Tailwind CSS, and App Router.
    *   Install all dependencies from the tech stack list (`prisma`, `@prisma/client`, `@tanstack/react-query`, `shadcn-ui`, `lucide-react`, etc.).
    *   Initialize `shadcn-ui`: `pnpm dlx shadcn-ui@latest init`.
2.  **Setup Prisma:**
    *   Run `pnpm prisma init`.
    *   Create a `.env` file with `DATABASE_URL="file:./dev.db"`.
    *   Copy the schema from Section 3 into `prisma/schema.prisma`.
    *   Run the initial migration: `pnpm prisma migrate dev --name init`. This will create the SQLite database and all tables.
3.  **Setup Core Providers:**
    *   Create `src/components/Providers.tsx` to wrap the application with `QueryClientProvider` and `Toaster`.
    *   Update `src/app/layout.tsx` to use the `Providers` component.

#### Phase 1: Backend API Development

1.  **Campaigns API (FR-2.2):**
    *   `src/app/api/campaigns/route.ts`:
        *   `GET`: Fetch all campaigns, sorted by date descending.
        *   `POST`: Create a new campaign. Validate `campaign_name`, `campaign_date`, and `campaign_type`.
    *   `src/app/api/campaigns/[id]/route.ts`:
        *   `PATCH`: Update a campaign's details.
        *   `DELETE`: Delete a campaign. Handle foreign key constraints gracefully.
2.  **Profiles API (FR-2.1, FR-2.3):**
    *   `src/app/api/profiles/route.ts`:
        *   `GET`: Implement the main profile list endpoint.
            *   Accept query parameters: `search`, `status`, `page`, `pageSize`.
            *   Build a dynamic Prisma `where` clause based on filters.
            *   Implement pagination logic (`skip`, `take`).
            *   Return the paginated data along with total counts.
    *   `src/app/api/profiles/[username]/route.ts`:
        *   `GET`: Fetch a single profile by `current_username`, including all its relations (`interaction_events`, `tags`, `username_history`).
        *   `PATCH`: Update the `notes` field for a profile.
3.  **Attribution API (FR-3.1, FR-3.2):**
    *   `src/app/api/events/[eventId]/attribution/route.ts`:
        *   `POST`: Create or update the attribution for a single event. The body will contain `reason` and optional `campaign_id`.
        *   `DELETE`: Remove the attribution for a single event.
    *   `src/app/api/attributions/bulk/route.ts`:
        *   `POST`: Implement the bulk attribution logic.
            *   Accept `profile_pks`, `reason`, `campaign_id`, and `target` (`FOLLOWED` or `UNFOLLOWED`).
            *   Find the latest event of the target type for each profile PK.
            *   Create new `Attribution` records for events that don't already have one.
4.  **Ingestion API (FR-1):**
    *   `src/app/api/ingest/route.ts`:
        *   `POST`: This is the most critical endpoint.
        *   **Step 1: Receive Data:** The endpoint will accept a JSON body containing the string contents of `followers_1.json`, `following.json`, and `pending_follow_requests.json`, plus the original ZIP filename.
        *   **Step 2: Snapshot Check (FR-1.2):**
            *   Parse the `YYYY-MM-DD` date from the filename.
            *   Query the `Snapshot` table. If a record for this date exists, return a 409 Conflict error.
        *   **Step 3: Data Parsing:** Parse the JSON strings into arrays of usernames.
        *   **Step 4: Transaction Start:** Begin a `prisma.$transaction`.
        *   **Step 5: Profile Reconciliation:**
            *   Collect all unique usernames from all three lists.
            *   For each username, use `prisma.profile.upsert` to ensure a `Profile` record exists.
        *   **Step 6: State Fetch:** Fetch all profiles that are relevant to the current snapshot (i.e., all profiles present in the lists, plus all profiles in the DB with `is_active_follower=true`, `is_currently_following=true`, or `is_pending_outbound_request=true`).
        *   **Step 7: Event Generation (FR-1.3):**
            *   Implement the state-based diffing logic precisely as described in SRD sections FR-1.3.1, FR-1.3.2, and FR-1.3.3. For each detected change, create an `InteractionEvent` and update the corresponding boolean flag on the `Profile` model.
        *   **Step 8: Record Snapshot:** Create a new entry in the `Snapshot` table with the processed date.
        *   **Step 9: Transaction Commit:** Commit the transaction.
        *   **Step 10: Respond:** Return a success response with a summary of actions (e.g., new followers, unfollows, etc.).

#### Phase 2: Frontend UI Development

1.  **Campaign Manager (FR-2.2):**
    *   Create `src/components/CampaignManager.tsx`.
    *   Use `useQuery` to fetch campaigns from `/api/campaigns`.
    *   Use TanStack Table to display the campaigns.
    *   Implement the creation form using `useState` for inputs.
    *   Use `useMutation` to handle create, update, and delete actions, with `onSuccess` callbacks to invalidate the `['campaigns']` query key.
2.  **Profile List (FR-2.1):**
    *   Create `src/components/ProfileList.tsx`.
    *   Manage filter states (`searchQuery`, `statusFilter`, `page`, etc.) using `useState`.
    *   Use `useQuery` to fetch profiles from `/api/profiles`. The query key should include all filter states so that data is automatically refetched when filters change.
    *   Use TanStack Table to render the profile data.
    *   Implement row selection logic, storing selected `profile_pk`s in a `useState` array.
    *   When a row is clicked, call the `onSelectProfile` prop to open the detail sheet.
3.  **Profile Sheet (FR-2.3):**
    *   Create `src/components/ProfileSheet.tsx`.
    *   The component receives a `username` prop. Use this in a `useQuery` to fetch detailed data from `/api/profiles/[username]`.
    *   Render the profile header, notes section, and a timeline of events.
    *   For the notes section, use a `useState` to toggle an editing mode. Use `useMutation` to save changes.
    *   For each event, render the attribution controls as specified in FR-3.1.
4.  **Bulk Attribution UI (FR-3.2):**
    *   Create `src/components/BulkProfilesAttributionSheet.tsx`.
    *   This component is displayed conditionally when `selectedProfilePks.length > 0`.
    *   It contains the form for selecting a reason and campaign.
    *   The "Apply" button will trigger a `useMutation` that calls the `POST /api/attributions/bulk` endpoint.

#### Phase 3: Agentic Features

*   This phase is marked as TBD in the SRD. Do not implement.

#### Phase 4: Final Polish & Demo Preparation

1.  **Seed Script:**
    *   Create `scripts/seed.ts` to generate zips which can populate the database with a reasonable amount of realistic demo data. This is crucial for a compelling presentation. The script should create a few campaigns and a set of profiles with a history of events.
2.  **UI/UX Polish:**
    *   Ensure all loading and error states are handled gracefully with spinners and messages.
    *   Use `sonner` to provide toast notifications for all user actions (create, update, delete, etc.).
    *   Review the application for consistency and clarity.
