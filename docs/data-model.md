# Data Model Reference

> Schema: `packages/database/prisma/schema.prisma` (841 dòng)
> Raw indexes: `packages/database/prisma/raw-indexes.sql`
> Last verified: 2026-04-17

## Conventions

- **PK:** `BigInt` với `@default(autoincrement())` - IDENTITY trong Postgres. Serialize → `string` qua global interceptor.
- **Table/column naming:** snake_case qua `@@map` / `@map`.
- **Timestamps:** `createdAt`, `updatedAt` (auto), `deletedAt` (soft-delete nullable).
- **Soft delete:** 21/31 bảng có `deletedAt`. Partial indexes `WHERE deleted_at IS NULL` trong `raw-indexes.sql`.
- **JSONB:** Dùng cho `metadata` và `raw_data` khi thật sự dynamic.
- **Numeric:** `Decimal(12, 2)` cho tiền, `Decimal(5, 2)` cho VAT rate.

## Enums (14)

| Enum | Values |
|------|--------|
| `UserRole` | SUPER_ADMIN, MANAGER, LEADER, USER (LEADER = giám sát theo team, scope `teamId`) |
| `UserStatus` | ACTIVE, INACTIVE |
| `LeadStatus` | POOL, ZOOM, ASSIGNED, IN_PROGRESS, CONVERTED, LOST, FLOATING |
| `CustomerStatus` | ACTIVE, INACTIVE, FLOATING |
| `OrderStatus` | PENDING, COMPLETED |
| `PaymentStatus` | PENDING, VERIFIED, REJECTED, REFUNDED, CANCELLED |
| `VerifiedSource` | AUTO, MANUAL |
| `CallType` | OUTGOING, INCOMING, MISSED |
| `MatchStatus` | AUTO_MATCHED, UNMATCHED, MANUALLY_MATCHED |
| `EntityType` | LEAD, CUSTOMER, ORDER |
| `ActivityType` | NOTE, CALL, STATUS_CHANGE, ASSIGNMENT, LABEL_CHANGE, SYSTEM |
| `TaskStatus` | PENDING, COMPLETED, CANCELLED |
| `TaskPriority` | LOW, MEDIUM, HIGH |
| `ImportStatus` | PROCESSING, COMPLETED, FAILED |

## Domain Map (31 tables)

```
┌─────────────────────────────────────────────────────────────────────┐
│ AUTH                         ORGANIZATION                           │
│ ─────                        ────────────                           │
│ users ◄──────────────┐       departments ◄──┐                       │
│ refresh_tokens       │       teams ─────────┤                       │
│ api_keys             │       manager_departments                    │
│                      │       employee_levels                        │
│                      │                                              │
├──────────────────────┼──────────────────────────────────────────────┤
│ CRM CORE             │                                              │
│ ────────             │                                              │
│ customers ◄──────────┤                                              │
│ leads ──────────────►┤       lead_sources (lookup)                  │
│   (label_id FK)       \      labels ◄────────────                   │
│ customer_labels ──────►       ↑                                     │
├─────────────────────────────┼────────────────────────────────────────┤
│ COMMERCE                    │                                        │
│ ────────                    │                                        │
│ orders ─► payments ◄─ bank_transactions  (webhook match)             │
│   │         ↑                                                        │
│   │         └── payment_types, bank_accounts, payment_installments   │
│   ├── products ─► product_categories                                 │
│   ├── product_groups (lookup)                                        │
│   └── order_formats (lookup)                                         │
├─────────────────────────────────────────────────────────────────────┤
│ ACTIVITY                     ASSIGNMENT                             │
│ ────────                     ──────────                             │
│ activities ──► activity_attachments                                 │
│ documents                    assignment_history                     │
│ call_logs                    assignment_templates ─► members        │
├─────────────────────────────────────────────────────────────────────┤
│ CONFIG                       PRODUCTIVITY                           │
│ ──────                       ────────────                           │
│ ai_distribution_configs      tasks                                  │
│ recall_configs               notifications                          │
│ system_settings              import_jobs                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Auth (3 tables)

### `users`
Entity trung tâm - mọi bảng CRM tham chiếu qua assignedUserId/createdBy.

| Column | Type | Ghi chú |
|--------|------|---------|
| id | BigInt PK | |
| email | String | Unique qua `@@unique([email, deletedAt])` (Pattern B) |
| passwordHash | String | bcrypt cost 12 |
| role | UserRole | Default USER |
| departmentId | BigInt? | FK → departments |
| teamId | BigInt? | FK → teams (member side). Quyết định scope của LEADER |
| employeeLevelId | BigInt? | FK → employee_levels |
| status | UserStatus | ACTIVE/INACTIVE |
| failedLoginCount, lockedUntil | - | Account lockout |
| metadata | Json? | |
| deletedAt | DateTime? | Soft delete |

**Relations:** managedDepts (M2M), leadingTeams (1-M + partial unique), assignedLeads, assignedCustomers, activities, ordersCreated, paymentsVerified, documentsUploaded, assignmentsFrom/To/Made, refreshTokens, tasksAssigned/Created, notifications, importJobs, templateMemberships, apiKeysCreated, recallConfigsCreated, assignmentTemplatesCreated.

### `refresh_tokens`
Rotation pattern. Token hashed SHA-256 trước khi lưu.

| Column | Type | Ghi chú |
|--------|------|---------|
| tokenHash | String | SHA-256 hash (không lưu plain) |
| userAgent, ipAddress | String? | Audit |
| expiresAt | DateTime | 30-day rolling |
| revokedAt | DateTime? | Set khi rotate hoặc logout |

Index: `tokenHash`, `userId`. Cron dọn expired/revoked > 30 ngày.

### `api_keys`
Super admin quản lý. Key plaintext chỉ hiện 1 lần lúc tạo.

| Column | Type | Ghi chú |
|--------|------|---------|
| keyHash | String unique | SHA-256 |
| keyPrefix | String | Hiển thị trong UI (vd `crm_abc`) |
| permissions | String[] | Default `["leads:create"]` |
| expiresAt | DateTime? | Optional TTL |

---

## Organization (4 tables)

### `departments`
Không soft delete? - CÓ (`deletedAt DateTime?`). Xóa cascade: users.departmentId bị null hóa ở service layer.

### `teams`
**Soft-delete + partial unique** trên `leaderId`:
```sql
CREATE UNIQUE INDEX idx_teams_leader_active
  ON teams(leader_id) WHERE deleted_at IS NULL;
```
Prisma không còn `@unique` → relation `User.leadingTeams` phải là `Team[]` (many), nghiệp vụ "1 leader cho 1 active team" enforce bởi partial index + service logic. Khi DELETE: transaction detach members + soft-delete team (cascade auto-detach).

### `manager_departments`
M2M giữa MANAGER role user và departments họ quản lý. PK composite.

### `employee_levels`
Lookup cấp bậc + `maxLeads` cap (null = unlimited). Trên rank: INTERN < JUNIOR < ... Dùng trong AI distribution scoring.

---

## CRM Core (6 tables)

### `customers`
| Column | Type | Ghi chú |
|--------|------|---------|
| phone | String | Normalized (+84) |
| name, email, companyName | - | - |
| facebookUrl, instagramUrl, zaloUrl, linkedinUrl | String? | Social |
| shortDescription, description | String? | Mô tả + AI description |
| aiRating | Int? | 1-5 sao, AI đánh giá |
| birthday | Date? | Sinh nhật. Cron 9h UTC+7 gửi reminder hôm nay + 3 ngày |
| avatarUrl | String? | Path `/uploads/avatars/customer/YYYY-MM/{uuid}.{ext}` |
| totalSpent | Decimal(14,2) | Denormalized SUM(payments VERIFIED). Recalc realtime trong payment verify hook |
| currentTierId | BigInt? FK | → `customer_tiers.id` (SET NULL khi tier xoá) |
| assignedUserId, assignedDepartmentId | BigInt? | Current owner |
| status | CustomerStatus | ACTIVE/INACTIVE/FLOATING |

**Indexes:** `assignedUserId`, `(assignedDepartmentId, assignedUserId)`, `currentTierId`.
**Uniqueness:** KHÔNG có (1 phone có thể có nhiều customer qua dedup rule riêng - chỉ CSV import dedup).

### `customer_tiers` (NEW 2026-06-04)
Config bảng phân hạng KH theo `totalSpent`. SUPER_ADMIN CRUD qua `/settings/customer-tiers`. Soft delete = `is_active=false` (giữ FK toàn vẹn).

| Column | Type | Ghi chú |
|--------|------|---------|
| name | String | Vd "Kim Cương" |
| slug | String UNIQUE | Vd "diamond" |
| minSpending | Decimal(12,2) | Ngưỡng VND, recalc dùng `>=` |
| color | String | Hex `#RRGGBB` |
| emoji | String? | SUPER_ADMIN set, ưu tiên hơn icon_key khi render |
| iconKey | String? | Fallback Lucide icon (Award/Trophy/Medal/Gem/Crown/Star) |
| sortOrder | Int | Hiển thị ASC |
| benefits | String? | Mô tả quyền lợi |
| isActive | Boolean | Soft delete flag |

**Indexes:** `sortOrder`. Seed: 5 tiers mặc định (Đồng/Bạc/Vàng/Bạch Kim/Kim Cương) - upsert skip-if-exists để không đè config admin sau re-seed.

### `leads`
Core entity. 7 status.

| Column | Type | Ghi chú |
|--------|------|---------|
| customerId | BigInt? | 1 lead → 0/1 customer (chỉ CONVERTED mới bắt buộc) |
| productId, sourceId | BigInt? | Context |
| assignedUserId | BigInt? | null = pool |
| departmentId | BigInt? | null = kho mới, có = kho phòng ban |
| status | LeadStatus | 7 trạng thái |

**Indexes:** customerId, sourceId, productId, `(status, assignedUserId)`, departmentId.

**Kho logic (dựa vào status + assignedUserId + departmentId):**
- Kho Mới: `status=POOL, dept=null, user=null` → manager+ thấy
- Kho Phòng Ban: `status=POOL, dept=X, user=null` → NV dept X thấy+claim
- Kho Cá Nhân: `user != null`
- Kho Thả Nổi: `status=FLOATING` → ALL users thấy+claim

### `lead_sources`
Pattern C (`isActive` flag, không soft delete). `skipPool` = true → lead tạo mới đi thẳng vào AI distribution, skip dept pool.

### `labels`, `customer_labels`
Label master (pattern C - `isActive`). DELETE label → soft-deactivate để giữ history.

**Cardinality (BREAKING 2026-05-06):**
- **Lead** = single label via FK `leads.label_id` (nullable). `leads.label_assigned_at` tracks last reset for per-label recall cron.
- **Customer** = multi-label via junction `customer_labels (customer_id, label_id)`.

Migration: bảng `lead_labels` đã drop. `recall_configs.auto_label_ids[]` → `auto_label_id BIGINT?`. Recall cron skip-if-exists (không đè nhãn business). CSV import multi-label → giữ nhãn đầu, log warning.

---

## Commerce (9 tables - bao gồm bank_accounts)

### `products`
Decimal price + VAT rate. Soft delete. FK categoryId.

### `product_categories`, `product_groups`, `order_formats`, `payment_types`, `payment_installments`, `bank_accounts`
6 lookup table - tất cả pattern C (`isActive`, không soft delete). Tên được phép reuse.

### `orders`
Rich domain entity. Nhiều field legacy + lookup FK. **Status: 2 giá trị (PENDING, COMPLETED).**

| Column | Ghi chú |
|--------|---------|
| leadId, customerId | Customer bắt buộc, lead optional |
| productId | Optional |
| amount, vatRate, vatAmount, totalAmount | Decimal(12,2)/(5,2) |
| status | OrderStatus (2 giá trị: PENDING, COMPLETED) |
| companyName, taxCode, contactPerson, vatEmail | Thông tin xuất VAT |
| customerName, customerPhone, address | Denormalized (history) |
| format (legacy) + formatId (lookup) | Migration hybrid |
| groupType (legacy) + productGroupId (lookup) | - |
| stt, courseCode, notes | Additional context |
| createdBy | BigInt - user tạo |

**Indexes:** leadId, customerId, createdBy + composite (status + createdAt trong Round 2 audit).

**Status Flow:** PENDING → COMPLETED (auto-trigger khi `SUM(payment.amount WHERE status IN (VERIFIED,REJECTED)) >= order.totalAmount`). Bỏ order-level cancel/refund - giờ là action trên Payment.

### `payments`
Hybrid verification: PENDING ↔ bank_transactions. Partial payment hỗ trợ qua `installmentId`. **Status: 5 giá trị (PENDING, VERIFIED, REJECTED, REFUNDED, CANCELLED).**

| Column | Ghi chú |
|--------|---------|
| orderId | FK |
| paymentTypeId, bankAccountId, installmentId | Lookup |
| amount, vatAmount | Decimal |
| status | PaymentStatus (5 giá trị: PENDING, VERIFIED, REJECTED, REFUNDED, CANCELLED) |
| statusReason | String? - lý do reject/refund/cancel (SUPER_ADMIN nhập) |
| transferContent, transferDate | Người dùng nhập |
| verifiedSource | AUTO/MANUAL |
| verifiedBy, verifiedAt | Audit |

**Status định nghĩa:**
- **PENDING:** Chờ duyệt (sale tạo hoặc bank webhook auto-match chưa verify)
- **VERIFIED:** Tiền về đúng (SUPER_ADMIN verify hoặc webhook auto-match)
- **REJECTED:** Tiền CÓ về nhưng sale nhập sai → phạt (SUPER_ADMIN reject, lưu reason)
- **REFUNDED:** Trả lại khách (SUPER_ADMIN action, lưu reason)
- **CANCELLED:** Tạo nhầm, tiền không về (SUPER_ADMIN hoặc người tạo cancel khi PENDING, lưu reason)

**Revenue Calculation:** Doanh thu TỔNG (công ty) = `SUM(amount) WHERE status IN (VERIFIED,REJECTED)`. Doanh số SALE (KPI) = `SUM(amount) WHERE status = VERIFIED`.

Index: orderId + composite (order + status - Round 2 audit).

### `bank_transactions`
Ingest webhook ngân hàng.

| Column | Ghi chú |
|--------|---------|
| externalId | **`@unique`** (không soft delete - OK) |
| amount, content, bankAccount, senderName, senderAccount | Raw data |
| transactionTime | DateTime |
| matchedPaymentId | **`@unique`** - 1 TX chỉ match 1 payment |
| matchStatus | AUTO_MATCHED / UNMATCHED / MANUALLY_MATCHED |
| rawData | Json - gốc payload |

Index: `(matchStatus, createdAt)`, `(amount, transactionTime)`.

---

## Activity (4 tables)

### `activities`
Polymorphic - `entityType + entityId` (LEAD | CUSTOMER).

| Column | Ghi chú |
|--------|---------|
| entityType | EntityType enum |
| entityId | BigInt (không FK - polymorphic) |
| userId | User tạo |
| type | ActivityType (6 loại) |
| content | Note/summary |
| metadata | Json (vd `{fromStatus, toStatus}` cho STATUS_CHANGE) |
| deletedAt | Soft delete |

**Indexes:** `(entityType, entityId, createdAt)`, `(userId, createdAt)`.

**Trigger nghiệp vụ:** Tạo NOTE/CALL đầu tiên trên ASSIGNED lead → service auto-transition sang IN_PROGRESS + tự tạo STATUS_CHANGE activity.

### `activity_attachments`
File đính kèm 1 activity. Unique path `file_url`.

### `documents`
Tách biệt với activity - "tài liệu" gắn entity (hợp đồng, giấy tờ). Soft delete.

### `call_logs`
| Column | Ghi chú |
|--------|---------|
| externalId | **Partial unique** (WHERE deleted_at IS NULL) - Pattern A |
| phoneNumber | Normalized |
| callType | OUTGOING/INCOMING/MISSED |
| duration | Seconds |
| content | Transcript (nếu có) |
| analysis | AI summary (Gemini), JSON text. `score` thang 0-10 |
| matchedEntityType/Id/UserId | Auto-match qua phoneNumber |
| matchStatus | AUTO/UNMATCHED/MANUAL |
| deletedAt | Soft delete |

**Indexes:** `(phoneNumber, callTime)`, `(matchedEntityType, matchedEntityId, callTime)`.

### `call_feedbacks`
Feedback (gop y) cua LEADER+ ve 1 cuoc goi. 1 cuoc goi → N feedback.

| Column | Ghi chú |
|--------|---------|
| callLogId | FK → call_logs |
| authorId | FK → users (nguoi feedback) |
| content | Noi dung gop y |
| createdAt/updatedAt/deletedAt | Soft delete |

**Quyen:** tao = LEADER (cuoc team) + MANAGER+ (all); xem = USER (cuoc cua minh) + LEADER (team) + MANAGER+ (all). Notify sale khi co feedback moi (`type='CALL_FEEDBACK'`).
**Index:** `idx_call_feedbacks_active` partial `(call_log_id, created_at) WHERE deleted_at IS NULL`.

---

## Assignment (3 tables)

### `assignment_history`
Audit log. Không soft delete (history immutable).

| Column | Ghi chú |
|--------|---------|
| entityType, entityId | LEAD | CUSTOMER |
| fromUserId, toUserId | Null khi từ/về pool |
| fromDepartmentId, toDepartmentId | Dept tracking |
| assignedBy | User thực hiện |
| reason | String? - lý do transfer |

Index: `(entityType, entityId, createdAt)`.

Dùng cho: employee scorecard (đếm leads assigned cho user trong khoảng thời gian), transfer report.

### `assignment_templates`
Round-robin template.

| Column | Ghi chú |
|--------|---------|
| strategy | String "ROUND_ROBIN" (mở rộng: WEIGHTED, CUSTOM) |
| isActive | Pattern C |

### `assignment_template_members`
Composite PK `(templateId, userId)`. Order → vòng round-robin.

---

## Config (3 tables)

### `ai_distribution_configs`
1:1 với department (`departmentId @unique`).

| Column | Ghi chú |
|--------|---------|
| matchingCriteria | Json - filter rules |
| weightConfig | Json - `{workload: 30, level: 30, performance: 40}` |
| isActive | - |

### `recall_configs`
Config auto-recall dept pool → FLOATING.

| Column | Ghi chú |
|--------|---------|
| entityType | String "LEAD" hoặc "CUSTOMER" |
| maxDaysInPool | Int |
| autoLabelIds | BigInt[] - nhãn gắn tự động |
| isActive | - |

Cron `Daily 1 AM` đọc config active, quét entities quá hạn.

### `system_settings`
Simple key-value, PK = `key String`. Dùng cho feature flag, config động.

---

## Productivity (3 tables)

### `tasks`
Todo với reminder + escalation.

| Column | Ghi chú |
|--------|---------|
| entityType, entityId | Link tới lead/customer (optional) |
| assignedTo, createdBy | User FK |
| dueDate, remindAt | Reminder schedule |
| remindedAt | Flag: đã gửi reminder chưa (1 lần) |
| escalation1At (1h overdue) | → user |
| escalation2At (24h overdue) | → manager |
| status, priority | Enum |
| completedAt | Audit |
| deletedAt | Soft delete |

**Indexes:** `(assignedTo, status, dueDate)`, `(remindAt, remindedAt, status)` - cho cron sweep.

### `notifications`
Polling 30s từ frontend.

| Column | Ghi chú |
|--------|---------|
| userId | Target |
| type | String (LEAD_ASSIGNED, TRANSFER, CLAIM, PAYMENT_VERIFIED, TASK_REMINDER, ...) |
| entityType, entityId | Link optional |
| isRead | Boolean |

Index: `(userId, isRead, createdAt)`. Cleanup cron: read > 90d, all > 180d.

### `import_jobs`
BullMQ CSV import status. CSV format (columns, bilingual headers, dedup rules) xem `api-reference.md` §28.

| Column | Ghi chú |
|--------|---------|
| type | "leads" | "customers" |
| status | PROCESSING / COMPLETED / FAILED |
| totalRows, successCount, errorCount | Progress (warning rows vẫn tính `successCount`) |
| errorFileUrl | CSV lỗi `row,field,message` để user download fix. Warning label-không-match cũng xuất hiện với prefix `[Warning]` |

---

## Raw Indexes (partial + GIN)

File `packages/database/prisma/raw-indexes.sql`. Prisma không express được:

- **Partial unique** cho soft-delete models: `idx_teams_leader_active`, `idx_call_logs_external_active`, `idx_users_email_active` (backup cho `@@unique([email, deletedAt])`)
- **Partial** cho các bảng soft-delete, giảm index size: `WHERE deleted_at IS NULL` trên customers, leads, orders, activities
- **GIN (Full-Text Search)** trên `leads.name + phone + email`, `customers.name + phone + email`, `call_logs.content + analysis`
- **GIN JSONB** trên `leads.metadata`, `customers.metadata`

## Soft-Delete Unique Pattern Audit

Bảng có `@unique` + `deletedAt`:

| Bảng | Field | Pattern | Ghi chú |
|------|-------|---------|---------|
| users | email | B (composite) + backup partial | `@@unique([email, deletedAt])` |
| teams | leaderId | A (partial unique) | Swap khỏi `@unique`, Prisma relation → `Team[]` |
| call_logs | externalId | A (partial unique) | Swap khỏi `@unique`, `findUnique` → `findFirst({deletedAt:null})` |
| documents, activities, products, customers, leads, orders | (không có unique string) | - | An toàn |
| api_keys | keyHash | **`@unique` giữ** | Không soft delete (chỉ deactivate qua `isActive`) - OK |
| bank_transactions | externalId, matchedPaymentId | **`@unique` giữ** | Không soft delete - OK |
| ai_distribution_configs | departmentId | **`@unique` giữ** | Không soft delete - OK |

→ 3 bảng cần partial unique, tất cả đã fix (xem changelog 2026-04-17).

## Key Business Invariants

1. **1 Customer → N Leads:** 1 số điện thoại có thể có nhiều lead (khác sản phẩm/thời điểm).
2. **1 Order → N Payments:** Partial payment (CK lần 1/2/Full). Order CONVERTED khi `SUM(verified payments) ≥ totalAmount`.
3. **1 Team → 1 Active Leader:** enforce partial unique + service check.
4. **1 User ∈ 1 Team:** teamId single FK.
5. **1 Dept ↔ N Manager:** qua `manager_departments` M2M.
6. **Assignment audit:** Mọi claim/transfer/assign/recall → 1 row `assignment_history`.
7. **Activity auto-trigger:** NOTE/CALL đầu tiên trên ASSIGNED lead → IN_PROGRESS + STATUS_CHANGE activity.

## Related Docs

- `code-standards.md` - 3 pattern soft-delete unique chi tiết
- `api-reference.md` - Endpoint expose các entity này
- `business-flows.md` - Sequence cho payment verification, lead lifecycle
