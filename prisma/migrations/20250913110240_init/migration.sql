/*
  Warnings:

  - The primary key for the `Snapshot` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `original_filename` on the `Snapshot` table. All the data in the column will be lost.
  - You are about to drop the column `snapshot_id` on the `Snapshot` table. All the data in the column will be lost.
  - You are about to drop the column `snapshot_ts` on the `Snapshot` table. All the data in the column will be lost.
  - Added the required column `snapshot_date` to the `Snapshot` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Snapshot" (
    "snapshot_date" TEXT NOT NULL PRIMARY KEY,
    "processed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Snapshot" ("processed_at") SELECT "processed_at" FROM "Snapshot";
DROP TABLE "Snapshot";
ALTER TABLE "new_Snapshot" RENAME TO "Snapshot";
CREATE UNIQUE INDEX "Snapshot_snapshot_date_key" ON "Snapshot"("snapshot_date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
