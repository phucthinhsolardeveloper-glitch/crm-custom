# CRM-Custom

> Internal CRM system tối ưu hiệu suất đội sales, quản lý data khách hàng, pipeline lead và đánh giá performance. Hỗ trợ 50-200 users đa phòng ban. Vietnamese-first, không i18n.

**Trạng thái:** Shipped & Hardened (maintenance mode)

---

## Tech Stack

| Layer | Tech | Version |
|-------|------|---------|
| Backend | NestJS | 11.x |
| Frontend | Next.js (App Router) | 16.x |
| Database | PostgreSQL | 16+ |
| ORM | Prisma | 6.x |
| Monorepo | Turborepo + pnpm | latest / 9.x |
| UI | shadcn/ui + Tailwind CSS | latest / 4.x |
| Forms | React Hook Form + Zod | latest |
| Tables | TanStack Table | 8.x |
| Charts | Recharts | 2.x |
| DnD | @dnd-kit | latest |
| Auth | JWT (jose) + Passport | - |
| Jobs | BullMQ + Redis | 7.x |
| Logging | Pino | 8.x |
| AI | Google Gemini API | - |
| Protocol | MCP (Model Context Protocol) | 1.x |
| Telephony | OmiCall Web SDK | v3 |
| Deploy | Docker Compose + aaPanel + PM2 + Nginx | - |

---

## Architecture

- **Next.js = pure frontend.** Không truy cập Prisma trực tiếp. Mọi data đi qua NestJS API.
- **NestJS = single source of business logic.** Controller → Service → Repository → Prisma.
- **REST only**, prefix `/api/v1`, port `3010`. Frontend port `3011`.
- **Shared packages:** `@crm/types` (DTO, enum), `@crm/database` (Prisma), `@crm/utils` (phone normalize, CSV sanitize, formatters).
- **IDOR prevention:** Mọi repo query gắn `buildAccessFilter(user)`.

---

## Tính năng chính

### 1. Lead Management - 3 kho
- **Kho Mới** (`POOL, dept=null`) - MANAGER+ phân phối về dept
- **Kho Phòng Ban** (`POOL, dept=X, user=null`) - NV cùng dept claim
- **Kho Thả Nổi** (`status=FLOATING`) - ALL users claim ("cơ hội thứ 2")
- 7 status: POOL → ZOOM/ASSIGNED → IN_PROGRESS → CONVERTED/LOST → FLOATING
- IN_PROGRESS auto-trigger khi sale tạo NOTE/CALL/ORDER đầu tiên
- Unified `/leads` page với URL preset filter (status, assignment, team, label, source, product, hasOrder, date range)
- Secondary phone (kho SDT phụ): quét trùng cả primary + secondary khi import/dedup

### 2. Customer Management
- 1 Customer → N Leads (cùng SĐT, khác sản phẩm/thời điểm)
- Status: ACTIVE / INACTIVE / FLOATING
- Transfer & claim như lead
- Search by SĐT (rate-limited) cho mọi user; list all chỉ SUPER_ADMIN
- **AI Analyze:** Gemini review timeline → `shortDescription` + `aiRating` (1-5 sao)

### 3. Payment Hybrid Verification
4 nguồn match:
1. Sale tạo trước → webhook đến → auto-match (amount exact + content similarity ≥ 0.8)
2. Webhook đến trước → sale tạo sau → reverse lookup
3. Cron 2h fuzzy match cái miss (window 7 ngày)
4. SUPER_ADMIN verify thủ công còn lại

- **Partial payments:** 1 order → N payments (CK lần 1/2/3/4/Full), convert khi `SUM(verified) >= order.total`
- **Refund policy:** Order CANCELLED/REFUNDED **không** revert lead CONVERTED (giữ audit trail)

### 4. Assignment
- **Round-robin template:** Chọn danh sách người, vòng lặp (7 leads / 3 người → 2+2+1+1+1)
- **AI distribution:** Weighted scoring `workload 30% + level 30% + performance 40%`, config per department
- **Manual assign:** Manager chọn user trực tiếp

### 5. Activity Timeline
- Polymorphic (LEAD | CUSTOMER), 6 loại: NOTE, CALL, STATUS_CHANGE, ASSIGNMENT, LABEL_CHANGE, SYSTEM
- File attachment (UUID filename, MIME validation, 10MB cap)
- Lead documents (tài liệu riêng, không thuộc activity)

### 6. Call logs
- Webhook tổng đài → normalize phone → match entity → AI summarize (Gemini)
- **OmiCall integration:** Web SDK v3 click-to-call + incoming popup + observability (log step + toast 10s khi lỗi)

### 7. Tasks / Todo
- Quick add bar với smart time parsing ("gọi lại 3h chiều mai" → auto dueDate)
- Time presets (5m, 15m, 1h, 3h, tomorrow), from-note checkbox trong timeline
- Reminder idempotent (cron 5 phút)
- Escalation: overdue 1h → assignee, 24h → manager (cron 30 phút)

### 8. Auto-Recall
- Lead/customer ở dept pool quá `maxDaysInPool` ngày → FLOATING + gắn auto-labels
- **Skip-if-exists:** không đè nhãn business (`label_id IS NULL`)
- Cron daily 1 AM, config per entityType (LEAD/CUSTOMER)

### 9. Analytics Dashboard
- 4 KPI + 2 mini chart (revenue + funnel) trên overview
- Tabs lazy-load: Khách hàng (funnel + aging), Doanh thu (trend + dept), Nhân viên (top performers, scorecard)
- **Employee Scorecard:** 0-100 composite score (conversion 40% + revenue 30% + aging 20% + tasks 10%), so sánh ±% với TB phòng ban
- CSV export với formula injection sanitization (`= + - @ |` → `'`)

### 10. Notifications
- 8 types: LEAD_ASSIGNED, LEAD_TRANSFERRED, LEAD_CLAIMED, PAYMENT_VERIFIED, TASK_REMINDER, TASK_OVERDUE, TASK_OVERDUE_MANAGER, SYSTEM
- Polling 30s, badge qua `/notifications/unread-count`
- Cleanup cron: read > 90 ngày, all > 180 ngày

### 11. 3rd-Party Integrations
- **Website/FB Lead Ads:** `POST /external/leads` với `x-api-key`
- **Bank webhook:** `POST /webhooks/bank-transactions` với signature guard
- **Tổng đài webhook:** `POST /call-logs/ingest` với external ID idempotency
- **MCP server:** `/mcp` (streamable HTTP) + `/ai-agent/*` REST fallback (read-only tools)
- **OmiCall:** Web SDK click-to-call + DTO validation cho ingest/from-web

### 12. Import / Export
- **CSV import (BullMQ):** State machine PENDING_REVIEW → REVIEWED → PROCESSING → COMPLETED, dry-run validate, dedup theo `phone + sourceId + productId`, 10K rows < 5 phút
- **CSV export:** Leads, customers, orders với sanitization

---

## Flow & Sequence Diagrams

> Sơ đồ Mermaid render trực tiếp trên GitHub. Xem chi tiết business logic tại [`docs/business-flows.md`](./docs/business-flows.md).

### A. System Architecture (high-level)

```mermaid
flowchart LR
    User([User Browser])
    External([Bank webhook<br/>Tổng đài / OmiCall<br/>FB Lead Ads])

    subgraph Web["Next.js 16 - port 3011"]
        SSR[Server Components]
        CC[Client Components]
        BFF["/api/proxy<br/>BFF cookie to Bearer"]
    end

    subgraph API["NestJS 11 - port 3010 - /api/v1"]
        Ctrl[Controllers + Guards]
        Svc[Services - business logic]
        Repo["Repositories<br/>buildAccessFilter"]
    end

    subgraph Data[Data Layer]
        PG[("PostgreSQL 16<br/>31 tables")]
        Redis[("Redis 7<br/>BullMQ queue")]
        FS[("Local FS<br/>uploads/")]
    end

    User -->|HTTPS + httpOnly cookie| Web
    SSR --> BFF
    CC --> BFF
    BFF -->|Bearer JWT| Ctrl
    Ctrl --> Svc
    Svc --> Repo
    Repo -->|Prisma 6| PG
    Svc -->|enqueue job| Redis
    Svc --> FS
    External -->|x-api-key| Ctrl
```

### B. Authentication Flow (JWT + refresh rotation)

```mermaid
sequenceDiagram
    actor U as User
    participant W as Next.js
    participant P as BFF Proxy
    participant A as NestJS Auth
    participant DB as PostgreSQL

    U->>W: POST /login (email, password)
    W->>P: forward
    P->>A: POST /api/v1/auth/login
    A->>DB: SELECT user WHERE email
    DB-->>A: user (bcrypt hash, lockedUntil)
    A->>A: bcrypt.compare()
    alt sai password
        A->>DB: UPDATE failedLoginCount++
        A-->>P: 401 generic error (no enum)
    else đúng
        A->>A: sign JWT (15m) + refresh (7d)
        A->>DB: INSERT refresh_tokens (SHA-256 hash)
        A-->>P: 200 token pair
    end
    P-->>W: Set-Cookie httpOnly Secure SameSite=Lax
    W-->>U: Redirect /dashboard

    Note over W,A: ~15 phút sau, access token hết hạn

    U->>W: GET /leads
    W->>P: + cookie
    P->>A: + Bearer (expired)
    A-->>P: 401
    P->>A: POST /auth/refresh + refresh cookie
    A->>DB: verify hash + rotate (delete old, insert new)
    A-->>P: token pair mới
    P-->>W: replay request gốc
```

### C. Lead Lifecycle - 3 Kho (state diagram)

```mermaid
stateDiagram-v2
    [*] --> POOL_new: CSV / Manual / 3rd-party API<br/>dept = null, user = null

    POOL_new --> POOL_dept: Manager phân phối<br/>set dept = X
    POOL_new --> ASSIGNED: Manager direct assign

    POOL_dept --> ASSIGNED: User claim<br/>hoặc Manager assign
    POOL_dept --> FLOATING: Auto-recall<br/>quá maxDaysInPool

    ASSIGNED --> IN_PROGRESS: NOTE/CALL/ORDER<br/>đầu tiên (auto-trigger)
    ASSIGNED --> LOST: User thủ công

    IN_PROGRESS --> CONVERTED: SUM verified payments<br/>≥ order.totalAmount
    IN_PROGRESS --> LOST: User thủ công

    LOST --> FLOATING: Manual hoặc auto-recall
    FLOATING --> ASSIGNED: ANY user claim<br/>(cơ hội thứ 2)

    CONVERTED --> [*]: Customer tạo
```

| Kho | status | dept | user | Ai thấy |
|-----|--------|------|------|---------|
| **Mới** | POOL | null | null | MANAGER+ |
| **Phòng Ban** | POOL | X | null | NV dept X + MANAGER X + SUPER_ADMIN |
| **Cá Nhân** | ASSIGNED/IN_PROGRESS | X | Y | User Y + MANAGER + SUPER_ADMIN |
| **Thả Nổi** | FLOATING | (any) | (any) | **ALL users** |

### D. Payment Hybrid Verification (4 nguồn match)

```mermaid
flowchart TB
    Start([Order created]) --> P1[Sale tạo Payment PENDING]
    Start -.->|độc lập| W1[Bank webhook<br/>tạo BankTransaction]

    P1 --> M1{Auto-match với BankTx unmatched?<br/>amount exact + content sim 0.8}
    W1 --> M2{Auto-match ngược<br/>với Payment PENDING?}

    M1 -->|match| V[Status = VERIFIED]
    M1 -->|miss| Wait[Chờ tiếp]
    M2 -->|match| V
    M2 -->|miss| Wait

    Wait --> Cron[Cron 2h fuzzy<br/>window 7 ngày]
    Cron -->|match| V
    Cron -->|miss| Manual[SUPER_ADMIN<br/>verify thủ công]
    Manual -->|approve| V
    Manual -->|reject| R[Status = REJECTED]

    V --> Chk{SUM verified<br/>>= order.totalAmount?}
    Chk -->|chưa đủ| Partial[Partial payment<br/>chờ payment tiếp]
    Chk -->|đủ| Conv[Lead -> CONVERTED<br/>Customer tạo]
    Partial -.->|tạo CK lần 2/3/Full| P1
```

### E. CSV Import State Machine (BullMQ)

```mermaid
stateDiagram-v2
    [*] --> UPLOADED: User upload CSV
    UPLOADED --> PENDING_REVIEW: Dry-run validate<br/>(BullMQ background)
    PENDING_REVIEW --> REVIEWED: User xem preview + sửa<br/>POST /imports/:id/review
    PENDING_REVIEW --> CANCELLED: User huỷ
    REVIEWED --> PROCESSING: User confirm<br/>POST /imports/:id/start
    REVIEWED --> CANCELLED: User huỷ
    PROCESSING --> COMPLETED: Insert + dedup OK<br/>(phone + sourceId + productId)
    PROCESSING --> FAILED: Lỗi DB/queue
    COMPLETED --> [*]
    FAILED --> [*]
    CANCELLED --> [*]
```

### F. Call Log Ingest + Auto-Match (OmiCall / Tổng đài)

```mermaid
sequenceDiagram
    participant Tel as Tổng đài / OmiCall
    participant API as NestJS /call-logs/ingest
    participant Norm as phone-normalize
    participant DB as PostgreSQL
    participant Gem as Gemini AI

    Tel->>API: POST {externalId, from, to, duration, recordUrl, content?}
    API->>API: Validate DTO + x-api-key
    API->>DB: SELECT WHERE externalId (idempotency)
    alt đã tồn tại
        API-->>Tel: 200 (skip)
    else mới
        API->>Norm: normalize(+84xxx -> 0xxx)
        Norm-->>API: 0987654321
        API->>DB: Match phone trên lead/customer<br/>+ secondary phones (kho SDT phụ)
        DB-->>API: entity (lead | customer | null)
        API->>DB: INSERT call_log + polymorphic ref
        opt có content (transcript)
            API->>Gem: summarize(content)
            Gem-->>API: aiSummary
            API->>DB: UPDATE call_log SET aiSummary
        end
        API->>DB: INSERT activity (type=CALL)
        API-->>Tel: 201 Created
    end
```

### G. Auto-Recall Flow (cron daily 1AM)

```mermaid
flowchart LR
    Cron([Cron daily 1AM]) --> Cfg[Load RecallConfig<br/>per entityType<br/>maxDaysInPool + autoLabelIds]
    Cfg --> Query["SELECT WHERE<br/>status=POOL<br/>AND user IS NULL<br/>AND deptUpdatedAt < NOW - maxDays"]
    Query --> Loop{Mỗi entity}
    Loop --> Upd[UPDATE status = FLOATING]
    Upd --> LabelChk{label_id IS NULL?}
    LabelChk -->|YES| Apply[Gắn autoLabelIds<br/>skip-if-exists]
    LabelChk -->|NO| Skip[Skip<br/>giữ nhãn business]
    Apply --> Hist[INSERT assignment_history<br/>reason = auto_recall]
    Skip --> Hist
    Hist --> Notify[Notify ALL users<br/>kho thả nổi có lead mới]
    Notify --> Loop
    Loop -->|done| End([End])
```

### H. AI Lead Distribution (weighted scoring)

```mermaid
flowchart TB
    Trigger([Manager click Distribute<br/>hoặc Zoom auto-distribute]) --> Cfg[Load AIDistributionConfig<br/>per department<br/>weightConfig JSONB]
    Cfg --> Pool[Get leads pool<br/>status=POOL, dept=X]
    Pool --> Users[Get eligible users<br/>cùng dept, active]
    Users --> Score{Mỗi user tính score}

    Score --> W[workloadScore<br/>= 1 - currentLeads/maxLeads]
    Score --> L[levelScore<br/>= rank / MAX_RANK]
    Score --> P[performanceScore<br/>= 0.6 conversion_30d<br/>+ 0.4 revenue_rank]

    W --> Final["final = W * 0.30 + L * 0.30 + P * 0.40"]
    L --> Final
    P --> Final

    Final --> Sort[Sort users theo score DESC]
    Sort --> Assign[Assign leads round-robin<br/>theo thứ tự score]
    Assign --> Hist[INSERT assignment_history<br/>reason = ai_distribute]
    Hist --> Notify[Notify users + create activity]
    Notify --> End([Done])
```

---

## Roles tóm tắt

> Chi tiết xem `CLAUDE.md` → "Role Permissions" và `docs/project-overview-pdr.md` → "Permission Matrix"

| Role | Scope |
|------|-------|
| **SUPER_ADMIN** | Full access. Verify payment, system config, API keys, recall config |
| **MANAGER** | **Thấy TẤT CẢ data toàn hệ thống** (không scope theo dept). Tạo/assign/distribute leads, tạo order/payment. KHÔNG verify payment. KHÔNG config hệ thống |
| **USER (Sale)** | Chỉ data assigned/created bởi mình. Claim từ pool, tạo order/payment self-service |

**Lưu ý:** MANAGER **không** bị scope theo phòng ban - đây là CRM nội bộ với 1-2 manager thực, được thiết kế gần như SUPER_ADMIN trừ system config.

---

## Cấu trúc Monorepo

```
crm-custom/
├── apps/
│   ├── api/                    NestJS 11 - port 3010, prefix /api/v1
│   │   └── src/modules/        51 modules
│   └── web/                    Next.js 16 App Router - port 3011
├── packages/
│   ├── database/               Prisma 6 schema + migrations + seed
│   ├── types/                  Shared DTO, interfaces, enums
│   └── utils/                  Phone normalize, CSV sanitize, formatters
├── docker-compose.yml          PostgreSQL 16 + Redis 7
├── docker-compose.prod.yml     Production variant
├── nginx/                      Reverse proxy config
├── ecosystem.config.cjs        PM2
├── uploads/                    File upload dest (local FS)
└── docs/                       Technical documentation
```

---

## Quick Start

```bash
# 1. Cài dependency
pnpm install

# 2. Start PostgreSQL + Redis qua Docker
docker compose up -d

# 3. Cấu hình env
cp .env.example .env
# Sửa DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, ...

# 4. Setup database
pnpm db:generate            # Generate Prisma client
pnpm db:push                # Push schema vào DB
pnpm db:seed                # Seed dev data

# 5. Run dev (cả API + Web)
pnpm dev
```

- API: <http://localhost:3010/api/v1>
- Web: <http://localhost:3011>
- Health: <http://localhost:3010/api/v1/health>

---

## Commands

```bash
# Development
pnpm dev                    # Start API + Web song song (Turborepo)
pnpm build                  # Build toàn workspace
pnpm lint                   # Lint cross-workspace

# Database (Prisma)
pnpm db:generate            # Generate client
pnpm db:push                # Push schema (no migrate dev - dự án dùng db push)
pnpm db:migrate dev         # Tạo migration (chỉ khi cần)
pnpm db:seed                # Seed dev data
pnpm db:studio              # Open Prisma Studio

# Docker
docker compose up -d        # Start PG + Redis
docker compose down         # Stop services
```

**Lưu ý Windows:** Stop dev server trước khi `db:generate` (DLL lock).

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://crm:crm@localhost:5434/crm_v4

# Auth
JWT_SECRET=<random-32-chars>
JWT_REFRESH_SECRET=<random-32-chars>

# Files
UPLOAD_DIR=./uploads

# Ports
API_PORT=3010
NEXT_PUBLIC_API_URL=http://localhost:3010/api/v1
FRONTEND_URL=http://localhost:3011

# Queue
REDIS_URL=redis://localhost:6380

# AI (optional)
GEMINI_API_KEY=<your-key>

# OmiCall (optional)
OMICALL_DOMAIN=<your-domain>
OMICALL_TENANT=<your-tenant>
```

---

## Security Posture

OWASP Top 10 aligned, đã qua 3 vòng audit (2026-04-13 + 2026-04-16):

- **A01 Access Control:** `buildAccessFilter` mọi repo query + IDOR test suite
- **A02 Crypto:** bcrypt cost 12, refresh token SHA-256 hashed, JWT jose
- **A03 Injection:** Prisma tagged templates, class-validator/Zod DTO, CSV export sanitize
- **A05 Misconfig:** Helmet HSTS 1y+preload, CORS require `FRONTEND_URL` in prod
- **A06 Components:** `pnpm overrides` patch lodash/defu/file-type/nestjs CVE
- **A07 Auth:** Account lockout, generic error (no user enum), rate limit auth 5/min
- **A09 Logging:** Pino sensitive redaction (`authorization`, `password`)
- **A10 SSRF:** File upload UUID + MIME + 10MB cap

**Rate limit:** Auth 5/min/IP, API 100/min/user, 3rd-party 100/min/key.
**Cookies:** httpOnly + Secure + SameSite=Lax, Next.js BFF proxy pattern.

---

## Design System

- Sky Blue `#0ea5e9` + Cyan `#06b6d4` + White + Gray
- Glass effect (subtle backdrop-filter blur), colored shadows, gradient text, hover-lift cards
- Plus Jakarta Sans
- Responsive: Mobile card view → Tablet scroll → Desktop full table
- Touch target min 44×44px, WCAG 2.1 AA
- Format: DD/MM/YYYY | 1.000.000 | VND (no decimals)
- Timezone: Asia/Ho_Chi_Minh (pin trong `formatDate`/`formatDateTime`)
- **Character rule:** Chỉ dùng `-` (ASCII hyphen). Không em dash `—`, không en dash `–`.

---

## Documentation

| File | Mô tả |
|------|-------|
| [`CLAUDE.md`](./CLAUDE.md) | Project rules, role permissions, business logic |
| [`docs/project-overview-pdr.md`](./docs/project-overview-pdr.md) | Đặc tả hệ thống - Product Development Requirements |
| [`docs/use-cases.md`](./docs/use-cases.md) | Mô tả use-case theo actor + luồng nghiệp vụ |
| [`docs/deployment-guide.md`](./docs/deployment-guide.md) | Tài liệu triển khai (Docker + PM2 + Nginx) |
| [`docs/codebase-summary.md`](./docs/codebase-summary.md) | Scale snapshot, modules, routes, tables |
| [`docs/system-architecture.md`](./docs/system-architecture.md) | High-level diagram + data flow |
| [`docs/data-model.md`](./docs/data-model.md) | 31 tables chi tiết |
| [`docs/api-reference.md`](./docs/api-reference.md) | Endpoint inventory |
| [`docs/api-integration-guide.md`](./docs/api-integration-guide.md) | 3rd-party integration |
| [`docs/business-flows.md`](./docs/business-flows.md) | Sequence diagrams nghiệp vụ |
| [`docs/frontend-guide.md`](./docs/frontend-guide.md) | Routes + components + patterns |
| [`docs/code-standards.md`](./docs/code-standards.md) | Coding conventions + security checklist |
| [`docs/design-guidelines.md`](./docs/design-guidelines.md) | Design system chi tiết |

---

## License

Internal use only - CRM-Custom.
