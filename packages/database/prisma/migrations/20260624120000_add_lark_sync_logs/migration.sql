-- Nhat ky dong bo payment -> Lark Base. 1 dong/payment (upsert ket qua cuoi cung).
-- Khong FK cung toi payment/mapping de giu lich su ke ca khi mapping bi xoa.
-- Cron don log cu hon 30 ngay theo cot synced_at.
CREATE TABLE "lark_sync_logs" (
    "id" BIGSERIAL NOT NULL,
    "payment_id" BIGINT NOT NULL,
    "order_id" BIGINT,
    "mapping_id" BIGINT,
    "channel_name" TEXT NOT NULL,
    "table_id" TEXT,
    "status" TEXT NOT NULL,
    "request_payload" JSONB,
    "lark_response" JSONB,
    "lark_record_id" TEXT,
    "error_message" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lark_sync_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lark_sync_logs_payment_id_key" ON "lark_sync_logs"("payment_id");
CREATE INDEX "lark_sync_logs_synced_at_idx" ON "lark_sync_logs"("synced_at");
CREATE INDEX "lark_sync_logs_status_idx" ON "lark_sync_logs"("status");
