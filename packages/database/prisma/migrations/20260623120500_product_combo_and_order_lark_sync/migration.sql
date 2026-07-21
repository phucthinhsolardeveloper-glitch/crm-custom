-- Tach vai tro "danh muc": Combo (SP gom nhieu SP con) + Lark Sync (duong ong doc lap).
-- Lark routing chuyen tu product.categoryId sang order.larkSyncId.

-- LarkSyncMapping: bo rang buoc 1:1 voi danh muc, them ten hien thi cho duong ong
ALTER TABLE "lark_sync_mappings" DROP CONSTRAINT "lark_sync_mappings_category_id_fkey";
DROP INDEX "lark_sync_mappings_category_id_key";
ALTER TABLE "lark_sync_mappings" ALTER COLUMN "category_id" DROP NOT NULL;

-- Them cot name nullable truoc, backfill tu ten danh muc cu, roi moi khoa NOT NULL
ALTER TABLE "lark_sync_mappings" ADD COLUMN "name" TEXT;
UPDATE "lark_sync_mappings" m
  SET "name" = c."name"
  FROM "product_categories" c
  WHERE m."category_id" = c."id" AND m."name" IS NULL;
UPDATE "lark_sync_mappings"
  SET "name" = 'Duong ong ' || "id"::text
  WHERE "name" IS NULL;
ALTER TABLE "lark_sync_mappings" ALTER COLUMN "name" SET NOT NULL;

ALTER TABLE "lark_sync_mappings" ADD CONSTRAINT "lark_sync_mappings_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Product: co "la combo"
ALTER TABLE "products" ADD COLUMN "is_combo" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "products_is_combo_idx" ON "products"("is_combo");

-- Combo items: lien ket combo (SP cha) voi cac SP con (khong luu so luong)
CREATE TABLE "combo_items" (
    "id" BIGSERIAL NOT NULL,
    "combo_id" BIGINT NOT NULL,
    "product_id" BIGINT NOT NULL,
    CONSTRAINT "combo_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "combo_items_product_id_idx" ON "combo_items"("product_id");
CREATE UNIQUE INDEX "combo_items_combo_id_product_id_key" ON "combo_items"("combo_id", "product_id");
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_combo_id_fkey"
  FOREIGN KEY ("combo_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Order: duong ong Lark dich (nhan vien chon khi tao don)
ALTER TABLE "orders" ADD COLUMN "lark_sync_id" BIGINT;
CREATE INDEX "orders_lark_sync_id_idx" ON "orders"("lark_sync_id");
ALTER TABLE "orders" ADD CONSTRAINT "orders_lark_sync_id_fkey"
  FOREIGN KEY ("lark_sync_id") REFERENCES "lark_sync_mappings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
