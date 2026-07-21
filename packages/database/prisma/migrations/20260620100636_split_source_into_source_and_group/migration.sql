-- Tách "Nguồn lead" thành 2 cấp: Nguồn (cha) + Nhóm (con)
-- Bảng lead_sources cũ -> lead_groups (nhóm con, giữ data + PK + sequence).
-- Tạo lead_sources mới làm Nguồn cha (giữ cờ skip_pool).
-- leads.source_id re-point sang Nguồn cha; thêm leads.group_id trỏ Nhóm.

-- 1. Đổi tên bảng cũ -> lead_groups, kèm pkey + sequence (giải phóng tên lead_sources)
ALTER TABLE "lead_sources" RENAME TO "lead_groups";
ALTER TABLE "lead_groups" RENAME CONSTRAINT "lead_sources_pkey" TO "lead_groups_pkey";
ALTER SEQUENCE "lead_sources_id_seq" RENAME TO "lead_groups_id_seq";

-- Drop FK cũ leads.source_id (giờ trỏ lead_groups). Sẽ tạo lại trỏ Nguồn cha sau khi backfill.
ALTER TABLE "leads" DROP CONSTRAINT IF EXISTS "leads_source_id_fkey";

-- 2. Tạo bảng Nguồn cha mới (tái dùng tên lead_sources)
CREATE TABLE "lead_sources" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "skip_pool" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

-- 3. Thêm cột source_id (tạm nullable để backfill)
ALTER TABLE "lead_groups" ADD COLUMN "source_id" BIGINT;

-- 4. Tạo 2 Nguồn mặc định theo cờ skip_pool cũ
INSERT INTO "lead_sources" ("name", "skip_pool", "updated_at") VALUES
  ('Chưa phân loại', false, CURRENT_TIMESTAMP),
  ('Chưa phân loại - Auto', true, CURRENT_TIMESTAMP);

-- 5. Gán nhóm cũ về đúng Nguồn theo skip_pool cũ
UPDATE "lead_groups" g
SET "source_id" = (SELECT s.id FROM "lead_sources" s WHERE s.skip_pool = g.skip_pool ORDER BY s.id LIMIT 1);

-- An toàn: nhóm nào còn null -> về Nguồn "Chưa phân loại"
UPDATE "lead_groups" g
SET "source_id" = (SELECT s.id FROM "lead_sources" s WHERE s.skip_pool = false ORDER BY s.id LIMIT 1)
WHERE g."source_id" IS NULL;

-- 6. source_id giờ bắt buộc; bỏ skip_pool khỏi nhóm (skipPool chỉ ở cấp cha)
ALTER TABLE "lead_groups" ALTER COLUMN "source_id" SET NOT NULL;
ALTER TABLE "lead_groups" DROP COLUMN "skip_pool";

-- 7. leads: thêm group_id, backfill = source_id cũ, rồi re-point source_id sang Nguồn cha
ALTER TABLE "leads" ADD COLUMN "group_id" BIGINT;
UPDATE "leads" SET "group_id" = "source_id" WHERE "source_id" IS NOT NULL;
UPDATE "leads" l
SET "source_id" = (SELECT g."source_id" FROM "lead_groups" g WHERE g.id = l."group_id")
WHERE l."group_id" IS NOT NULL;

-- 8. FK + index
ALTER TABLE "lead_groups" ADD CONSTRAINT "lead_groups_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "lead_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "lead_groups_source_id_idx" ON "lead_groups"("source_id");

ALTER TABLE "leads" ADD CONSTRAINT "leads_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "lead_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "lead_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "leads_group_id_idx" ON "leads"("group_id");
CREATE INDEX "leads_phone_group_id_product_id_idx" ON "leads"("phone", "group_id", "product_id");
