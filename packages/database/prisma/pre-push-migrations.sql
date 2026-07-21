-- Pre-push migrations: idempotent SQL run BEFORE `prisma db push`.
--
-- Why this exists:
--   The project uses `prisma db push` for production schema sync (see
--   scripts/deploy.sh). `db push` cannot perform data-preserving column
--   renames or backfills - it refuses when adding a NOT NULL column to
--   a table with existing rows. This file applies those data-aware
--   migrations idempotently so `db push` afterwards is a no-op for them.
--
-- Rules for entries:
--   - Every statement MUST be safe to re-run on an already-migrated DB.
--   - Use IF EXISTS / IF NOT EXISTS / DO blocks with information_schema checks.
--   - Keep statements ordered chronologically; never edit past entries.

-- ── 2026-05-05: label_recall_configs.days → recall_minutes ────────────────
-- Old: days INT NOT NULL; New: recall_minutes INT NOT NULL.
-- Backfill: minutes = days * 1440.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'label_recall_configs' AND column_name = 'days'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'label_recall_configs' AND column_name = 'recall_minutes'
  ) THEN
    ALTER TABLE "label_recall_configs" ADD COLUMN "recall_minutes" INTEGER;
    UPDATE "label_recall_configs" SET "recall_minutes" = "days" * 1440;
    ALTER TABLE "label_recall_configs" ALTER COLUMN "recall_minutes" SET NOT NULL;
    ALTER TABLE "label_recall_configs" DROP COLUMN "days";
  END IF;
END $$;

-- ── 2026-05-05: lead_labels - replace single-col index with composite ─────
-- Composite (label_id, recall_start_at) supports the cron's filter and still
-- covers label-only lookups via the leftmost prefix.
-- NOTE: superseded by 2026-05-06 block below (lead_labels dropped). Kept as
-- historical no-op (DROP/CREATE on non-existent table guarded by IF EXISTS
-- - but CREATE INDEX on missing table errors; wrap in conditional).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_labels') THEN
    DROP INDEX IF EXISTS "lead_labels_label_id_idx";
    CREATE INDEX IF NOT EXISTS "lead_labels_label_id_recall_start_at_idx"
      ON "lead_labels"("label_id", "recall_start_at");
  END IF;
END $$;

-- ── 2026-05-06: lead_labels → leads.label_id (single label per lead) ──────
-- BREAKING: Lead label cardinality changes from N-N (junction) to 1-N (FK).
-- Decision (per plan 260506-1108-lead-single-label): all leads reset to NULL
-- label (user re-labels manually).
--
-- ROLLBACK NOTE: backup table created here is dropped by `prisma db push` on
-- next sync (not in schema). For real rollback safety, take a `pg_dump` of
-- `lead_labels` BEFORE running deploy. Backup here is best-effort within the
-- pre-push → db-push window only.
DO $$
BEGIN
  -- Step A: add leads.label_id column + FK + index if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'label_id'
  ) THEN
    ALTER TABLE "leads" ADD COLUMN "label_id" BIGINT;
    ALTER TABLE "leads" ADD CONSTRAINT "leads_label_id_fkey"
      FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE SET NULL;
    CREATE INDEX "leads_label_id_idx" ON "leads"("label_id");
  END IF;

  -- Step B: add label_assigned_at column for cron timer (replaces lead_labels.recall_start_at)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'label_assigned_at'
  ) THEN
    ALTER TABLE "leads" ADD COLUMN "label_assigned_at" TIMESTAMP(3);
  END IF;

  -- Step C: backup + drop lead_labels (idempotent)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_labels'
  ) THEN
    CREATE TABLE IF NOT EXISTS "lead_labels_backup_20260506" AS
      SELECT * FROM "lead_labels";
    DROP TABLE "lead_labels";
  END IF;
END $$;

-- ── 2026-05-11: leads.last_assigned_at + trigger from assignment_history ──
-- Adds Lead.last_assigned_at maintained automatically by trigger on
-- assignment_history INSERT (for entity_type='LEAD'). Powers the filter
-- "leads assigned in time range" on /pool/new + /pool/zoom pages.
-- Backfill from existing assignment_history (max created_at per lead).
DO $$
BEGIN
  -- Step A: add column if missing (db push will also add it - this just ensures
  -- it exists before backfill runs).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'last_assigned_at'
  ) THEN
    ALTER TABLE "leads" ADD COLUMN "last_assigned_at" TIMESTAMP(3);
  END IF;

  -- Step B: backfill from assignment_history (latest assignment per lead).
  -- Idempotent - only fills NULL rows, won't overwrite if already set.
  UPDATE "leads" l
    SET "last_assigned_at" = (
      SELECT MAX(ah."created_at")
      FROM "assignment_history" ah
      WHERE ah."entity_type" = 'LEAD' AND ah."entity_id" = l."id"
    )
    WHERE l."last_assigned_at" IS NULL;
END $$;

-- Trigger function + trigger to auto-update leads.last_assigned_at on every
-- new assignment_history row for LEAD entity. CREATE OR REPLACE is idempotent.
CREATE OR REPLACE FUNCTION update_lead_last_assigned_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.entity_type = 'LEAD' THEN
    UPDATE "leads"
      SET "last_assigned_at" = NEW."created_at"
      WHERE "id" = NEW."entity_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_assignment_history_update_lead" ON "assignment_history";
CREATE TRIGGER "trg_assignment_history_update_lead"
  AFTER INSERT ON "assignment_history"
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_last_assigned_at();

-- ── 2026-05-06: recall_configs.auto_label_ids[] → auto_label_id ───────────
-- Take first element of array (NULL if empty) for new singular column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recall_configs' AND column_name = 'auto_label_ids'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recall_configs' AND column_name = 'auto_label_id'
  ) THEN
    ALTER TABLE "recall_configs" ADD COLUMN "auto_label_id" BIGINT;
    UPDATE "recall_configs"
      SET "auto_label_id" = "auto_label_ids"[1]
      WHERE array_length("auto_label_ids", 1) > 0;
    ALTER TABLE "recall_configs" ADD CONSTRAINT "recall_configs_auto_label_id_fkey"
      FOREIGN KEY ("auto_label_id") REFERENCES "labels"("id") ON DELETE SET NULL;
    ALTER TABLE "recall_configs" DROP COLUMN "auto_label_ids";
  END IF;
END $$;

-- ── 2026-06-15: bỏ User.isLeader ─────────────────────────────────────────
-- Quyền trưởng nhóm chuyển hẳn sang role=LEADER + teamId; cờ is_leader thừa.
-- Drop ở pre-push (idempotent) để `prisma db push` khi deploy không vấp prompt
-- --accept-data-loss (cột còn data trên prod). Sau khi cột đã drop, db push no-op.
ALTER TABLE "users" DROP COLUMN IF EXISTS "is_leader";

-- ── 2026-06-20: Redesign Order/Payment status + Payment.status_reason ─────
-- Order: 5 status -> 2 (PENDING, COMPLETED). Payment: 4 -> 5 (them CANCELLED;
-- REJECTED doi nghia). Data-aware: phai backfill row ve gia tri con song TRUOC
-- khi enum bi thu hep, neu khong `prisma db push` se abort voi canh bao data-loss.
-- Enum duoc swap-recreate trong DO block co guard: idempotent (guard skip khi da
-- o hinh moi) va tranh dung enum value vua them trong cung statement.
-- Mapping: order CONFIRMED/CANCELLED -> PENDING, REFUNDED -> COMPLETED;
--          payment REJECTED cu (nghia "tien khong ve") -> CANCELLED (giu doanh
--          thu tong khong doi - ca 2 deu khong tinh tien).

-- OrderStatus -> {PENDING, COMPLETED}
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'OrderStatus' AND e.enumlabel = 'CONFIRMED'
  ) THEN
    UPDATE "orders" SET "status" = 'PENDING' WHERE "status" IN ('CONFIRMED', 'CANCELLED');
    UPDATE "orders" SET "status" = 'COMPLETED' WHERE "status" = 'REFUNDED';

    ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
    CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'COMPLETED');
    ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus" USING "status"::text::"OrderStatus";
    ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING';
    DROP TYPE "OrderStatus_old";
  END IF;
END $$;

-- PaymentStatus -> {PENDING, VERIFIED, REJECTED, REFUNDED, CANCELLED}
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'PaymentStatus' AND e.enumlabel = 'CANCELLED'
  ) THEN
    ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
    CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'REFUNDED', 'CANCELLED');
    ALTER TABLE "payments" ALTER COLUMN "status" TYPE "PaymentStatus" USING (
      CASE "status"::text WHEN 'REJECTED' THEN 'CANCELLED' ELSE "status"::text END
    )::"PaymentStatus";
    ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'PENDING';
    DROP TYPE "PaymentStatus_old";
  END IF;
END $$;

-- Payment.status_reason (ly do tuy chon khi reject/cancel)
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "status_reason" TEXT;

-- EntityType += ORDER (thong bao payment route ve /orders/{id})
ALTER TYPE "EntityType" ADD VALUE IF NOT EXISTS 'ORDER';

-- ── 2026-06-23: lark_sync_mappings.name (duong ong Lark doc lap) ──────────
-- Tach Lark Sync khoi danh muc: them cot name (NOT NULL). `db push` khong them
-- duoc NOT NULL khi bang co san du lieu -> backfill ten tu danh muc cu o day,
-- de db push sau do chi can SET NOT NULL (da co data). Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lark_sync_mappings' AND column_name = 'name'
  ) THEN
    ALTER TABLE "lark_sync_mappings" ADD COLUMN "name" TEXT;
    UPDATE "lark_sync_mappings" m
      SET "name" = c."name"
      FROM "product_categories" c
      WHERE m."category_id" = c."id" AND m."name" IS NULL;
    UPDATE "lark_sync_mappings"
      SET "name" = 'Duong ong ' || "id"::text
      WHERE "name" IS NULL;
    ALTER TABLE "lark_sync_mappings" ALTER COLUMN "name" SET NOT NULL;
  END IF;
END $$;

-- ── 2026-06-26: Phễu Livestream theo NGÀY -> theo LỚP PHỄU (gắn 1 ngày) ───
-- Bỏ bảng cũ livestream_funnel_entries (gom theo ngày, còn data prod) và tạo
-- bảng mới livestream_funnel_classes. Mỗi lớp phễu gắn 1 ngày (entry_date),
-- lọc danh sách theo THÁNG của ngày. Chặn trùng (tháng + tên) xử lý ở service
-- layer (app-level) nên KHÔNG tạo unique index DB ở đây.
-- Làm ở pre-push để `prisma db push` không vấp --accept-data-loss khi drop bảng
-- còn data. Idempotent: DROP/CREATE IF [NOT] EXISTS -> db push sau đó no-op.
DROP TABLE IF EXISTS "livestream_funnel_entries" CASCADE;

CREATE TABLE IF NOT EXISTS "livestream_funnel_classes" (
    "id" BIGSERIAL NOT NULL,
    "entry_date" DATE NOT NULL,
    "lop_pheu" TEXT NOT NULL,
    "ad_budget" DECIMAL(14,2),
    "khach_dien_form" INTEGER,
    "so_mat_xem" INTEGER,
    "vao_nhom_zalo" INTEGER,
    "sl_vao_zoom" INTEGER,
    "mua" INTEGER,
    "coc_trong_zoom" INTEGER,
    "doanh_thu" DECIMAL(16,2),
    "notes" TEXT,
    "created_by" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "livestream_funnel_classes_pkey" PRIMARY KEY ("id")
);

-- Rename phòng trường hợp môi trường đã tạo bảng với cột cũ funnel_month.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_funnel_classes' AND column_name = 'funnel_month')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'livestream_funnel_classes' AND column_name = 'entry_date') THEN
    ALTER TABLE "livestream_funnel_classes" RENAME COLUMN "funnel_month" TO "entry_date";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'livestream_funnel_classes_created_by_fkey'
  ) THEN
    ALTER TABLE "livestream_funnel_classes"
      ADD CONSTRAINT "livestream_funnel_classes_created_by_fkey"
      FOREIGN KEY ("created_by") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Dọn index/đối tượng cũ (nếu còn) + tạo index theo entry_date.
DROP INDEX IF EXISTS "livestream_funnel_classes_month_name_key";
DROP INDEX IF EXISTS "livestream_funnel_classes_funnel_month_idx";
CREATE INDEX IF NOT EXISTS "livestream_funnel_classes_entry_date_idx"
  ON "livestream_funnel_classes"("entry_date");

-- ── 2026-07-03: payments (status, transfer_date) index cho đối soát ───────
-- Đối soát lọc payment theo khoảng transfer_date + loại CANCELLED. Index tổng
-- hợp hỗ trợ query khoảng ngày. Thêm index không mất data nên chỉ cần idempotent.
CREATE INDEX IF NOT EXISTS "payments_status_transfer_date_idx"
  ON "payments"("status", "transfer_date");

-- ── 2026-07-03: payments.dedup_key (chong trung khi import) ───────────────
-- Cot nay truoc chi tao qua migration folder (20260702163000_add_payment_dedup_key)
-- - KHONG chay khi deploy prod (workflow dung db push + pre-push, khong migrate).
-- Thieu cot -> payment-matching query dedup_key loi -> import sao ke tra 0 giao dich.
-- Partial unique index khong bieu dien duoc trong schema Prisma nen db push khong
-- tu tao; phai them idempotent o day. dedup_key = SHA1(SDT|SP|tien|ngayCK|noidung).
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "dedup_key" VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS "payments_dedup_key_key"
  ON "payments"("dedup_key") WHERE "dedup_key" IS NOT NULL;

-- ── 2026-07-06: lead_groups.skip_pool (Nhom tu dinh tuyen pool) ───────────
-- Nhom (con) tu chon vao pool hay skip, doc lap voi Nguon cha. Tri-state:
-- NULL = ke thua Nguon cha; true = skip pool; false = luon vao pool.
-- Hieu luc = group.skip_pool COALESCE source.skip_pool. Cot nullable nen db
-- push tu them duoc; giu o day cho nhat quan workflow deploy. Idempotent.
ALTER TABLE "lead_groups" ADD COLUMN IF NOT EXISTS "skip_pool" BOOLEAN;

-- ── 2026-07-07: department_labels (nhan hien thi theo phong ban) ───────────
-- Junction phong ban <-> nhan: chi anh huong danh sach chip quick-filter,
-- khong phai access control. Phong ban khong co dong nao = thay tat ca nhan.
-- Bang moi hoan toan nen db push tu tao duoc; giu o day cho nhat quan workflow.
CREATE TABLE IF NOT EXISTS "department_labels" (
  "department_id" BIGINT NOT NULL,
  "label_id" BIGINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "department_labels_pkey" PRIMARY KEY ("department_id", "label_id")
);
CREATE INDEX IF NOT EXISTS "department_labels_label_id_idx" ON "department_labels"("label_id");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'department_labels_department_id_fkey'
  ) THEN
    ALTER TABLE "department_labels"
      ADD CONSTRAINT "department_labels_department_id_fkey"
      FOREIGN KEY ("department_id") REFERENCES "departments"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'department_labels_label_id_fkey'
  ) THEN
    ALTER TABLE "department_labels"
      ADD CONSTRAINT "department_labels_label_id_fkey"
      FOREIGN KEY ("label_id") REFERENCES "labels"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 2026-07-07: department_view_configs (bo cuc bang leads theo phong ban) ─
-- Config JSONB { visible, order } khoa bo cuc cot cho USER/LEADER cua phong ban.
-- Bang moi hoan toan nen db push tu tao duoc; giu o day cho nhat quan workflow.
CREATE TABLE IF NOT EXISTS "department_view_configs" (
  "id" BIGSERIAL PRIMARY KEY,
  "department_id" BIGINT NOT NULL,
  "config" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "department_view_configs_department_id_key"
  ON "department_view_configs"("department_id");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'department_view_configs_department_id_fkey'
  ) THEN
    ALTER TABLE "department_view_configs"
      ADD CONSTRAINT "department_view_configs_department_id_fkey"
      FOREIGN KEY ("department_id") REFERENCES "departments"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 2026-07-07: lead_field_definitions (truong tuy chinh lead) ─────────────
-- Dinh nghia truong dong do SUPER_ADMIN quan ly; gia tri luu leads.metadata JSONB.
-- Bang moi hoan toan nen db push tu tao duoc; giu o day cho nhat quan workflow.
CREATE TABLE IF NOT EXISTS "lead_field_definitions" (
  "id" BIGSERIAL PRIMARY KEY,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'text',
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "lead_field_definitions_key_key"
  ON "lead_field_definitions"("key");

-- ── 2026-07-08: payments.created_by (nguoi bam tao payment) ───────────────
-- Truoc day payment khong luu ai tao -> quyen sua/huy phai muon order.created_by,
-- sai khi don do nguoi khac tao con sale khac nhap payment. Them cot nullable:
-- payment cu / import / webhook giu NULL (khong ai "so huu" de tu sua).
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "created_by" BIGINT;
CREATE INDEX IF NOT EXISTS "payments_created_by_idx" ON "payments"("created_by");
