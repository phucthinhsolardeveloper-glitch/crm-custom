-- Bang hoan tien nhap tay: sale tu ghi 1 dong cho moi lan hoan tien khach.
-- Doc lap, khong FK toi order/customer (moi cot go tay). Self-scope theo created_by.
CREATE TABLE "refunds" (
    "id" BIGSERIAL NOT NULL,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "product_name" TEXT,
    "group_name" TEXT,
    "team_name" TEXT,
    "refund_date" TIMESTAMP(3),
    "amount" DECIMAL(12,2) NOT NULL,
    "refund_method" TEXT,
    "refund_bank" TEXT,
    "notes" TEXT,
    "created_by" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refunds_created_by_idx" ON "refunds"("created_by");

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
