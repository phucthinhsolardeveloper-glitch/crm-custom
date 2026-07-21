-- Nguoi bam tao payment. Truoc day payment khong luu ai tao -> quyen sua/huy phai
-- muon order.created_by, sai khi don do nguoi khac tao con sale khac nhap payment.
-- Cot nullable: payment cu / import / webhook giu NULL (khong ai "so huu" de tu sua).
ALTER TABLE "payments" ADD COLUMN "created_by" BIGINT;

CREATE INDEX "payments_created_by_idx" ON "payments"("created_by");
