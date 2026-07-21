# CLAUDE.md - CRM-Custom Project

## Project Overview

Internal CRM system (CRM-Custom) for sales team efficiency, customer data management, lead pipeline, and performance evaluation. Supports 50-200 users across multiple departments.

- **Stack:** NestJS 11 + Next.js 16 + PostgreSQL 16 + Prisma 6 + Turborepo + pnpm
- **Architecture:** Next.js = pure frontend, NestJS = sole API server, REST only
- **UI:** shadcn/ui + Tailwind 4 + Plus Jakarta Sans, Vietnamese language only
- **Design:** Sky Blue #0ea5e9 + Cyan #06b6d4, colored shadows, gradient text, hover-lift cards
- **Auth:** JWT + refresh token rotation, httpOnly cookies
- **Deploy:** VPS + Docker Compose

## Architecture Rules

1. **Next.js = pure frontend.** No direct Prisma access. All data via NestJS API.
2. **NestJS = single source of business logic.** Controller -> Service -> Repository -> Prisma.
3. **Shared packages:** `@crm/types` (DTOs, interfaces), `@crm/database` (Prisma), `@crm/utils` (validators, formatters)
4. **Primary keys:** BIGINT with IDENTITY. Serialized as string in API responses.
5. **Soft delete:** All CRM entities. Partial indexes on `deletedAt IS NULL`.
6. **Enums:** Prisma native enums for stable values (status). Lookup tables for dynamic values (sources, labels, payment types).
7. **Pagination:** Cursor-based for all list endpoints.
8. **Search:** PostgreSQL full-text search (GIN index). No Elasticsearch.
9. **File storage:** Local filesystem (`uploads/` directory). No MinIO/S3.
10. **Background jobs:** BullMQ + Redis for CSV import processing.

## Monorepo Structure

```
crm-custom/
├── apps/
│   ├── api/                    # NestJS 11 (port 3010, prefix /api/v1)
│   └── web/                    # Next.js 16 (port 3011)
├── packages/
│   ├── database/               # Prisma schema + migrations + seed
│   ├── types/                  # Shared DTOs, interfaces, enums
│   └── utils/                  # Phone normalization, CSV sanitizer, formatters
├── docker-compose.yml          # PostgreSQL 16 + Redis 7
├── turbo.json
└── pnpm-workspace.yaml
```

## Role Permissions (CRITICAL - READ BEFORE ANY AUTH/ACCESS CODE)

**Đây là app nội bộ với 1-2 manager thực sự. MANAGER được thiết kế gần như SUPER_ADMIN, KHÔNG bị scope theo phòng ban. Đừng giả định theo nghĩa tiếng Việt thông thường của từ "manager".**

### Source of truth
File: `apps/api/src/common/filters/build-access-filter.ts:26`
```ts
if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.MANAGER) {
  return {};  // không filter - thấy TẤT CẢ data toàn hệ thống
}
// LEADER -> self-scope như USER (chỉ data assigned/created bởi mình). KHÔNG còn team-scope.
```

**4 role: SUPER_ADMIN > MANAGER > LEADER > USER. LEADER gần như USER:** chỉ thấy data assigned/created bởi chính mình cho leads/customers/tasks. Tự phục vụ như USER (claim/tạo lead, tạo order/payment), nhưng KHÔNG điều phối lead, KHÔNG verify payment, KHÔNG quản trị user/config. (Quyết định 2026-06-19: bỏ team-scope của LEADER - trước đây LEADER thấy data toàn team, gây lộ data ngoài phạm vi cá nhân.)

**[QĐ 2026-07-01] NGOẠI LỆ đơn hàng - LEADER xem đơn cả team:** LEADER có `teamId` thấy DANH SÁCH đơn hàng của tất cả thành viên cùng team (`buildAccessFilter` trả `{ creator: { teamId } }` cho entity `order`). Chỉ áp cho ORDERS - lead/customer/task vẫn self-scope như trên. An toàn (thuần đọc) vì mọi endpoint sửa/xóa order đã khóa MANAGER+ (`orders.controller.ts`), LEADER không có cửa ghi. LEADER không team -> self-scope order (`createdBy = mình`) như USER.

**[QĐ 2026-06-22] ĐỌC chi tiết (`GET /leads/:id`, `GET /customers/:id`) = open-trust:** mọi role (kể cả USER/LEADER) mở được chi tiết MỌI lead/customer - kể cả lead kho/thả nổi hay của NV khác (vì USER thấy lead kho trong list để nhận, chặn detail gây 404). Cách làm: 2 endpoint detail gọi `findById(id)` KHÔNG kèm user. **GHI/mutation vẫn scope chặt** qua `findById(id, user, 'write')` - USER/LEADER không sửa/xóa data người khác. Chỉ `buildAccessFilter` scope phần LIST/search + write, KHÔNG scope read-by-id.

### Permission Matrix

| Domain | SUPER_ADMIN | MANAGER | LEADER | USER |
|--------|:---:|:---:|:---:|:---:|
| Xem DANH SÁCH / search leads / customers / tasks | ALL | **ALL (không scope theo dept)** | Chỉ data của mình + kho (như USER) | Chỉ data của mình + kho |
| Xem DANH SÁCH / search ĐƠN HÀNG (orders) | ALL | **ALL** | **Đơn của cả team** (nếu có teamId; không team -> chỉ của mình) | Chỉ đơn mình tạo |
| Xem CHI TIẾT 1 lead/customer theo id (`GET /:id`) | ALL | ALL | **MỌI lead/customer (read open-trust)** | **MỌI lead/customer (read open-trust)** |
| View dashboard / KPI tổng quan | ALL | ALL | Self (endpoint không `@Roles` tự self-scope qua buildAccessFilter) | Self |
| Xem member + KPI của team | OK | OK | OK (`GET /users/my-team`, ép theo team mình) | Không |
| Create / assign / distribute / transfer leads | OK | OK | Chỉ claim + transfer lead mình giữ (như USER) | Chỉ claim từ pool |
| Tạo order / tạo payment | OK | OK | OK (self-service) | OK (self-service) |
| Verify / reject payments, match bank transactions | OK | **Không** | Không | Không |
| CRUD products, labels, lead-sources, call-logs, recall-config | OK | OK | View only | View only |
| Distribution config + run AI distribute | OK | OK (chạy), config SUPER_ADMIN | Không | Không |
| Assignment templates | OK | OK | Không | Không |
| Quản lý user role USER / LEADER (tạo / sửa / deactivate) | OK | OK (chỉ trên USER+LEADER, không set role lên MANAGER+) | Không | Không |
| Quản lý user role MANAGER / SUPER_ADMIN | OK | Không | Không | Không |
| Quản lý department | OK | Không | Không | Không |
| Quản lý team (CRUD) | OK | OK | Không | Không |
| Payment types, installments, order-formats, product-groups | OK | Không | Không | Không |
| API keys, cron-run, system-settings, audit-log full | OK | Không | Không | Không |

### Quy tắc khi code feature mới (NON-NEGOTIABLE)

1. **Data scoping luôn qua `buildAccessFilter(user, entity, mode)`** - tự xử đúng cho cả 4 role. KHÔNG tự viết filter `where: { departmentId: user.departmentId }` cho MANAGER. SAI. LEADER + USER đều self-scope (`assignedUserId`/`createdBy` = chính mình); SUPER_ADMIN + MANAGER thấy tất cả.
   - **`mode` ('read' | 'write'):** giữ lại param cho tương thích call-site nhưng hiện KHÔNG phân biệt hành vi - LEADER self-scope ở cả 2 mode (đọc lẫn ghi đều chỉ data của chính mình). KHÔNG còn rủi ro "quên `write` -> LEADER sửa data team khác" vì đọc cũng đã self-scope.
   - **LEADER = USER hoàn toàn cho data view + write:** các thao tác open-trust (đổi status lead, convert, ghi note, tạo order - dùng `findById(id)` KHÔNG kèm user) vẫn mở như USER (theo quyết định open-trust 2026-06-12).
2. **Endpoint guard mặc định:**
   - Thao tác business hằng ngày (CRUD lead/customer/order, verify payment, assign, distribute, view dashboard cross-dept) -> `@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)` (cho cả USER nếu là self-service).
   - LEADER tự self-scope (như USER) qua `buildAccessFilter` ở các endpoint list KHÔNG có `@Roles`. KHÔNG thêm LEADER vào `@Roles` của endpoint điều phối/verify/admin (LEADER bị loại mặc định). Endpoint dashboard tổng hợp toàn hệ thống (top-performers, employee-scores, team/dept-performance...) giữ `@Roles(MANAGER, SUPER_ADMIN)` - KHÔNG mở LEADER.
   - User CRUD: `@Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)` + service layer phải gọi `assertActorCanTouchUser(actor, { targetRole, desiredRole })`. MANAGER được thao tác/gán role trong {USER, LEADER}; vẫn bị chặn chạm user MANAGER+ hoặc set role lên MANAGER+.
   - Cấu hình hệ thống (department, payment-type, api-key, cron-run, order-format, payment-installment) -> `@Roles(UserRole.SUPER_ADMIN)` only.
   - Team CRUD -> `@Roles(UserRole.SUPER_ADMIN, UserRole.MANAGER)` (MANAGER được phép quản lý team như business op, không phải system config).
3. **UI nguyên tắc:** MANAGER nên thấy gần như mọi admin UI **trừ** menu System Config (Departments, API Keys, Cron, System Settings). Menu Users hiển thị cho MANAGER nhưng filter ở row level (chỉ thao tác USER). Menu Teams hiển thị cho cả MANAGER và SUPER_ADMIN. Không hide nút "xem cross-dept" với MANAGER.
4. **Khi review/test:** nếu thấy filter `departmentId` áp dụng cho MANAGER -> đó là BUG. Báo ngay.

### Anti-pattern thường gặp (FORBIDDEN)
- `if (user.role === MANAGER) where.departmentId = user.departmentId` - SAI, MANAGER thấy toàn bộ.
- Tạo endpoint mới `@Roles(MANAGER)` rồi filter thủ công theo dept - dùng `buildAccessFilter` thay vì viết lại logic.
- Coi MANAGER như "department head" trong copy/UI/error message - sai lệch model thực tế.

## Code Standards

### Backend (NestJS)
- Module pattern: `module.ts`, `controller.ts`, `service.ts`, `repository.ts`, `dto/`
- Global prefix: `/api/v1`
- Guards: JWT (global), Roles, Ownership
- Interceptors: BigInt serialization, logging
- Filters: HTTP exception standardization
- Pipes: ParseBigInt for route params
- Validation: class-validator or Zod in DTOs
- Logging: Pino with sensitive field redaction
- **IDOR prevention:** ALL repository queries MUST use `buildAccessFilter(user)` pattern

### Frontend (Next.js)
- Server Components by default, Client Components only when needed
- No barrel imports for shadcn/ui - import each component from its own file
- Lazy load heavy components (charts, kanban) with `next/dynamic`
- URL-based filter state (shareable views)
- React Hook Form + Zod for form validation
- API calls via `lib/api-client.ts` (handles token refresh)
- Date format: DD/MM/YYYY | Number format: 1.000.000 | Currency: VND (no decimals)
- All UI text in Vietnamese

### Database
- Snake_case for table names (`@@map`) and column names (`@map`)
- BIGINT IDENTITY for all PKs
- `deleted_at` nullable timestamp on all CRM entities
- JSONB for truly dynamic metadata only
- Partial indexes on `deleted_at IS NULL` for all soft-delete tables
- GIN indexes for full-text search and JSONB columns
- Raw SQL via tagged template literals only (prevent SQL injection)

### Security Checklist
- bcrypt cost 12 for passwords
- JWT secrets in env vars only
- Refresh tokens hashed (SHA-256) before DB storage
- Rate limiting: auth 5/min, API 100/min, 3rd party 100/min per key
- No user enumeration (generic error messages)
- API keys hashed in DB, shown ONCE on creation
- CSV export sanitization (formula injection prevention)
- File uploads: UUID filenames, MIME validation, 10MB max
- httpOnly + Secure + SameSite cookies for JWT

## Business Logic - Key Decisions

### 3 Kho Lead
- **Kho Mới:** `status=POOL, dept=null` → manager+ thấy, phân phối vào dept
- **Kho Phòng Ban:** `status=POOL, dept=X, user=null` → NV dept X thấy + claim
- **Kho Thả Nổi:** `status=FLOATING` → ALL users thấy + claim về kho cá nhân

### Lead Status Flow
```
POOL → ASSIGNED → IN_PROGRESS → CONVERTED | LOST → FLOATING
                                    ↓
                               Customer created
```
- IN_PROGRESS: auto-trigger khi sale tạo note/gọi điện/tạo order đầu tiên
- LOST → FLOATING (kho thả nổi, ai cũng claim)
- Transfer: DEPARTMENT / FLOATING / UNASSIGN

### Customer Status
- ACTIVE: đang chăm sóc
- INACTIVE: hoàn tất, ẩn khỏi kho (vẫn search SĐT + API được)
- FLOATING: kho thả nổi

### Payment Hybrid Verification (Redesign 2026-06-20)
- **Order:** 2 status - PENDING, COMPLETED (auto-trigger khi SUM(VERIFIED+REJECTED) >= totalAmount)
- **Payment:** 4 status đang dùng - PENDING, VERIFIED, REJECTED (sale nhập sai-phạt), REFUNDED (trả khách). CANCELLED giữ trong enum cho dữ liệu cũ; không còn được tạo mới (huỷ PENDING giờ xoá thẳng bản ghi).
- **Payment flow:** Sale tạo PENDING → auto-match bank webhook (VERIFIED) / Cron 2h fuzzy match / SUPER_ADMIN verify thủ công
- **SUPER_ADMIN actions:** POST `/verify` (PENDING→VERIFIED), POST `/reject {reason}` (→REJECTED), POST `/refund {reason}` (VERIFIED→REFUNDED), POST `/cancel` (SUPER_ADMIN hoặc sale owner: XOÁ THẲNG payment khi còn PENDING - không set CANCELLED nữa)
- **2 Revenue Formula (TÁCH BIỆT):**
  - **Doanh thu TỔNG (công ty):** SUM(amount) WHERE status IN (VERIFIED, REJECTED) = tiền khách thanh toán (cả REJECTED vì sale nhập sai nhưng khách vẫn CK)
  - **Doanh số SALE (KPI):** SUM(amount) WHERE status = VERIFIED = tiền được hưởng KPI/commission (REJECTED phạt, REFUNDED/CANCELLED không tính)
- **Partial payments:** CK lần 1/2/3/4/full. Order COMPLETED khi SUM(VERIFIED+REJECTED) >= totalAmount (không từng lần)

### Assignment Templates
- Chọn danh sách người cụ thể. Round-robin vòng lặp (7 leads / 3 người → 2+2+1+1+1)
- Chỉ apply lên POOL/FLOATING leads. Skip leads khác status

### Auto-Recall
- Lead/customer ở dept pool quá X ngày → FLOATING + gắn nhãn mặc định
- Super admin config ngày + nhãn (1 nhãn auto)
- **Skip-if-exists:** cron không đè nhãn business của lead - chỉ gắn auto-label nếu `lead.label_id IS NULL`

### Lead vs Customer Label (BREAKING 2026-05-06)
- **Lead = 1 nhãn** (`leads.label_id` FK nullable, `leads.label_assigned_at` track recall timer)
- **Customer = N nhãn** (junction `customer_labels`)
- CSV import multi-label cho lead → chỉ áp dụng nhãn đầu, log warning

### Nguồn lead 2 cấp: Nguồn -> Nhóm (2026-06-20)
- **Nguồn (`lead_sources`)** = cấp cha. Giữ cờ `skip_pool` (skip Kho Mới -> auto-distribute). CRUD: **SUPER_ADMIN only**.
- **Nhóm (`lead_groups`)** = cấp con, FK `source_id` trỏ Nguồn cha. CRUD: **MANAGER+**.
- Lead lưu **cả** `source_id` (Nguồn cha) **và** `group_id` (Nhóm, nullable). Chọn nhóm -> `source_id` tự suy ra từ Nguồn cha của nhóm. `skip_pool` luôn đọc ở cấp Nguồn cha.
- Analytics JOIN `lead_sources` + `l.source_id` -> tổng hợp theo **Nguồn cha**.
- CSV import: cột "Nguồn" resolve thành **Nhóm** theo tên (giữ tương thích file cũ), dedup theo `group_id`.
- Endpoint: `/lead-sources` (cha), `/lead-groups?sourceId=` (con).

### Tasks/Todo
- Quick add bar (smart time parsing), quick time presets, from-note checkbox
- Reminder: gửi 1 lần (remindedAt flag). Escalation: quá hạn 1h → user, 24h → manager

### Other Rules
- Dedup: chỉ CSV import (SĐT+nhóm+sản phẩm). Manual/API → không dedup
- **Payment action (cancel/refund):** KHÔNG revert order COMPLETED / lead CONVERTED. `/refund` (VERIFIED→REFUNDED, SUPER_ADMIN). `/cancel` = XOÁ THẲNG payment PENDING (hard delete, audit log trên lead), người tạo đơn hoặc SUPER_ADMIN làm được.
- Transfer permission: user đang giữ + manager dept + super_admin
- User deactivate: leads về kho phòng ban (giữ dept), auto-recall nếu quá hạn

## Design System

See: `docs/design-guidelines.md`
- Color: Sky blue (#0ea5e9) + White + Gray. Glass effect (subtle backdrop-filter blur)
- Responsive: Mobile card view, tablet scroll, desktop full table
- Touch targets: min 44x44px. WCAG 2.1 AA

## Commands

```bash
# Development
pnpm dev                    # Start both apps (API + Web)
pnpm build                  # Build all apps and packages
pnpm lint                   # Lint across workspace

# Database
pnpm db:generate            # Generate Prisma client
pnpm db:push                # Push schema to DB
pnpm db:migrate dev         # Create migration
pnpm db:seed                # Seed dev data
pnpm db:studio              # Open Prisma Studio

# Docker
docker compose up -d        # Start PostgreSQL + Redis
docker compose down         # Stop services

# Testing
pnpm test                   # Run unit tests
pnpm test:e2e               # Run integration tests
```

## Environment Variables

```env
DATABASE_URL=postgresql://crm:crm@localhost:5433/crm_v4
JWT_SECRET=<random-32-chars>
JWT_REFRESH_SECRET=<random-32-chars>
UPLOAD_DIR=./uploads
API_PORT=3010
NEXT_PUBLIC_API_URL=http://localhost:3010/api/v1
FRONTEND_URL=http://localhost:3011
REDIS_URL=redis://localhost:6380
``` 