-- Migration: task_reminders
-- Replaces remindAt/remindedAt columns on tasks with a new task_reminders table (1-N)

-- 1. Create task_reminders table
CREATE TABLE "task_reminders" (
  "id" BIGSERIAL PRIMARY KEY,
  "task_id" BIGINT NOT NULL,
  "remind_at" TIMESTAMP(3) NOT NULL,
  "label" VARCHAR(50),
  "reminded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_reminders_task_id_fkey" FOREIGN KEY ("task_id")
    REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "task_reminders_remind_at_reminded_at_idx"
  ON "task_reminders"("remind_at", "reminded_at");
CREATE INDEX "task_reminders_task_id_idx" ON "task_reminders"("task_id");

-- 2. Migrate existing data (safe even if columns don't exist yet on fresh DB)
INSERT INTO "task_reminders" ("task_id", "remind_at", "reminded_at", "label")
SELECT "id", "remind_at", "reminded_at", '30 phút trước'
FROM "tasks"
WHERE "remind_at" IS NOT NULL;

-- 3. Drop old columns and index
DROP INDEX IF EXISTS "tasks_remind_at_reminded_at_status_idx";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "remind_at";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "reminded_at";
