# Project Overview - Product Development Requirements

## Product Vision

CRM-Custom - internal CRM system tối ưu hiệu suất đội sales, quản lý data khách hàng, pipeline lead, đánh giá performance. Hỗ trợ 50-200 users đa phòng ban. Tiếng Việt là ngôn ngữ chính, không có i18n.

## Business Context

- **Problem:** Đội sales thiếu công cụ quản lý lead/customer tập trung, theo dõi conversion, phân phối lead công bằng giữa các user, verify payment rời rạc dễ sót.
- **Solution:** CRM nội bộ với lead pipeline 7 status, payment verification hybrid (webhook + cron fuzzy + manual), phân phối AI-weighted, multi-department transfer, tasks + reminder + escalation, AI analyze (Gemini) cho customer + call log summary.
- **Users:** Sales reps (USER), Sales managers (MANAGER nhiều dept), Support team, Super admin.
- **Scale:** 50-200 users, 10K+ leads/month (với 1 spike CSV import 10K+ rows), 3+ departments, N teams per dept.

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Backend | NestJS | 11.x |
| Frontend | Next.js (App Router) | 16.x |
| Database | PostgreSQL | 16+ |
| ORM | Prisma | 6.x |
| Monorepo | Turborepo | latest |
| Package Manager | pnpm | 9.x |
| UI Components | shadcn/ui | latest |
| Styling | Tailwind CSS | 4.x |
| Forms | React Hook Form + Zod | latest |
| Tables | TanStack Table | 8.x |
| Charts | Recharts | 2.x |
| Drag & Drop | @dnd-kit | latest |
| Auth | JWT (jose) + Passport | - |
| Background Jobs | BullMQ + Redis 7 | latest |
| Logging | Pino | 8.x |
| AI | Google Gemini API | - |
| Protocol | MCP (Model Context Protocol) | 1.x |
| Deploy | Docker Compose + aaPanel + PM2 | - |
| Reverse proxy | Nginx | - |

## User Roles (RBAC Matrix)

### Roles

> **Nguồn chân lý cho ma trận quyền chi tiết:** `CLAUDE.md` -> "Role Permissions". Bảng dưới là tóm tắt.

| Role | Mô tả |
|------|-------|
| **SUPER_ADMIN** | Full access. Manage users, departments, teams, settings, API keys, recall config, system settings, distribution config. |
| **MANAGER** | Gần như SUPER_ADMIN: thấy TẤT CẢ data toàn hệ thống (KHÔNG scope theo dept). Phân phối, assign, view analytics cross-dept. KHÔNG: verify payment, quản user MANAGER+, dept, system config. |
| **LEADER** | Giám sát theo TEAM (read-heavy). ĐỌC: data cả team mình (scope `teamId`) + kho phòng ban chưa giao. GHI: self-scope như USER (chỉ sửa data của mình). Xem member + KPI team (`/users/my-team`). KHÔNG: điều phối/verify/quản trị. `teamId=null` -> degrade về USER. |
| **USER (Sale)** | CRUD leads/customers đã assigned. Tạo orders/payments. Claim từ dept pool + floating pool. Tạo tasks. |

### Permission Matrix (Key Operations)

> **LEADER** không có cột riêng dưới đây: ĐỌC theo cột MANAGER nhưng giới hạn TEAM mình (scope `teamId`); GHI/claim/transfer/order theo đúng cột USER (self-serve). LEADER KHÔNG verify payment, KHÔNG assign/recall/distribute, KHÔNG admin. Chi tiết: `CLAUDE.md` -> "Permission Matrix".

| Operation | USER | MANAGER | SUPER_ADMIN |
|-----------|:---:|:---:|:---:|
| View kho mới (POOL, dept=null) | ❌ | ✅ | ✅ |
| View kho dept mình | ✅ | ✅ | ✅ |
| View kho dept khác | ❌ | ⚠️ (chỉ managed) | ✅ |
| View floating pool | ✅ | ✅ | ✅ |
| Claim từ dept pool | ✅ (cùng dept) | ✅ | ✅ |
| Claim từ floating | ✅ | ✅ | ✅ |
| Create lead (manual) | ❌ | ✅ | ✅ |
| Update lead của mình | ✅ | ✅ | ✅ |
| Update lead của người khác | ❌ | ✅ (cùng dept) | ✅ |
| Delete lead (soft) | ❌ | ❌ | ✅ |
| Assign/bulk-assign lead | ❌ | ✅ (dept) | ✅ |
| Recall lead | ❌ | ✅ (dept) | ✅ |
| Transfer lead | ✅ (đang giữ) | ✅ (dept) | ✅ |
| Create order | ✅ | ✅ | ✅ |
| Create payment | ✅ | ✅ | ✅ |
| Verify/Reject payment | ❌ | ✅ | ✅ |
| Search customer by phone | ✅ (rate-limited) | ✅ | ✅ |
| List all customers | ❌ | ❌ | ✅ |
| Reactivate customer | ❌ | ✅ | ✅ |
| Delete customer (soft) | ❌ | ❌ | ✅ |
| Create user | ❌ | ❌ | ✅ |
| Manage dept/team/level | ❌ | ❌ | ✅ |
| Manage labels, sources | ❌ | ✅ (labels) | ✅ |
| Manage lookup (payment types, bank accounts, ...) | ❌ | ❌ | ✅ |
| View dashboard (overview) | ✅ | ✅ | ✅ |
| Dashboard dept/team/employee tabs | ❌ | ✅ | ✅ |
| AI distribution config | ❌ | ❌ | ✅ |
| AI distribution run | ❌ | ✅ | ✅ |
| Recall config | ❌ | ❌ | ✅ |
| API keys CRUD | ❌ | ❌ | ✅ |
| System settings | ❌ | ❌ | ✅ |
| CSV import | ❌ | ✅ | ✅ |
| CSV export | ❌ | ✅ | ✅ |

### IDOR Scope

Mọi repository query gắn `buildAccessFilter(user, entity, mode)`:
- USER: `assignedUserId = user.id` / `createdBy = user.id` (self-scope)
- LEADER: mode='read' -> team-scope (`assignedUser.teamId = user.teamId`) + kho phòng ban chưa giao; mode='write' -> self-scope như USER (mọi guard mutation truyền `mode='write'`)
- MANAGER: không filter (thấy TẤT CẢ, KHÔNG scope theo dept)
- SUPER_ADMIN: không filter

---

## Core Features

### 1. Lead Management

**Nguồn:**
- CSV import (BullMQ background, dedup theo `phone + sourceId + productId`)
- Manual create (MANAGER+)
- API bên thứ 3 (`/external/leads` với `x-api-key`, auto-create source)

**3 Kho:**
- **Kho Mới:** `POOL, dept=null` - MANAGER+ thấy, phân phối về dept
- **Kho Phòng Ban:** `POOL, dept=X, user=null` - NV dept X thấy + claim
- **Kho Thả Nổi:** `status=FLOATING` - ALL users thấy + claim (chủ đích "cơ hội thứ 2")

**Status:** POOL → ZOOM*/ASSIGNED → IN_PROGRESS → CONVERTED/LOST → FLOATING (7 values)
\* ZOOM: nguồn có `skipPool=true` đi thẳng vào distribution

**IN_PROGRESS auto-trigger:** sale tạo NOTE/CALL/ORDER đầu tiên trên lead ASSIGNED.

**Assignment:**
- **Template (round-robin):** Chọn danh sách người cụ thể. Vòng lặp (7 leads / 3 người → 2+2+1+1+1). Chỉ apply lên POOL/FLOATING.
- **AI distribution:** Weighted scoring workload 30% + level 30% + performance 40%. Config per department, toggle on/off.
- **Manual assign:** Manager chọn user.

### 2. Customer Management

**Lifecycle:**
- 1 Customer → nhiều Leads (cùng SĐT, khác sản phẩm hoặc thời điểm)
- Tạo từ CONVERT lead (auto) hoặc manual (manager+)
- Status: `ACTIVE` (đang chăm sóc) / `INACTIVE` (hoàn tất, ẩn khỏi kho, vẫn search được) / `FLOATING` (thả nổi)

**Transfer & Claim:** Giống lead (dept / floating / unassign).

**Search:**
- Search by SĐT: mọi user (rate-limited để chống scraping)
- List all: chỉ SUPER_ADMIN

**AI Analyze:** POST `/customers/:id/analyze` → Gemini review timeline + tạo `shortDescription` + `aiRating` (1-5 sao).

### 3. Payment Hybrid Verification

3 nguồn verify + 1 cron fuzzy:

1. **Sale tạo trước** → webhook đến sau → auto-match (amount exact + content similarity ≥ 0.8)
2. **Webhook đến trước** → sale tạo sau → auto-match ngược (reverse lookup)
3. **Cron 2h** fuzzy match các cái miss (time window 7 ngày)
4. **Manager thủ công** verify/reject phần còn lại

**Partial payment:** 1 order → N payments (CK lần 1/2/3/4/Full). Lead CONVERTED chỉ khi `SUM(verified) >= totalAmount`.

**Refund policy:** Order CANCELLED/REFUNDED **không** revert lead từ CONVERTED - chính sách chủ động để giữ audit trail chính xác.

### 4. Activity Timeline

Polymorphic (LEAD | CUSTOMER). 6 loại: NOTE, CALL, STATUS_CHANGE, ASSIGNMENT, LABEL_CHANGE, SYSTEM. Hỗ trợ attachment (file upload), và document (tài liệu riêng không thuộc activity).

**Call logs:** Webhook tổng đài → `/call-logs/ingest` → normalize phone → match entity → nếu có content: AI summarize (Gemini).

### 5. Tasks / Todo

**Quick add bar:** Smart time parsing (vd "gọi lại lúc 3h chiều mai" → auto-fill dueDate). Time preset (5m, 15m, 1h, 3h, tomorrow). From-note checkbox trong timeline.

**Reminder:** 1 lần (idempotent qua `remindedAt` flag). Cron mỗi 5 phút.

**Escalation:**
- Overdue 1h → notify assignee
- Overdue 24h → notify dept manager
- Cron mỗi 30 phút

### 6. AI Lead Distribution

Weighted scoring:
```
score = workloadScore * 0.30 + levelScore * 0.30 + performanceScore * 0.40
```
- `workloadScore`: 1 - currentLeads/maxLeads (càng rảnh càng cao)
- `levelScore`: rank / MAX_RANK
- `performanceScore`: 0.6 × conversion_30d + 0.4 × revenue_rank

Config per department qua `ai_distribution_configs.weightConfig` (JSONB) + `matchingCriteria` (filter rules). Toggle `isActive`.

### 7. Auto-Recall

Lead/customer ở dept pool quá `maxDaysInPool` ngày → `FLOATING` + gắn labels mặc định (`autoLabelIds[]`).

Cron daily 1 AM. Super admin config per entityType (LEAD/CUSTOMER). Button `/recall-configs/run-now` để trigger debug.

### 8. Analytics Dashboard

**Main overview:** 4 KPI + 2 mini chart (revenue + funnel).

**Tabs (lazy load):**
- Khách hàng: funnel, aging 0-7/8-14/15-30/30+ ngày, conversion trend, sources
- Doanh thu: revenue trend, dept revenue
- Nhân viên (MANAGER+): top performers, dept + team performance

**Employee Scorecard (MANAGER+):** 0-100 composite score per employee:
- Conversion 40% + Revenue 30% + Aging 20% + Tasks 10%
- Color: ≥70 green, ≥40 amber, <40 red
- So sánh vs TB phòng ban (±%)
- Summary: total employees, KPI achieved %, needs help count

**FLOATING leads:** metric riêng, không tính vào funnel (tránh double-count).

**CSV export:** Formula injection sanitization (prefix `= + - @ |` bằng `'`).

### 9. Notifications

**Types:** LEAD_ASSIGNED, LEAD_TRANSFERRED, LEAD_CLAIMED, PAYMENT_VERIFIED, TASK_REMINDER, TASK_OVERDUE, TASK_OVERDUE_MANAGER, SYSTEM.

**Polling:** 30s từ client. `GET /notifications/unread-count` cho badge.

**Cleanup cron:** read > 90 ngày, all > 180 ngày.

### 10. 3rd-Party Integrations

- **Website/Facebook Lead Ads:** `POST /external/leads` với `x-api-key`
- **Bank webhook:** `POST /webhooks/bank-transactions` với signature guard
- **Tổng đài webhook:** `POST /call-logs/ingest` với external ID idempotency
- **MCP server:** `/mcp` (streamable HTTP) + `/ai-agent/*` REST fallback - read-only tools cho AI agent truy vấn CRM

---

## Non-Functional Requirements

### Performance
- API response: < 500ms (p95)
- Dashboard load: < 3s
- CSV import: 10K rows < 5 phút (background BullMQ, không block API)
- Database: partial indexes + GIN FTS

### Scalability
- 50-200 users concurrent
- 10K+ leads/month
- 1M+ activities (polymorphic indexed)
- Monorepo Turborepo: parallel build
- NestJS 2 replicas sau nginx LB (aaPanel / Docker Compose)

### Uptime
- 99.5%+ target
- UptimeRobot monitoring
- Health endpoint `/health`
- pg_dump daily (7 daily + 4 weekly backup)

### Security (OWASP Top 10 aligned)

Đã implement (round 1 + round 2 audit 2026-04-13 + round 3 hardening 2026-04-16):

- **A01 Broken Access Control:** `buildAccessFilter` trên mọi repo query, IDOR test suite
- **A02 Crypto Failures:** bcrypt cost 12, refresh token SHA-256 hashed, JWT via jose
- **A03 Injection:** Prisma tagged templates only, class-validator/Zod DTOs, CSV export sanitize
- **A04 Insecure Design:** Plan review, threat model, audit reports trong `plans/reports/`
- **A05 Misconfig:** Helmet headers (HSTS 1y + preload), CSP managed by FE, CORS require `FRONTEND_URL` in prod
- **A06 Vulnerable Components:** `pnpm overrides` patch (lodash CVE-2026-4800, defu CVE-2026-35209, file-type CVE-2026-31808, @nestjs/core CVE-2026-35515)
- **A07 Auth Failures:** Account lockout (`failedLoginCount`/`lockedUntil`), generic error (no user enum), rate limit auth 5/min
- **A08 Data Integrity:** Audit trail (`assignment_history`), webhook signature guard
- **A09 Logging:** Pino with sensitive redaction (`req.headers.authorization`, `req.body.password`)
- **A10 SSRF:** File upload MIME + UUID filename + 10MB cap, path traversal safe stream

**Rate limiting:**
- Auth: 5/min/IP
- API general: 100/min/user
- 3rd party API: 100/min per API key

**Cookies:** httpOnly + Secure + SameSite=Lax, Next.js BFF proxy pattern.

### Accessibility & UX
- WCAG 2.1 AA, touch target min 44×44px
- Responsive mobile-first (card view), tablet (scroll), desktop (full table)
- Vietnamese only, DD/MM/YYYY, 1.000.000, VND (no decimals)
- Design system sky blue #0ea5e9 + cyan #06b6d4, glass effects, gradient text

### Observability
- Pino structured logs (JSON) → aaPanel file rotation
- Dashboard v2 per-section error boundary + loading skeleton
- Sentry: (chưa cài - backlog)

### Testing

Coverage target > 80% services:
- Unit: Jest (services, utils)
- API integration: Supertest (NestJS)
- E2E: Playwright (critical flows: login, lead lifecycle, payment verify)
- Test DB: separate instance, seed cleanup per test

---

## Business Rules - Edge Cases & Policies

### Dedup

- **CSV import:** Dedup theo `phone + sourceId + productId` → skip duplicate, append vào error CSV
- **Manual create:** KHÔNG dedup (cho phép tạo chủ động)
- **API 3rd-party (`/external/leads`):** KHÔNG dedup (mọi lead từ form đều tạo mới)

### Convert & Revert

- Lead CONVERTED khi `SUM(verified payments) >= order.totalAmount`
- Nếu order có nhiều payment installments → check lại sau mỗi verify
- Order CANCELLED/REFUNDED sau CONVERTED → **KHÔNG revert** lead về IN_PROGRESS
- Sale có thể manual set LOST từ IN_PROGRESS hoặc ASSIGNED

### Transfer Permission

- User đang giữ lead → transfer được (mọi loại)
- Manager dept → transfer lead thuộc dept mình quản lý
- SUPER_ADMIN → mọi lead
- Transfer record trong `assignment_history` với `reason` field

### User Deactivate

- SUPER_ADMIN deactivate user (status=INACTIVE, không xóa)
- Leads của user → về **dept pool** (giữ `departmentId`, `assignedUserId=null`, `status=POOL`)
- Auto-recall sẽ áp dụng theo config bình thường
- Customers: tương tự

### Soft Delete Unique Constraint

Bảng có `deletedAt` KHÔNG được dùng `@unique` đơn thuần → gây ghost-row blocking.

3 pattern được chấp nhận (chi tiết trong `code-standards.md`):
- **A:** Partial unique trong `raw-indexes.sql` (`WHERE deleted_at IS NULL`) - preferred
- **B:** Composite `@@unique([field, deletedAt])`
- **C:** `isActive` flag, không soft delete (cho lookup tables)

### Phone Normalization

Mọi phone → format `0xxxxxxxxx` (prefix `0`, 10-11 số). `+84` → `0`. Function trong `packages/utils/src/phone.ts`. Áp dụng cho: lead, customer, call_log, external API.

### Activity Auto-Trigger

**Rule:** NOTE/CALL/ORDER đầu tiên trên lead ASSIGNED → tự chuyển IN_PROGRESS + tạo STATUS_CHANGE activity. Không downgrade từ IN_PROGRESS/CONVERTED.

### Recall Scope

- Chỉ recall lead/customer **đã ở dept pool** (có dept, không có user) quá hạn
- KHÔNG recall lead đang ASSIGNED (user đang giữ)
- KHÔNG recall lead ở kho mới (chưa có dept)

### Partial Payment Scope

- Validate `SUM(amount) <= order.totalAmount`
- Verify tự động trigger convert check: nếu đủ → lead CONVERTED + customer tạo
- Reject 1 payment không reject cả order

---

## Implementation Plan

Located at: `plans/260325-1458-crm-v3-implementation/plan.md`
- 23 phases total, ~210h effort
- Design guidelines: `docs/design-guidelines.md`
- Roadmap: `docs/project-roadmap.md`

**Status (2026-04-17):** 23/23 phases Complete. Đang maintenance mode - security hardening, bugfix, dashboard v2 enhancements.

---

## Related Docs

- `codebase-summary.md` - Snapshot scale thực tế
- `system-architecture.md` - High-level diagram + data flow
- `data-model.md` - 31 tables chi tiết
- `api-reference.md` - Endpoint inventory
- `frontend-guide.md` - Route + component + pattern
- `business-flows.md` - Sequence diagrams cho flows nghiệp vụ
- `code-standards.md` - Coding conventions + security checklist
- `api-integration-guide.md` - 3rd-party API integration
- `deployment-guide.md` + `aapanel-deployment-guide.md` - Ops
- `project-changelog.md` - Detailed change history
