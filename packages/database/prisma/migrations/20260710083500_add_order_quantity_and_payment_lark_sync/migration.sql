-- Order: so luong san pham (mac dinh 1). totalAmount = amount * quantity
ALTER TABLE "orders" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;

-- Payment: bang Lark rieng cho payment; null = dung bang cua don
ALTER TABLE "payments" ADD COLUMN "lark_sync_id" BIGINT;

ALTER TABLE "payments" ADD CONSTRAINT "payments_lark_sync_id_fkey"
  FOREIGN KEY ("lark_sync_id") REFERENCES "lark_sync_mappings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "payments_lark_sync_id_idx" ON "payments"("lark_sync_id");
