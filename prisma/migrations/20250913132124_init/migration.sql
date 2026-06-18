/*
  Warnings:

  - The primary key for the `Snapshot` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `snapshot_date` on the `Snapshot` table. All the data in the column will be lost.
  - Added the required column `original_filename` to the `Snapshot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `snapshot_id` to the `Snapshot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `snapshot_ts` to the `Snapshot` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Snapshot" (
    "snapshot_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snapshot_ts" DATETIME NOT NULL,
    "original_filename" TEXT NOT NULL,
    "processed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Snapshot" ("processed_at") SELECT "processed_at" FROM "Snapshot";
DROP TABLE "Snapshot";
ALTER TABLE "new_Snapshot" RENAME TO "Snapshot";
CREATE UNIQUE INDEX "Snapshot_snapshot_ts_key" ON "Snapshot"("snapshot_ts");
CREATE INDEX "Snapshot_snapshot_ts_idx" ON "Snapshot"("snapshot_ts");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
