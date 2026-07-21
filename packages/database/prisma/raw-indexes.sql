-- Raw SQL indexes for CRM V4
-- These indexes cannot be expressed in Prisma schema (partial, GIN, FTS)
-- Run after initial schema push: psql -f raw-indexes.sql

-- USERS: active users, unique email among non-deleted
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_active ON users(status) WHERE status = 'ACTIVE' AND deleted_at IS NULL;

-- DEPARTMENTS: unique name among non-deleted
CREATE UNIQUE INDEX IF NOT EXISTS idx_dept_name_active ON departments(name) WHERE deleted_at IS NULL;

-- LEADS: main filter query (status + user + date, active only)
CREATE INDEX IF NOT EXISTS idx_leads_filter ON leads(status, assigned_user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_phone_active ON leads(phone) WHERE deleted_at IS NULL;

-- LEADS: full-text search
CREATE INDEX IF NOT EXISTS idx_leads_fts ON leads USING GIN(
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(phone,''))
) WHERE deleted_at IS NULL;

-- LEADS: GIN on JSONB metadata
CREATE INDEX IF NOT EXISTS idx_leads_metadata ON leads USING GIN(metadata) WHERE deleted_at IS NULL;

-- CUSTOMERS: phone search + pool + FTS
CREATE INDEX IF NOT EXISTS idx_customers_phone_active ON customers(phone) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_email_active ON customers(email) WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_dept_pool ON customers(assigned_department_id, assigned_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_fts ON customers USING GIN(
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(phone,''))
) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_metadata ON customers USING GIN(metadata) WHERE deleted_at IS NULL;

-- ORDERS: status filter
CREATE INDEX IF NOT EXISTS idx_orders_status_active ON orders(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_date ON orders(customer_id, created_at DESC) WHERE deleted_at IS NULL;

-- PAYMENTS: pending queue
CREATE INDEX IF NOT EXISTS idx_payments_pending ON payments(status) WHERE status = 'PENDING';

-- CALL_LOGS: unmatched queue
CREATE INDEX IF NOT EXISTS idx_calls_unmatched ON call_logs(match_status) WHERE match_status = 'UNMATCHED' AND deleted_at IS NULL;

-- ACTIVITIES: global feed
CREATE INDEX IF NOT EXISTS idx_activities_global ON activities(entity_type, created_at DESC) WHERE deleted_at IS NULL;

-- REFRESH_TOKENS: cleanup
CREATE INDEX IF NOT EXISTS idx_refresh_cleanup ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;

-- EMPLOYEE_LEVELS: rank sort
CREATE INDEX IF NOT EXISTS idx_emp_levels_rank ON employee_levels(rank);

-- ══════════════════════════════════════════════════════════════════════════
-- Additional performance indexes
-- ══════════════════════════════════════════════════════════════════════════

-- leads dept+status partial index (kho phòng ban queries)
CREATE INDEX IF NOT EXISTS idx_leads_dept_status_active
  ON leads(department_id, status) WHERE deleted_at IS NULL;

-- activities per-entity lookup (timeline, correlated subqueries)
CREATE INDEX IF NOT EXISTS idx_activities_entity_active
  ON activities(entity_type, entity_id, created_at DESC) WHERE deleted_at IS NULL;

-- trigram indexes for ILIKE substring search (phone/name)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_leads_phone_trgm
  ON leads USING gin(phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_name_trgm
  ON leads USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm
  ON customers USING gin(phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON customers USING gin(name gin_trgm_ops);

-- leads updated_at for getTopPerformers date filtering
CREATE INDEX IF NOT EXISTS idx_leads_updated_at_active
  ON leads(updated_at DESC) WHERE deleted_at IS NULL;

-- functional date indexes for getConversionTrend (::date cast)
CREATE INDEX IF NOT EXISTS idx_leads_created_date
  ON leads((created_at::date)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_converted_date
  ON leads((updated_at::date)) WHERE status = 'CONVERTED' AND deleted_at IS NULL;

-- payment matching by status+amount
CREATE INDEX IF NOT EXISTS idx_payments_status_amount
  ON payments(status, amount);

-- payments verified_at for dashboard revenue aggregation
CREATE INDEX IF NOT EXISTS idx_payments_status_verified_at
  ON payments(status, verified_at);

-- customers status partial index
CREATE INDEX IF NOT EXISTS idx_customers_status_active
  ON customers(status) WHERE deleted_at IS NULL;

-- tasks assigned+status+due for user task queries
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status_due_active
  ON tasks(assigned_to, status, due_date) WHERE deleted_at IS NULL;
-- Reminder cron index da chuyen sang Prisma @@index([remindAt, remindedAt]) tren model TaskReminder.
-- Cot remind_at/reminded_at da doi tu bang tasks sang task_reminders -> bo index cu tren tasks
-- (no tham chieu cot khong con ton tai, fail tren moi DB fresh va thua vi index Prisma da phu).

-- assignment history 72h window query (kho mới monitoring)
CREATE INDEX IF NOT EXISTS idx_assignment_history_type_created
  ON assignment_history(entity_type, created_at DESC) WHERE from_department_id IS NULL;

-- ══════════════════════════════════════════════════════════════════════════
-- Additional performance indexes
-- ══════════════════════════════════════════════════════════════════════════

-- orders by status+date range (order list, dashboard filters)
CREATE INDEX IF NOT EXISTS idx_orders_status_date
  ON orders(status, created_at DESC) WHERE deleted_at IS NULL;

-- payments composite order+status (conversion trigger, validation)
CREATE INDEX IF NOT EXISTS idx_payments_order_status
  ON payments(order_id, status);

-- ══════════════════════════════════════════════════════════════════════════
-- TEAMS: partial unique on leader_id (2026-04-17)
-- Cho phép reuse leader khi team cũ đã bị soft-delete
-- Thay thế @unique (full unique) bị bỏ khỏi schema.prisma
-- ══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_leader_active
  ON teams(leader_id) WHERE deleted_at IS NULL;

-- ══════════════════════════════════════════════════════════════════════════
-- CALL_LOGS: partial unique on external_id (2026-04-17)
-- Cho phép ingest lại nếu row cũ đã soft-delete (vendor retry)
-- ══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS idx_call_logs_external_active
  ON call_logs(external_id) WHERE deleted_at IS NULL;

-- ══════════════════════════════════════════════════════════════════════════
-- USER_PHONES: 1 SĐT chỉ thuộc 1 user active tại 1 thời điểm (2026-05-08)
-- Cho phép re-assign số đã soft-delete cho user khác
-- ══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_phones_phone_active
  ON user_phones(phone) WHERE deleted_at IS NULL;

-- ══════════════════════════════════════════════════════════════════════════
-- FOREIGN KEY INDEXES (2026-06-03)
-- Postgres không tự tạo index cho FK -> join/include trên các cột này phải seq scan.
-- Payments không có deleted_at -> index full; Orders có deleted_at -> cân nhắc partial.
-- ══════════════════════════════════════════════════════════════════════════

-- PAYMENTS: FK chưa có index (include paymentType/bankAccount/installment/verifier)
CREATE INDEX IF NOT EXISTS idx_payments_payment_type ON payments(payment_type_id);
CREATE INDEX IF NOT EXISTS idx_payments_bank_account ON payments(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_payments_installment ON payments(installment_id);
CREATE INDEX IF NOT EXISTS idx_payments_verified_by ON payments(verified_by);

-- ORDERS: FK chưa có index (include product/orderFormat/productGroup)
-- Partial WHERE deleted_at IS NULL - nhất quán với các index orders khác, list luôn lọc active
CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_format ON orders(format_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_product_group ON orders(product_group_id) WHERE deleted_at IS NULL;

-- BANK_TRANSACTIONS: ho tro listPending (WHERE match_status='UNMATCHED' AND amount BETWEEN ...)
-- Partial UNMATCHED - index nho, dung dung dai cua hang doi doi soat
CREATE INDEX IF NOT EXISTS idx_bank_tx_unmatched_amount
  ON bank_transactions(match_status, amount) WHERE match_status = 'UNMATCHED';

-- ══════════════════════════════════════════════════════════════════════════
-- CALL_FEEDBACKS: list feedback theo cuoc goi (WHERE call_log_id = ? ORDER BY created_at)
-- Partial deleted_at IS NULL - list luon loc active
-- ══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_call_feedbacks_active
  ON call_feedbacks(call_log_id, created_at) WHERE deleted_at IS NULL;

-- ══════════════════════════════════════════════════════════════════════════
-- LEAD_GROUPS: chong trung ten nhom trong cung Nguon (2026-06-22)
-- Chuan hoa LOWER(TRIM(name)) -> "Power 163" / "POWER 163" / " power 163 " coi la trung.
-- Backstop cung cho dedup o service layer (lead-groups.service.ts assertNameUnique).
-- LUU Y: chi tao duoc sau khi da xoa het ban trung san co (xem plan Phan C).
-- ══════════════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_groups_name_source_unique
  ON lead_groups(LOWER(TRIM(name)), source_id);
