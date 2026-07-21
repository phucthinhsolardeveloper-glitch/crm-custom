-- Migration: add_customer_phones
-- Adds customer_phones table to store alternate phone numbers per Customer.
-- Customer.phone remains the primary phone. customer_phones holds N additional numbers.
-- Cross-table dedup is enforced at app level via CustomerPhonesService.assertPhoneNotExists().

CREATE TABLE "customer_phones" (
  "id"          BIGSERIAL    PRIMARY KEY,
  "customer_id" BIGINT       NOT NULL,
  "phone"       TEXT         NOT NULL,
  "label"       TEXT,
  "note"        TEXT,
  "created_by"  BIGINT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  "deleted_at"  TIMESTAMP(3),
  CONSTRAINT "customer_phones_customer_id_fkey" FOREIGN KEY ("customer_id")
    REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customer_phones_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "customer_phones_customer_id_idx"        ON "customer_phones"("customer_id");
CREATE INDEX "customer_phones_phone_idx"              ON "customer_phones"("phone");
CREATE INDEX "customer_phones_phone_deleted_at_idx"   ON "customer_phones"("phone", "deleted_at");
