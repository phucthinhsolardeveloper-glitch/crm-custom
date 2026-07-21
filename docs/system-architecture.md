# System Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                               │
│  Browser (Next.js)  │  Mobile  │  3rd Party  │  AI Agents (MCP)  │
└─────────┬───────────┴────────┬─────────┴────────┬───────────┘
          │                    │                   │
          ▼                    ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                     NGINX (Reverse Proxy)                    │
│              SSL termination, load balancing                 │
├────────────────────────┬────────────────────────────────────┤
│  / → Next.js :3000     │  /api → NestJS :3001              │
└────────────┬───────────┴──────────────┬─────────────────────┘
             │                          │
             ▼                          ▼
┌────────────────────┐    ┌──────────────────────────────────┐
│  Next.js 16        │    │  NestJS 11                        │
│  (Frontend)        │    │  (API Server)                     │
│                    │    │                                    │
│  Server Components │    │  Controller → Service → Repo      │
│  Client Components │    │  Guards, Interceptors, Filters    │
│  API Route (auth   │───→│  JWT Auth, RBAC                   │
│   cookie proxy)    │    │  BullMQ Workers                   │
│                    │    │  Cron Jobs (reminder, recall,      │
│  shadcn/ui         │    │             cleanup, batch match) │
│  Tailwind 4        │    │                                    │
└────────────────────┘    └──────┬──────────────┬─────────────┘
                                 │              │
                    ┌────────────┘              └──────────┐
                    ▼                                      ▼
          ┌──────────────────┐                   ┌──────────────┐
          │  PostgreSQL 16   │                   │  Redis 7     │
          │                  │                   │              │
          │  Prisma ORM      │                   │  BullMQ jobs │
          │  31 tables       │                   │  AOF persist │
          │  43+ indexes     │                   └──────────────┘
          │  FTS (GIN)       │
          │  Soft delete     │
          └──────────────────┘
```

## Data Flow

### Authentication

```
Browser → POST /api/auth/login (Next.js API Route)
  → Proxy to NestJS POST /auth/login
  → NestJS validates credentials, returns JWT + refresh token
  → Next.js API Route sets httpOnly cookies
  → Browser receives cookies (no JS access)

Subsequent requests:
  Browser → Next.js Server Component → reads cookie → adds Authorization header
  → NestJS validates JWT → returns data

Token refresh:
  NestJS returns 401 → API client auto-calls /auth/refresh
  → New tokens → retry original request
```

### Lead Lifecycle

```
Input (CSV/Manual/API) → Kho Mới (POOL, dept=null)
  → Manager phân phối → Kho Phòng Ban (POOL, dept=X)
  → Sale claim/assign → Kho Cá Nhân (ASSIGNED)
  → Sale tạo note/gọi → IN_PROGRESS (auto)
  → Chốt deal → Order + Payment → CONVERTED → Customer
  → Transfer → Kho Phòng Ban đích hoặc Kho Thả Nổi
  → LOST → FLOATING (kho thả nổi)
  → Auto-recall (dept pool quá X ngày) → FLOATING
```

### Payment Verification

```
Sale tạo payment (PENDING)
  ↕ Auto-match
Webhook bank transaction (UNMATCHED)
  → Match: amount + content khớp → VERIFIED (auto)
  → Miss: cron 2h fuzzy match retry
  → Still miss: SUPER_ADMIN verify / reject / refund / cancel thủ công
  → Order auto-COMPLETED khi SUM(VERIFIED+REJECTED) >= order.totalAmount
  → Lead auto-CONVERTED theo order COMPLETED

Payment 5 status: PENDING → VERIFIED / REJECTED (phạt) / CANCELLED (tạo nhầm) / or REFUNDED (trả khách)
Order 2 status: PENDING → COMPLETED (auto-trigger)
Revenue tổng (công ty) = SUM(VERIFIED+REJECTED). Revenue sale (KPI) = SUM(VERIFIED).
```

## Module Dependency Graph

```
AppModule
├── AuthModule (JWT, Passport, guards)
├── UsersModule
├── DepartmentsModule
├── EmployeeLevelsModule
├── TeamsModule
├── CustomersModule ← LabelsModule
├── LeadsModule ← LabelsModule, CustomersModule
├── LeadSourcesModule
├── ProductsModule ← ProductCategoriesModule
├── OrdersModule ← LeadsModule, CustomersModule, ProductsModule
├── PaymentsModule ← OrdersModule, LeadsModule (conversion trigger)
│   └── PaymentMatchingService (shared)
├── BankTransactionsModule ← PaymentMatchingService
├── PaymentTypesModule
├── ActivitiesModule (exported, injected by leads/payments)
├── CallLogsModule ← ActivitiesModule
├── FileUploadModule
├── ImportModule (BullMQ) ← LeadsModule, CustomersModule
├── ExportModule ← LeadsModule, CustomersModule, OrdersModule
├── ThirdPartyApiModule ← LeadsModule
├── DistributionModule ← LeadsModule (AI scoring)
├── TransfersModule ← CustomersModule, LeadsModule
├── SearchModule ← LeadsModule, CustomersModule, OrdersModule
├── NotificationsModule (exported, injected by many)
├── TasksModule ← NotificationsModule
├── AnalyticsModule
├── McpAgentModule (MCP server + REST /ai-agent/ - read-only, API key auth)
│   ├── McpAgentController (POST /mcp - Streamable HTTP transport)
│   ├── AiAgentRestController (GET /ai-agent/* - REST fallback)
│   ├── McpAgentQueryService (shared Prisma queries)
│   └── Tools: schema, leads, customers, orders, products, stats, users
└── HealthModule
```

## Cron Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Refresh token cleanup | Daily 3 AM | Delete expired/revoked tokens >30 days |
| Payment batch match | Every 2h | Fuzzy match PENDING payments ↔ UNMATCHED bank TX |
| Auto-recall | Daily 1 AM | Dept pool leads/customers >X days → FLOATING + labels |
| Task reminder | Every 5 min | Query `TaskReminder` table, send TASK_REMIND notification when `remindAt <= now AND remindedAt IS NULL`. Max 5 reminders/task, cascade delete with task. |
| Task escalation | Every 30 min | Overdue 1h → notify user, 24h → notify manager |
| Notification cleanup | Daily 4 AM | Delete read >90 days, all >180 days |

## Database Schema Overview

### Entity Counts

- **Auth:** User, RefreshToken, ApiKey (3)
- **Organization:** Department, Team, ManagerDepartment, EmployeeLevel (4)
- **CRM Core:** Customer, Lead, LeadSource, Label, CustomerLabel (5; Lead has single-label FK `label_id`, no junction)
- **Commerce:** Product, ProductCategory, Order, Payment, PaymentType, BankTransaction (6)
- **Activity:** Activity, ActivityAttachment, Document, CallLog, AssignmentHistory (5)
- **Distribution:** AiDistributionConfig, AssignmentTemplate, AssignmentTemplateMember, RecallConfig (4)
- **System:** ImportJob, Notification, Task, TaskReminder (4)
- **Total: 31 tables** (lead_labels dropped 2026-05-06)

### Enums (10)

UserRole, UserStatus, LeadStatus, CustomerStatus, OrderStatus, PaymentStatus,
CallType, MatchStatus, EntityType, ActivityType, TaskStatus, TaskPriority,
ImportStatus, VerifiedSource

## Infrastructure

### Development

```
Docker Compose: PostgreSQL 16 + Redis 7
Turborepo: parallel build, dev, lint
Hot reload: NestJS (webpack HMR) + Next.js (Fast Refresh)
```

### Production

```
nginx -> NestJS (2 replicas) + Next.js (standalone)
PostgreSQL 16 (persistent volume)
Redis 7 (AOF persistence)
uploads/ (volume mount, local filesystem)
pg_dump cron (7 daily + 4 weekly backups)
GitHub Actions CI/CD
UptimeRobot monitoring
```

## Workflow Engine (added 2026-06-02)

n8n-style automation engine cho SUPER_ADMIN tao workflow visual chay server-side via BullMQ.

### Component pipeline

```
[Prisma $extends] -> [RawEventBus] -> [DomainEventBridge] -> [EventEmitter2 semantic events]
                                                                   |
                                              [WorkflowDispatcher @OnEvent('*.*')]
                                                                   |
                                                  [BullMQ workflow-triggers queue]
                                                                   |
                                              [TriggerEvalProcessor: filter + create WorkflowRun]
                                                                   |
                                                  [BullMQ workflow-runs queue]
                                                                   |
                                              [WorkflowRunnerProcessor: step loop + state machine]
                                                                   |
                                          [ActionHandlerRegistry: 6 handlers]
```

### Persistence

- `workflows` - definition (nodes/edges JSONB), version int, isActive, systemOwned, webhookToken
- `workflow_runs` - snapshot per run (immutable to edits), status, cursor, idempotencyKey, denormalized leadId/customerId/orderId, bullJobId, lastHeartbeat
- `workflow_run_steps` - per node attempt (input/output/error JSONB, attemptCount)

### Triggers (5 kinds)

1. **event** - JsonLogic filter applied to RawMutationEvent payload (lead.label_changed, etc.)
2. **schedule** - BullMQ Job Scheduler cron + optional one-shot delayed runAt
3. **manual** - test-run UI button
4. **webhook** - inbound POST /webhooks/workflow/:token (HMAC or apikey auth modes - phase 03 webhook trigger UI scope)

### Actions (6 handlers)

1. **update_lead** - dispatch by mode (set_status, set_label, move_to_floating, assign)
2. **update_customer** - status, add_label, remove_label, move_to_floating
3. **create_task** - reuse TasksService
4. **create_notification** - reuse NotificationsService
5. **create_activity** - timeline note via ActivitiesService
6. **http_webhook** - outbound HTTPS POST with HMAC-SHA256 + SSRF guard (private IP block, DNS check, allowlist env)

### Reliability

- **Snapshot per run**: workflow.nodes edited mid-flight does NOT affect running runs. Snapshot frozen at trigger time.
- **Idempotency**: 1-minute dedup window via WorkflowRun.idempotencyKey unique constraint.
- **Stalled recovery**: cron `*/10 * * * *` scan status=RUNNING + last_heartbeat < 5min ago, reset PENDING + re-enqueue.
- **Wait nodes**: BullMQ moveToDelayed + DelayedError, max 30 days, auto resume.
- **Cancel**: status=CANCELLED + BullMQ job remove, defensive race check each iteration.
- **Retry policy**: per-action 3 attempts exponential backoff [1s, 5s, 30s]. ZodError = permanent, 4xx HTTP = permanent, 5xx + network = retriable.
- **Max steps per run**: 500 safety cap.

### Permission

- All workflow endpoints `@Roles(SUPER_ADMIN)`.
- SYSTEM_ACTOR (id=0n, role=SUPER_ADMIN) executes actions, bypasses access filter.
- CLS `mode=bulk` flag suppresses event emit (CSV import path).

### Migration path

System-owned workflows (systemOwned=true) seeded in `packages/database/prisma/seed.ts` to gradually replace `RecallConfigCron` + `LabelRecallConfigCron`. UI hides delete button. Old crons kept active until manual deactivation.

See plan: `plans/260601-1638-workflow-engine-builder/plan.md`.

## Lark Base Payment Sync (added 2026-06-10)

Day moi payment moi tao sang Lark Bitable (1 payment = 1 dong) theo cau hinh config-driven.

### Pipeline

```
PaymentsService.create (sau khi payment ghi DB)
  -> LarkSyncService.enqueuePaymentSync (best-effort, khong chan tao payment)
  -> BullMQ queue `lark-sync` (jobId=pay-{id}, retry 5 exponential 1s)
  -> LarkSyncProcessor (concurrency 1, tranh rate-limit Bitable)
       guard skip: disabled env / da sync (larkSyncedAt) / thieu product-category /
                   khong co LarkSyncMapping enabled
  -> LarkMappingEngine.buildContext (load quan he + agg sequence/paidTotal)
  -> applyMapping(fieldMap config DB) -> fields { "Cot Lark": value }
  -> LarkBaseClient.createRecord(baseToken, tableId, fields)
  -> update Payment { larkSyncedAt, larkRecordId }  (idempotent)
```

### Config-driven (khong sua code khi them base/bang)

- **CODE co dinh:** `CRM_FIELD_CATALOG` (`lark-field-catalog.ts`) - danh sach field CRM
  xuat duoc, moi key co resolver + type (string/number/date -> epoch ms).
- **DB config:** bang `lark_sync_mappings` (1 danh muc SP = 1 mapping unique):
  categoryId, baseToken (null = env default), tableId, fieldMap JSONB
  `{ "Cot Lark": "catalogKey" }`, enabled.
- UI: `/settings/lark-sync` (SUPER_ADMIN) - list + form + field-map editor + nut
  "Tai mau" do preset 5 kenh (`lark-sync.presets.ts`).

### Auth (multi-base)

- `tenant_access_token` (TTL 2h) doi tu LARK_APP_ID + LARK_APP_SECRET, cache Redis
  TTL = expire - 300s. 1 token ghi duoc moi base cung tenant (app la collaborator).
- Env: `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_BASE_TOKEN` (base mac dinh).
  Thieu app id/secret -> module tu disable (enqueue van chay, processor skip).

### Gioi han (quyet dinh 2026-06-10)

- Chi sync khi TAO payment moi. Sua don/payment, verify, reject -> KHONG re-sync.
- Cot cong thuc/lookup ben Lark (THUE VAT, Thang...) khong map - Lark tu tinh.
- Cot User/Select ben Lark phai doi sang Text (CRM gui chuoi).
- Sequence/paidTotal ("SO LAN TT", "TINH TRANG TT") loai payment REJECTED -
  nhat quan voi validate tong tien trong PaymentsService.create.
- Job fail het 5 attempts -> payment khong sang Lark, chua co cron backfill
  (quet `larkSyncedAt IS NULL` lam sau neu can). Map key `maPayment` vao 1 cot
  Lark de doi soat/phat hien trung khi worker crash giua create va luu synced.
