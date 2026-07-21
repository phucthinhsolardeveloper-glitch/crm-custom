# Codebase Summary

> Auto-updated document. Reflects current state of implementation.
> Last verified: 2026-04-17

## Status: Shipped & Hardened

23/23 phase đã đóng. Đang ở giai đoạn maintenance: security round 2 (2026-04-13) + dashboard v2 + soft-delete unique pattern (2026-04-17). Không còn phase mở trong roadmap.

## Scale Snapshot

| Metric | Value |
|--------|-------|
| Backend modules | **36** (NestJS) |
| Backend files (.ts) | 154 |
| Backend LOC | ~11.4K |
| Frontend routes | **31** pages |
| Frontend files (.ts/.tsx) | 145 |
| Frontend LOC | ~15.8K |
| DB tables | **31** (schema 841 dòng Prisma) |
| Enums | 14 |
| Total LOC | ~27.2K |

## Structure

```
crm-custom/
├── apps/
│   ├── api/                    NestJS 11 - :3010, prefix /api/v1
│   │   └── src/modules/        36 module (xem bảng dưới)
│   └── web/                    Next.js 16 App Router - :3011
│       └── src/
│           ├── app/
│           │   ├── (auth)/     /login
│           │   ├── (dashboard)/ 30 page có sidebar
│           │   └── api/proxy/* BFF proxy → NestJS (cookie → Bearer)
│           ├── components/     16 domain folder
│           ├── lib/            api-client.ts, auth.ts, utils.ts, zod schemas
│           ├── hooks/          use-form-action.ts
│           ├── providers/      auth-provider.tsx
│           └── middleware.ts   Auth redirect (Edge-side JWT exp check)
├── packages/
│   ├── database/               Prisma 6 (schema.prisma, migrations, raw-indexes.sql, seed)
│   ├── types/                  DTO + enums shared giữa BE/FE
│   └── utils/                  Phone normalize, CSV sanitize, formatters
├── docker-compose.yml          PostgreSQL 16 + Redis 7
├── docker-compose.prod.yml     Production variant
├── nginx/                      Reverse proxy config
├── ecosystem.config.cjs        PM2 (aaPanel deployment)
├── scripts/                    Deploy, backup, migration helpers
├── tests/                      E2E + API + unit
├── uploads/                    File upload dest (local FS)
├── docs/                       Documentation ✅
├── plans/                      Historical plans + reports
└── turbo.json, pnpm-workspace.yaml
```

## Backend Modules (36)

### Auth & User (5)
| Module | Controller prefix | Vai trò |
|--------|-------------------|---------|
| `auth` | `/auth` | Login, refresh, logout, /me |
| `users` | `/users` | CRUD user (role USER/LEADER/MANAGER/SUPER_ADMIN), self-profile update, `/users/my-team` (member + KPI team cho LEADER/MANAGER+) |
| `departments` | `/departments` | CRUD phòng ban |
| `teams` | `/teams` | CRUD team (với cascade detach members) |
| `employee-levels` | `/employee-levels` | Cấp bậc + maxLeads cap |

### CRM Core (5)
| Module | Controller prefix | Vai trò |
|--------|-------------------|---------|
| `leads` | `/leads` | Lead CRUD + claim/transfer/recall/convert + 3 kho (new, zoom, dept, floating) + `/leads/:id/phones[/:phoneId]` secondary phone CRUD (any role with lead access, auto-creates shadow customer) |
| `customers` | `/customers` | Customer CRUD + claim/transfer/reactivate + labels + AI analyze |
| `lead-sources` | `/lead-sources` | Lookup + skipPool flag |
| `labels` | `/labels` | Lookup nhãn + color + category |
| `activities` | `/leads|customers/:id/activities` | Timeline: note/call/status/assignment |

### Commerce (8)
| Module | Controller prefix | Vai trò |
|--------|-------------------|---------|
| `products` | `/products` | Product CRUD |
| `product-categories` | `/product-categories` | Lookup danh mục |
| `product-groups` | `/product-groups` | Lookup nhóm (Online/Tool/Offline) |
| `order-formats` | `/order-formats` | Lookup hình thức (Zoom Live, Replay...) |
| `orders` | `/orders` | Order CRUD + status transition |
| `payments` | `/payments` | Payment tạo/verify/reject + CSV import/export |
| `payment-types` | `/payment-types` | Lookup loại thanh toán |
| `payment-installments` | `/payment-installments` | Lookup CK lần 1/2/Full |

### Banking & Verification (3)
| Module | Controller prefix | Vai trò |
|--------|-------------------|---------|
| `bank-accounts` | `/bank-accounts` | Lookup tài khoản nhận |
| `bank-transactions` | `/bank-transactions`, `/webhooks/bank-transactions` | Webhook + list unmatched + manual match |
| `call-logs` | `/call-logs` | Ingest tổng đài + auto-match + AI summarize |

### Import/Export/Integration (4)
| Module | Controller prefix | Vai trò |
|--------|-------------------|---------|
| `import` | `/imports` | BullMQ-based CSV import leads/customers với state machine PENDING_REVIEW → REVIEWED → PROCESSING → COMPLETED (xem 2026-05-07 changelog). Dry-run validate riêng, user confirm qua POST /:id/start hoặc huỷ qua /:id/cancel. `ImportValidationService` shared logic dryRun + real insert. Xem `api-reference.md` §28 để biết CSV format |
| `export` | `/exports` | CSV leads/customers/orders với formula sanitization |
| `file-upload` | `/files` | Upload + stream file (JWT protected) |
| `third-party-api` | `/external` | Public (API key) - tạo lead từ website/FB |
| `lark-sync` | `/lark-sync` | Đẩy payment mới sang Lark Bitable theo mapping config-driven (SUPER_ADMIN quản lý mapping; BullMQ worker; env LARK_*). Thêm 2026-06-10 |

### Distribution & Assignment (4)
| Module | Controller prefix | Vai trò |
|--------|-------------------|---------|
| `distribution` | `/distribution` | AI distribution config + scores + run + `POST /distribution/distribute-zoom/:deptId` (zoom pool batch, manager-only) |
| `assignment-templates` | `/assignment-templates` | Round-robin template, apply lên POOL/FLOATING |
| `recall-config` | `/recall-configs` | Auto-recall ngày + nhãn mặc định |
| `search` | `/search` | Global search (FTS) |

### Productivity & System (7)
| Module | Controller prefix | Vai trò |
|--------|-------------------|---------|
| `tasks` | `/tasks` | Todo + reminder + escalation |
| `notifications` | `/notifications` | In-app polling + read tracking |
| `dashboard` | `/dashboard` | Analytics: DashboardService (stats/funnel/revenue/...) + DashboardBlocksService (6 endpoint MANAGER+ cho 5 khoi phan tich: source-quality, revenue/by-product-category, tier-distribution, tier-movement, conversion-by-hour, pending-partial) |
| `api-keys` | `/api-keys` | Super admin tạo & quản lý 3rd-party key |
| `system-settings` | `/system-settings` | Key-value config |
| `ai-summary` | (service only) | Gemini wrapper - gọi từ call-logs/customers |
| `mcp-agent` | `/mcp`, `/ai-agent` | MCP server + REST fallback (read-only, API key) |

**Common (non-module):** `main.ts`, `app.module.ts`, `common/` (guards, interceptors, filters, pipes, cron, buildAccessFilter).

## Frontend Routes (31)

### Public / Auth
- `/` - Landing page
- `/login` - Login (force-dynamic, split server shell + client form)

### Dashboard Group (sidebar layout)
**Analytics:**
- `/dashboard` - Tổng quan: 5 KPI (tooltip giải thích) + revenue area + funnel; admin thêm 5 khối phân tích (Nguồn lead / Sản phẩm / Thanh toán / Hạng khách / Lát cắt mở rộng) trong `components/dashboard/blocks/`
- `/dashboard/revenue`, `/dashboard/customers`, `/dashboard/employees` - Sub-pages

**Leads (unified):**
- `/leads`, `/leads/new`, `/leads/[id]`, `/leads/[id]/edit` (pencil button mở slide-in Sheet drawer với full LeadForm, USER bị field-lock phone/name/sourceId)
- Page `/leads` là single unified list với filter bar: `status[]` multi-select, `assignment` 3-state (unassigned/dept/user), `teamId`, label, source, product, hasOrder, date range. Mọi scope cũ (Kho Mới/Zoom/Dept/Thả nổi) biểu diễn qua URL preset filter.
- Legacy redirect pages: `/leads/pool/new`, `/leads/pool/zoom`, `/leads/dept`, `/floating` -> redirect tới `/leads?...` với preset filter tương ứng (giữ cho bookmark cũ).
- Sidebar Leads là flat link `/leads` (đã bỏ dropdown 3 sub-items).
- **[GOTCHA] Backend `/leads/pool/{new,zoom,department,floating}` là endpoint LEGACY** (hàm `poolNewFiltered`/`poolZoom`/`poolDepartment`/`poolFloating` trong `leads.service.ts`). `poolNewFiltered` hardcode `take: 200`, KHÔNG phân trang. UI chính `/leads` KHÔNG dùng các route này - nó dùng `list()` (**default limit 10**, cursor/offset pagination, scope qua `buildAccessFilter`). Chỉ `/leads/pool/new` còn 1 caller (`assignment-template-crud-with-apply.tsx`, áp mẫu round-robin); zoom/floating/department không còn caller FE. Đừng nhầm `take:200` là default của `/leads`. Pool dùng query set-based (groupBy/IN/CTE/window) - KHÔNG phải N+1.

**Customers (4):** `/customers`, `/customers/new`, `/customers/[id]`, `/customers/[id]/edit`

**Commerce:**
- `/orders`, `/orders/[id]`
- `/payments`
- `/products`

**Ops:**
- `/call-logs`, `/tasks`, `/import`

**Admin/Settings:**
- `/users`, `/users/new`, `/users/[id]/edit`
- `/profile`
- `/settings` (8 tab: departments, teams, levels, labels, sources, products, payment-types, api-keys, etc.)
- `/settings/distribution` - AI distribution per dept
- `/settings/lark-sync` - Mapping đồng bộ payment -> Lark Base (SUPER_ADMIN)

## Frontend Component Folders (16)

```
components/
├── ui/                 shadcn/ui primitives (NO barrel import) - bao gồm `sheet.tsx` (slide-in drawer dùng cho lead edit drawer)
├── layout/             Sidebar, header, breadcrumb, nav
├── shared/             DataTable, timeline, search bar, etc.
├── landing/            Landing page sections
├── leads/              Lead list, form, kanban, kho components
├── customers/          Customer list, form, timeline
├── orders/             Order list, form, line items
├── payments/           Payment form, verify modal, installment picker
├── bank-transactions/  Unmatched list, manual match
├── call-logs/          List, summary viewer, manual match
├── products/           Product list + form
├── import/             Upload wizard, progress, error display
├── tasks/              Quick add, list, detail
├── settings/           Department/team/label/source forms
├── users/              User list, form, role picker
└── dashboard/          hooks/, tabs/, widgets/ - KPI, charts, scorecard
```

## Database - 31 Tables

Xem `docs/data-model.md` để chi tiết. Nhóm:

- **Auth (3):** users, refresh_tokens, api_keys
- **Organization (4):** departments, teams, manager_departments, employee_levels
- **CRM core (5):** customers, leads (single-label FK `label_id`), lead_sources, labels, customer_labels
- **Commerce (8):** products, product_categories, product_groups, order_formats, orders, payments, payment_types, payment_installments, bank_accounts - (thực tế 9 nếu tính bank_accounts)
- **Banking/Verification (1):** bank_transactions
- **Activity (4):** activities, activity_attachments, documents, call_logs
- **Assignment (3):** assignment_history, assignment_templates, assignment_template_members
- **Config (3):** ai_distribution_configs, recall_configs, system_settings
- **Productivity (3):** tasks, notifications, import_jobs

## Key Conventions

- **Auth flow:** Browser → Next.js `/api/proxy/*` (BFF) → reads httpOnly cookie → Bearer → NestJS. No direct browser ↔ NestJS call.
- **IDOR prevention:** Mọi repo query qua `buildAccessFilter(user)` (xem `common/filters/build-access-filter.ts`).
- **Soft delete:** `deletedAt` + partial indexes. Xem 3 pattern trong `code-standards.md` (A: partial unique, B: composite `@@unique`, C: `isActive` flag).
- **BigInt:** Global interceptor serialize → string trong response.
- **Cursor pagination:** Tất cả list endpoint.
- **Cron jobs:** 6 job (refresh token cleanup, payment batch, auto-recall, task reminder, task escalation, notification cleanup).

## Related Docs

- `project-overview-pdr.md` - Business context, roles, NFR
- `system-architecture.md` - High-level diagram + data flow
- `data-model.md` - Chi tiết 31 table + ERD
- `api-reference.md` - Full endpoint inventory
- `frontend-guide.md` - Route + component + data-fetching pattern
- `business-flows.md` - Sequence diagrams nghiệp vụ
- `code-standards.md` - Conventions + security checklist
- `api-integration-guide.md` - 3rd-party integration (external API key)
- `deployment-guide.md`, `aapanel-deployment-guide.md` - Ops
