-- Add CSV import preview + state machine fields.
--
-- Strategy:
--   1. Extend ImportStatus enum with PENDING_REVIEW, REVIEWED, CANCELLED.
--   2. Add 3 nullable columns on import_jobs:
--        - preview_summary (JSONB) populated when dry-run finishes
--        - reviewed_at (timestamp) marks dry-run completion
--        - started_at (timestamp) marks user clicked "Import"
--   3. Change default status from PROCESSING to PENDING_REVIEW.
--
-- Backward compat: existing rows keep PROCESSING/COMPLETED/FAILED status, new
-- columns are nullable so no backfill needed.

-- ── ImportStatus enum: add 3 values ────────────────────────────────────────
ALTER TYPE "ImportStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';
ALTER TYPE "ImportStatus" ADD VALUE IF NOT EXISTS 'REVIEWED';
ALTER TYPE "ImportStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- ── import_jobs: 3 new columns + default flip ──────────────────────────────
ALTER TABLE "import_jobs" ADD COLUMN "preview_summary" JSONB;
ALTER TABLE "import_jobs" ADD COLUMN "reviewed_at" TIMESTAMP(3);
ALTER TABLE "import_jobs" ADD COLUMN "started_at" TIMESTAMP(3);

ALTER TABLE "import_jobs" ALTER COLUMN "status" SET DEFAULT 'PENDING_REVIEW';
