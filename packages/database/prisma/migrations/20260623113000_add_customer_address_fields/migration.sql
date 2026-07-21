-- Structured address for customers (Vietnam 2-tier model: province -> ward + free-text street).
-- Codes/names are snapshotted at selection time so renames in the source data do not mutate history.
ALTER TABLE "customers" ADD COLUMN "address_province_code" TEXT;
ALTER TABLE "customers" ADD COLUMN "address_province_name" TEXT;
ALTER TABLE "customers" ADD COLUMN "address_ward_code" TEXT;
ALTER TABLE "customers" ADD COLUMN "address_ward_name" TEXT;
ALTER TABLE "customers" ADD COLUMN "address_street" TEXT;
