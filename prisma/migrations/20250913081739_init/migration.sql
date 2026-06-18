-- CreateTable
CREATE TABLE "Profile" (
    "profile_pk" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "current_username" TEXT NOT NULL,
    "first_seen_ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "is_active_follower" BOOLEAN NOT NULL DEFAULT false,
    "is_currently_following" BOOLEAN NOT NULL DEFAULT false,
    "is_pending_outbound_request" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "UsernameHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profile_pk" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "changed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsernameHistory_profile_pk_fkey" FOREIGN KEY ("profile_pk") REFERENCES "Profile" ("profile_pk") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InteractionEvent" (
    "event_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "profile_pk" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_ts" DATETIME NOT NULL,
    CONSTRAINT "InteractionEvent_profile_pk_fkey" FOREIGN KEY ("profile_pk") REFERENCES "Profile" ("profile_pk") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Campaign" (
    "campaign_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "campaign_name" TEXT NOT NULL,
    "campaign_date" DATETIME NOT NULL,
    "campaign_type" TEXT NOT NULL DEFAULT 'CONTENT'
);

-- CreateTable
CREATE TABLE "Attribution" (
    "attribution_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "event_id" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "campaign_id" INTEGER,
    CONSTRAINT "Attribution_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "InteractionEvent" ("event_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Attribution_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "Campaign" ("campaign_id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "snapshot_date" TEXT NOT NULL PRIMARY KEY,
    "processed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Tag" (
    "tag_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tag_name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ProfileTag" (
    "profile_pk" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,

    PRIMARY KEY ("profile_pk", "tag_id"),
    CONSTRAINT "ProfileTag_profile_pk_fkey" FOREIGN KEY ("profile_pk") REFERENCES "Profile" ("profile_pk") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProfileTag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag" ("tag_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_current_username_key" ON "Profile"("current_username");

-- CreateIndex
CREATE INDEX "UsernameHistory_profile_pk_idx" ON "UsernameHistory"("profile_pk");

-- CreateIndex
CREATE INDEX "UsernameHistory_username_idx" ON "UsernameHistory"("username");

-- CreateIndex
CREATE INDEX "InteractionEvent_profile_pk_idx" ON "InteractionEvent"("profile_pk");

-- CreateIndex
CREATE INDEX "InteractionEvent_event_ts_idx" ON "InteractionEvent"("event_ts");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_campaign_name_key" ON "Campaign"("campaign_name");

-- CreateIndex
CREATE UNIQUE INDEX "Attribution_event_id_key" ON "Attribution"("event_id");

-- CreateIndex
CREATE INDEX "Attribution_campaign_id_idx" ON "Attribution"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_snapshot_date_key" ON "Snapshot"("snapshot_date");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_tag_name_key" ON "Tag"("tag_name");
