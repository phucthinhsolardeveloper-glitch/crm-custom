-- Refund: đường ống Lark để đổ dòng hoàn tiền khi điền tay (null = không đổ)
ALTER TABLE "refunds" ADD COLUMN "lark_sync_id" BIGINT;
ALTER TABLE "refunds" ADD COLUMN "lark_record_id" TEXT;
ALTER TABLE "refunds" ADD COLUMN "lark_synced_at" TIMESTAMP(3);

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_lark_sync_id_fkey"
  FOREIGN KEY ("lark_sync_id") REFERENCES "lark_sync_mappings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "refunds_lark_sync_id_idx" ON "refunds"("lark_sync_id");
