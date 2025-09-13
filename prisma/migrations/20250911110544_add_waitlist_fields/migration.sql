/*
  Warnings:

  - Added the required column `updatedAt` to the `waitlists` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable: add nullable / defaulted columns first to avoid failures on non-empty tables
ALTER TABLE "waitlists"
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "notifiedAt" TIMESTAMP(3),
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "promotedAt" TIMESTAMP(3),
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

-- Add updatedAt with a default to safely populate existing rows, then enforce NOT NULL
ALTER TABLE "waitlists" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
UPDATE "waitlists" SET "updatedAt" = CURRENT_TIMESTAMP WHERE "updatedAt" IS NULL;
ALTER TABLE "waitlists" ALTER COLUMN "updatedAt" SET NOT NULL;
