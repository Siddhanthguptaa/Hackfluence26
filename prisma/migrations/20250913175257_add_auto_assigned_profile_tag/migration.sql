-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProfileTag" (
    "profile_pk" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,
    "auto_assigned" BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY ("profile_pk", "tag_id"),
    CONSTRAINT "ProfileTag_profile_pk_fkey" FOREIGN KEY ("profile_pk") REFERENCES "Profile" ("profile_pk") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProfileTag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "Tag" ("tag_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProfileTag" ("profile_pk", "tag_id") SELECT "profile_pk", "tag_id" FROM "ProfileTag";
DROP TABLE "ProfileTag";
ALTER TABLE "new_ProfileTag" RENAME TO "ProfileTag";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
