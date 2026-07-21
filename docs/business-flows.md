# Business Flows

> Sequence diagrams + narrative cho các nghiệp vụ cốt lõi của CRM V4.
> Last verified: 2026-04-17.

## Table of Contents

1. [Lead Lifecycle - 3 Kho](#1-lead-lifecycle--3-kho)
2. [Payment Hybrid Verification](#2-payment-hybrid-verification)
3. [Auto-Recall (dept pool → floating)](#3-auto-recall)
4. [AI Lead Distribution](#4-ai-lead-distribution)
5. [Transfer (lead + customer)](#5-transfer)
6. [Call Log Ingest + Auto-Match](#6-call-log-ingest--auto-match)
7. [CSV Import (BullMQ)](#7-csv-import-bullmq)
8. [Task Reminder + Escalation](#8-task-reminder--escalation)

---

## 1. Lead Lifecycle - 3 Kho

### State Diagram

```mermaid
stateDiagram-v2
    [*] --> POOL_new: CSV/Manual/API<br/>dept=null, user=null
    POOL_new --> POOL_dept: Manager phân phối<br/>dept=X
    POOL_dept --> ASSIGNED: User claim / Manager assign<br/>user=Y
    POOL_new --> ASSIGNED: Direct assign (manager+)
    ASSIGNED --> IN_PROGRESS: NOTE/CALL/ORDER đầu tiên<br/>(auto-trigger)
    IN_PROGRESS --> CONVERTED: Order+Payment verified<br/>≥ totalAmount
    IN_PROGRESS --> LOST: User thủ công
    ASSIGNED --> LOST: User thủ công
    LOST --> FLOATING: (manual hoặc auto-recall)
    POOL_dept --> FLOATING: Auto-recall<br/>quá X ngày
    FLOATING --> ASSIGNED: Any user claim
    CONVERTED --> [*]: Customer tạo
```

### Kho Model (derived state)

Kho KHÔNG phải cột riêng - derived từ 3 field:

| Kho | status | departmentId | assignedUserId | Ai thấy |
|-----|--------|--------------|----------------|---------|
| Kho Mới | POOL | **null** | null | MANAGER+ |
| Kho Phòng Ban | POOL | X | null | NV dept X + LEADER dept X (đọc) + MANAGER + SUPER_ADMIN |
| Kho Cá Nhân | ASSIGNED/IN_PROGRESS | X | Y | User Y + LEADER nếu Y cùng team (đọc) + MANAGER + SUPER_ADMIN |
| Kho Thả Nổi | **FLOATING** | (any) | (any/null) | **ALL users** |

> **LEADER** (giám sát theo team) thấy data của member cùng `teamId` + kho phòng ban chưa giao của dept mình - chỉ ĐỌC. Mọi thao tác GHI (sửa/claim/transfer) self-scope như USER. MANAGER/SUPER_ADMIN thấy TẤT CẢ (không scope dept).

### Sequence: User Claim từ Dept Pool

```mermaid
sequenceDiagram
    actor Sale
    participant Web as Next.js
    participant Proxy as /api/proxy
    participant API as NestJS /leads
    participant Svc as LeadsService
    participant DB as PostgreSQL

    Sale->>Web: Click "Claim" trên /leads/dept
    Web->>Proxy: POST /api/proxy/leads/:id/claim
    Proxy->>API: + Authorization: Bearer ...
    API->>Svc: claim(id, user)
    Svc->>DB: SELECT lead WHERE id AND buildAccessFilter(user)
    DB-->>Svc: lead (POOL, dept matches user.dept)
    alt lead không hợp lệ (đã có assignedUser, sai dept)
        Svc-->>API: 400/403
    else OK
        Svc->>DB: UPDATE lead SET assignedUserId=user.id, status=ASSIGNED
        Svc->>DB: INSERT assignment_history (from=null, to=user, reason='claim')
        Svc->>DB: INSERT activity (type=ASSIGNMENT)
    end
    API-->>Web: 200 {data: lead}
    Web->>Web: router.refresh() → revalidate list
```

### Auto-Trigger IN_PROGRESS

Khi sale tạo **NOTE** hoặc **CALL** hoặc **ORDER** đầu tiên trên lead ASSIGNED:

```mermaid
sequenceDiagram
    actor Sale
    participant API as /leads/:id/activities
    participant ASvc as ActivitiesService
    participant LSvc as LeadsService
    participant DB

    Sale->>API: POST NOTE content
    API->>ASvc: create(lead, NOTE)
    ASvc->>DB: INSERT activity
    ASvc->>LSvc: onFirstNoteOrCall(leadId)
    LSvc->>DB: SELECT lead WHERE status=ASSIGNED
    alt lead đang ASSIGNED
        LSvc->>DB: UPDATE status=IN_PROGRESS
        LSvc->>DB: INSERT activity (STATUS_CHANGE)
    end
```

**Rule:** không downgrade từ IN_PROGRESS/CONVERTED về ASSIGNED.

---

## 2. Payment Hybrid Verification

**Redesign 2026-06-20:** 2 status cấp order (PENDING, COMPLETED), 5 status cấp payment (PENDING, VERIFIED, REJECTED, REFUNDED, CANCELLED). 2 công thức doanh thu tách biệt: **Doanh thu TỔNG** = tiền về từ khách (VERIFIED+REJECTED), **Doanh số SALE** = tiền được công nhân (VERIFIED only).

3 nguồn verify: **sale tạo → bank TX match**, **CSV import sao kê → payment match**, **SUPER_ADMIN thủ công**, với **cron 2h** retry fuzzy.

> **Update 2026-04-22:** Bank ngừng push webhook API. Kế toán tải CSV sao kê định kỳ, SA upload qua `/payments → tab "Import sao kê CSV"` (`POST /bank-transactions/import`). Logic auto-match `tryMatchBankTransaction()` GIỮ NGUYÊN - chỉ thay nguồn ingest. Webhook cũ vẫn giữ (backward-compat).

### Payment Status Diagram

```mermaid
stateDiagram-v2
    [*] --> PENDING: Sale/CSV tạo
    PENDING --> VERIFIED: Auto-match TX / SUPER_ADMIN verify
    PENDING --> REJECTED: SUPER_ADMIN: Sale nhập sai (phạt) + reason
    PENDING --> CANCELLED: SUPER_ADMIN / Sale (owner): Tạo nhầm + reason
    VERIFIED --> REFUNDED: SUPER_ADMIN: Trả lại khách + reason
    REJECTED --> [*]: Final
    REFUNDED --> [*]: Final
    CANCELLED --> [*]: Final
    VERIFIED --> [*]: Final
```

### Flow A: Sale tạo trước, CSV import đến sau

```mermaid
sequenceDiagram
    actor Sale
    participant API as /payments
    participant PSvc as PaymentsService
    participant Match as PaymentMatchingService
    participant DB
    participant Bank as Bank Webhook
    participant Webhook as /webhooks/bank-transactions

    Sale->>API: POST /payments (amount, content, orderId)
    API->>DB: INSERT payment status=PENDING
    API-->>Sale: 201

    Note over Bank,Webhook: Sau vài phút
    Bank->>Webhook: POST transaction (amount, content, senderName)
    Webhook->>Match: onNewTransaction(tx)
    Match->>DB: SELECT payments WHERE status=PENDING<br/>AND amount = tx.amount<br/>AND content similarity >= 0.8
    alt Match unique
        Match->>DB: UPDATE payment status=VERIFIED, verifiedSource=AUTO
        Match->>DB: UPDATE bank_transaction matchStatus=AUTO_MATCHED, matchedPaymentId
        Match->>PSvc: onPaymentVerified(payment)
        PSvc->>PSvc: checkOrderConversion(orderId)
        alt SUM(VERIFIED+REJECTED) ≥ totalAmount
            PSvc->>DB: UPDATE order status=COMPLETED<br/>Tạo customer nếu chưa có
            PSvc->>DB: UPDATE lead status=CONVERTED
            PSvc->>DB: INSERT activity (STATUS_CHANGE)
            PSvc->>DB: INSERT notification (PAYMENT_VERIFIED) cho sale
        end
    else Không khớp
        Match->>DB: INSERT bank_transaction matchStatus=UNMATCHED
    end
```

### Flow B: Webhook đến trước, sale tạo sau

Bank TX ingest với `UNMATCHED`. Khi sale tạo payment PENDING, `PaymentsService.create` gọi `Match.reverseMatch(payment)` để tìm TX UNMATCHED khớp → tự verify.

### Flow C: Cron fuzzy retry (mỗi 2h)

```mermaid
sequenceDiagram
    participant Cron
    participant Match as PaymentMatchingService
    participant DB

    Cron->>Match: fuzzyMatchBatch()
    Match->>DB: SELECT payments WHERE status=PENDING AND createdAt > now-7d
    Match->>DB: SELECT bank_transactions WHERE matchStatus=UNMATCHED AND transactionTime > now-7d
    loop Mỗi payment
        Match->>Match: fuzzyScore (amount exact + content similarity + time window)
        alt score >= threshold
            Match->>DB: verify + mark matched
        end
    end
```

### Flow D: Manual verify (SUPER_ADMIN)

```mermaid
sequenceDiagram
    actor Admin as SUPER_ADMIN
    participant UI as /payments?status=pending
    participant API as /payments/:id/{verify,reject}
    participant DB

    Admin->>UI: Review payment vs bank screenshot
    alt Tiền về đúng
        Admin->>API: POST /verify
        API->>DB: UPDATE status=VERIFIED, verifiedSource=MANUAL, verifiedBy=admin.id
        API->>DB: checkOrderConversion (COMPLETED khi SUM(VERIFIED+REJECTED) >= totalAmount)
    else Sale nhập sai (phạt)
        Admin->>API: POST /reject {reason}
        API->>DB: UPDATE status=REJECTED, statusReason, verifiedBy=admin.id
        API->>DB: checkOrderConversion (SUM(VERIFIED+REJECTED) tính vào doanh thu tổng)
    end
```

### Flow E: Cancel / Refund (SUPER_ADMIN)

```
POST /payments/:id/cancel {reason}
  → Status PENDING → CANCELLED (sale tạo nhầm tiền không về)
  → SUPER_ADMIN hoặc người tạo payment khi còn PENDING

POST /payments/:id/refund {reason}
  → Status VERIFIED → REFUNDED (trả lại khách sau verify)
  → SUPER_ADMIN only
```

### Revenue Calculation

**2 công thức riêng biệt:**

1. **Doanh thu TỔNG (công ty):** = `SUM(payment.amount) WHERE status IN (VERIFIED, REJECTED) AND order.deletedAt IS NULL`
   - Tính cả REJECTED (tiền về nhưng sale nhập sai - vẫn là doanh thu khách hàng thanh toán)
   - Dùng cho: analytics tổng doanh số, lark sync paidTotal (=doanh thu tổng), tier upgrade

2. **Doanh số SALE (KPI):** = `SUM(payment.amount) WHERE status = VERIFIED AND order.deletedAt IS NULL`
   - Chỉ VERIFIED (sale được hưởng KPI/commission khi tiền xác nhận)
   - REJECTED bị phạt vì nhập sai, REFUNDED không tính, CANCELLED không tính
   - Dùng cho: employee scorecard, revenue rank, performance bonus

### Partial Payment Rule

- 1 order có thể có N payments (installment: CK lần 1/2/3/4/Full)
- Order KHÔNG chuyển COMPLETED từng lần, mà chỉ khi `SUM(VERIFIED+REJECTED payments) >= totalAmount`
- Lead CONVERTED đồng bộ theo order COMPLETED
- Refund/Cancel payment sau order COMPLETED **KHÔNG revert lead** (policy chính thức)

---

## 3. Auto-Recall

Cron **Daily 1 AM** quét lead/customer ở dept pool quá `maxDaysInPool` ngày → chuyển FLOATING + gắn labels mặc định.

```mermaid
sequenceDiagram
    participant Cron
    participant Svc as RecallService
    participant DB

    Cron->>Svc: runRecall()
    Svc->>DB: SELECT recall_configs WHERE isActive=true
    loop config cho LEAD và CUSTOMER
        Svc->>DB: SELECT entities<br/>WHERE status=POOL AND departmentId IS NOT NULL<br/>AND user IS NULL<br/>AND updatedAt < now - maxDays
        loop each entity
            Svc->>DB: UPDATE status=FLOATING, assignedDept=null
            Svc->>DB: UPDATE lead.label_id = config.autoLabelId<br/>(skip-if-exists: only when label_id IS NULL)
            Svc->>DB: INSERT assignment_history (from_dept=X, to=floating, reason='auto-recall')
        end
    end
```

**Lead vs Customer Label Cardinality (BREAKING 2026-05-06):**
- Lead: single label via FK `leads.label_id` (nullable). Auto-recall **skip-if-exists** - không đè nhãn business.
- Customer: multi-label via junction `customer_labels`. Auto-recall append `autoLabelId` (idempotent với `skipDuplicates`).

**Config per entity type:**
- LEAD: typical 14 ngày
- CUSTOMER: typical 30 ngày

Super admin toggle `isActive`, `/recall-configs/run-now` để trigger ngay (debug).

---

## 4. AI Lead Distribution

Khác với **assignment template** (round-robin giản đơn), AI Distribution dùng weighted scoring.

### Scoring Formula

```
score(user) = (workloadScore × 0.30)
            + (levelScore × 0.30)
            + (performanceScore × 0.40)

workloadScore    = 1 - (currentLeads / maxLeads)   # càng rảnh càng cao
levelScore       = user.level.rank / MAX_RANK
performanceScore = conversion_rate_30d * 0.6 + revenue_rank * 0.4
```

Weights config per dept qua `ai_distribution_configs.weightConfig` JSONB.

### Flow

```mermaid
sequenceDiagram
    actor Manager
    participant UI as /settings/distribution
    participant API as /distribution/distribute/:deptId
    participant Svc as DistributionService
    participant DB

    Manager->>UI: Review scores preview
    UI->>API: GET /distribution/scores/:deptId
    API->>Svc: calculateScores(deptId)
    Svc->>DB: SELECT users active IN dept + load + perf + level
    Svc-->>UI: Array<{userId, score, breakdown}>

    Manager->>UI: Click "Phân phối"
    UI->>API: POST /distribution/distribute/:deptId
    API->>Svc: distribute(deptId)
    Svc->>DB: SELECT leads WHERE status=POOL AND deptId=X AND user IS NULL
    Svc->>Svc: allocate proportional to score<br/>+ cap tại maxLeads per user
    loop each allocation
        Svc->>DB: UPDATE lead.assignedUserId, status=ASSIGNED
        Svc->>DB: INSERT assignment_history
        Svc->>DB: INSERT notification (LEAD_ASSIGNED) cho user
    end
```

**Source skip_pool:** Lead từ source có `skipPool=true` (vd Zalo OA premium) đi thẳng vào distribution, bỏ qua kho phòng ban.

---

## 5. Transfer

### 3 Loại Transfer

| Loại | Target | Điều kiện |
|------|--------|-----------|
| DEPARTMENT | departmentId → Y | User hiện giữ + manager dept X + SUPER_ADMIN |
| FLOATING | status → FLOATING, user=null | Bất kỳ |
| UNASSIGN | user=null, status→POOL (giữ dept) | - |

```mermaid
sequenceDiagram
    actor User
    participant API as /leads/:id/transfer
    participant Svc
    participant DB

    User->>API: POST {type, targetDeptId?, reason}
    API->>Svc: canTransfer(user, lead, type)
    Svc->>Svc: check ownership or manager-of-dept or super-admin
    alt denied
        Svc-->>API: 403
    else OK
        Svc->>DB: UPDATE lead (status, deptId, userId theo type)
        Svc->>DB: INSERT assignment_history (from, to, reason)
        Svc->>DB: INSERT activity (ASSIGNMENT)
        Svc->>DB: INSERT notification cho dept nhận (nếu DEPARTMENT)
    end
```

### User Deactivate

Khi SUPER_ADMIN deactivate user → leads của user tự về **dept pool** (giữ dept cũ). Auto-recall sẽ kick vào theo config bình thường.

---

## 6. Call Log Ingest + Auto-Match

```mermaid
sequenceDiagram
    participant PBX as Tổng đài
    participant API as /call-logs/ingest
    participant Svc as CallLogsService
    participant AI as AiSummaryService
    participant DB

    PBX->>API: POST {externalId, phone, type, time, duration, content?}
    API->>Svc: ingest(dto)
    Svc->>Svc: normalize phone (+84)
    Svc->>DB: findFirst({externalId, deletedAt:null})
    alt đã tồn tại
        Svc-->>API: 200 (idempotent)
    else mới
        Svc->>DB: SELECT lead WHERE phone=X ORDER BY updatedAt DESC LIMIT 1
        alt match lead
            Svc->>DB: INSERT call_log matchedEntityType=LEAD, matchedEntityId
            Svc->>DB: INSERT activity (CALL) trên lead
        else match customer
            Svc->>DB: INSERT call_log matchedEntityType=CUSTOMER
        else miss
            Svc->>DB: INSERT call_log matchStatus=UNMATCHED
        end
        alt content có text
            Svc->>AI: summarize(content) async
            AI-->>Svc: summary
            Svc->>DB: UPDATE call_log.analysis
        end
    end
```

Manager có thể manual match qua `/call-logs/:id/match` cho row UNMATCHED.

---

## 7. CSV Import (BullMQ)

```mermaid
sequenceDiagram
    actor User
    participant API as /imports/leads
    participant Queue as BullMQ
    participant Worker
    participant DB
    participant Dedup

    User->>API: POST multipart CSV
    API->>API: validate MIME, size
    API->>DB: INSERT import_job status=PROCESSING
    API->>Queue: enqueue {jobId, filePath}
    API-->>User: 202 {jobId}

    Worker->>Queue: pickup
    loop each row
        Worker->>Worker: normalize phone, sanitize fields
        Worker->>Dedup: findExisting(phone + sourceId + productId)
        alt tồn tại
            Worker->>Worker: skip, append to error CSV
        else mới
            Worker->>DB: INSERT lead status=POOL
            Worker->>DB: INSERT activity (SYSTEM) "CSV import"
        end
        Worker->>DB: UPDATE import_job successCount/errorCount
    end
    Worker->>DB: UPDATE import_job status=COMPLETED, errorFileUrl

    User->>API: GET /imports/:jobId/status (polling)
    API-->>User: progress + errorFileUrl download
```

**Dedup rule:** CHỈ CSV import có dedup theo `phone + sourceId + productId`. Manual create hoặc API 3rd-party KHÔNG dedup (cho phép tạo trùng để xử lý nghiệp vụ riêng).

---

## 8. Task Reminder + Escalation

### 3 Cron

```mermaid
sequenceDiagram
    participant Cron5m as Cron mỗi 5 phút
    participant Cron30m as Cron mỗi 30 phút
    participant Svc as TasksService
    participant DB
    participant Notif

    Cron5m->>Svc: sweepReminders()
    Svc->>DB: SELECT tasks WHERE status=PENDING<br/>AND remindAt <= now<br/>AND remindedAt IS NULL
    loop each task
        Svc->>DB: UPDATE task.remindedAt = now
        Svc->>Notif: TASK_REMINDER → assignee
    end

    Cron30m->>Svc: sweepEscalation()
    Svc->>DB: SELECT tasks WHERE status=PENDING AND dueDate IS NOT NULL
    loop
        alt overdue >= 1h AND escalation1At IS NULL
            Svc->>DB: UPDATE escalation1At=now
            Svc->>Notif: TASK_OVERDUE → assignee (1h)
        end
        alt overdue >= 24h AND escalation2At IS NULL
            Svc->>DB: UPDATE escalation2At=now
            Svc->>Notif: TASK_OVERDUE_MANAGER → dept manager
        end
    end
```

**Rule:** reminder chỉ gửi 1 lần (idempotent qua `remindedAt` flag). Escalation cũng 1 lần mỗi mốc.

---

## State Transitions Matrix

### LeadStatus

| From \ To | POOL | ZOOM | ASSIGNED | IN_PROGRESS | CONVERTED | LOST | FLOATING |
|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| (new) | ✅ | ✅* | - | - | - | - | - |
| POOL | - | - | ✅ | - | - | - | ✅ |
| ZOOM | - | - | ✅ | - | - | - | ✅ |
| ASSIGNED | - | - | - | ✅ | ✅** | ✅ | ✅ |
| IN_PROGRESS | - | - | - | - | ✅ | ✅ | ✅ |
| CONVERTED | - | - | - | - | - | - | - (terminal) |
| LOST | - | - | - | - | - | - | ✅ |
| FLOATING | - | - | ✅ | - | - | - | - |

\* ZOOM khi source.skipPool=true và nguồn là Zoom-related
\** Cho phép convert direct từ ASSIGNED nếu payment đầy đủ luôn

### CustomerStatus

| From \ To | ACTIVE | INACTIVE | FLOATING |
|-----------|:---:|:---:|:---:|
| (new) | ✅ | - | - |
| ACTIVE | - | ✅ | ✅ |
| INACTIVE | ✅ (reactivate) | - | ✅ |
| FLOATING | ✅ (claim) | - | - |

### OrderStatus

| From \ To | PENDING | CONFIRMED | COMPLETED | CANCELLED | REFUNDED |
|-----------|:---:|:---:|:---:|:---:|:---:|
| (new) | ✅ | - | - | - | - |
| PENDING | - | ✅ | - | ✅ | - |
| CONFIRMED | - | - | ✅ | ✅ | - |
| COMPLETED | - | - | - | - | ✅ |
| CANCELLED | ✅ | - | - | - | - |

### PaymentStatus

```
PENDING → VERIFIED (auto via webhook OR manual via manager)
PENDING → REJECTED (manual)
```

VERIFIED/REJECTED = terminal.

---

## Cross-Cutting Concerns

### Notification Triggers

| Sự kiện | Recipient | Type |
|---------|-----------|------|
| Lead assigned to user | user | LEAD_ASSIGNED |
| Lead transferred to dept | dept manager | LEAD_TRANSFERRED |
| User claim lead | dept manager (optional) | LEAD_CLAIMED |
| Payment verified | sale tạo payment | PAYMENT_VERIFIED |
| Task due soon | assignee | TASK_REMINDER |
| Task overdue 1h / 24h | assignee / manager | TASK_OVERDUE / _MANAGER |
| AI distribution run | users được assign | LEAD_ASSIGNED |
| Auto-recall trigger | (không notify - silent, có label) | - |

### Idempotency Points

- `call_logs.externalId` - ingest đi ingest lại không duplicate
- `bank_transactions.externalId` - webhook replay an toàn
- `task.remindedAt` - reminder chỉ gửi 1 lần
- `task.escalation1At/2At` - escalation 1 lần mỗi mốc

### Audit Trails

Mọi transfer/claim/assign/recall → INSERT `assignment_history`. Dùng cho:
- Employee scorecard (đếm leads assigned cho user trong khoảng time)
- Transfer audit report
- Investigation khi lead bị transfer nhiều lần

---

## Related Docs

- `data-model.md` - Schema chi tiết
- `api-reference.md` - Endpoint tương ứng mỗi flow
- `system-architecture.md` - Cron schedule + module dependencies
- `project-overview-pdr.md` - Business context & rules tổng quát
