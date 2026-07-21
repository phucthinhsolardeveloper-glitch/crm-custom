-- Switch label-based auto-recall from day-granularity to minute-granularity.
--
-- Strategy:
--   1. Add new `recall_minutes` column (nullable for backfill step).
--   2. Backfill: minutes = days * 24 * 60. Existing data assumed to be days.
--   3. Drop old `days` column, enforce NOT NULL on `recall_minutes`.
--   4. Replace single-column index on lead_labels(label_id) with composite
--      (label_id, recall_start_at) - the cron now runs every 5 minutes and
--      filters on both columns, so the composite index is the better fit.

-- ── label_recall_configs: days → recall_minutes ────────────────────────────
ALTER TABLE "label_recall_configs" ADD COLUMN "recall_minutes" INTEGER;

UPDATE "label_recall_configs" SET "recall_minutes" = "days" * 1440;

ALTER TABLE "label_recall_configs" ALTER COLUMN "recall_minutes" SET NOT NULL;
ALTER TABLE "label_recall_configs" DROP COLUMN "days";

-- ── lead_labels: replace label_id index with composite ─────────────────────
DROP INDEX IF EXISTS "lead_labels_label_id_idx";
CREATE INDEX "lead_labels_label_id_recall_start_at_idx"
  ON "lead_labels"("label_id", "recall_start_at");
