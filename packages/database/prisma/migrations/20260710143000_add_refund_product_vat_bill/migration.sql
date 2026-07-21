-- Refund: them snapshot san pham (product_id/price/vat) de tinh doanh thu + tien VAT,
-- va bill_image luu anh bill thanh toan. Deu nullable (dong cu go tay khong co).
ALTER TABLE "refunds" ADD COLUMN "product_id" BIGINT;
ALTER TABLE "refunds" ADD COLUMN "product_price" DECIMAL(12,2);
ALTER TABLE "refunds" ADD COLUMN "vat_rate" DECIMAL(5,2);
ALTER TABLE "refunds" ADD COLUMN "bill_image" TEXT;
