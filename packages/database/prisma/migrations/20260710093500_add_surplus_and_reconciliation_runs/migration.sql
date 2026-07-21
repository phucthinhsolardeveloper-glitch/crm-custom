-- Tien du: giao dich ngan hang khong phai ban hang (ban be tra no, hoan tien...)
-- hoac Sale chua nhap. Admin danh dau tay khi doi soat. Bang thuan luu tru,
-- KHONG lien ket CRM. external_id giu trace + chong import trung lai.
CREATE TABLE "surplus_transactions" (
    "id" BIGSERIAL NOT NULL,
    "external_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "content" TEXT NOT NULL,
    "sender_name" TEXT,
    "sender_account" TEXT,
    "transaction_time" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "marked_by" BIGINT NOT NULL,
    "marked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surplus_transactions_pkey" PRIMARY KEY ("id")
);

-- Lich su 1 lan doi soat sao ke. Chi luu ban tom tat nhe (range + counts +
-- tong tien) de audit + mo lai chay lai. Chi tiet ghep cap tinh lai tu du lieu song.
CREATE TABLE "reconciliation_runs" (
    "id" BIGSERIAL NOT NULL,
    "from_date" TIMESTAMP(3) NOT NULL,
    "to_date" TIMESTAMP(3) NOT NULL,
    "run_by" BIGINT NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "surplus_transactions_external_id_key" ON "surplus_transactions"("external_id");
CREATE INDEX "surplus_transactions_marked_at_idx" ON "surplus_transactions"("marked_at");
CREATE INDEX "reconciliation_runs_run_at_idx" ON "reconciliation_runs"("run_at");
