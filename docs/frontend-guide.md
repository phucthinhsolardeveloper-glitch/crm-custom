# Frontend Guide

> Next.js 16 App Router, pure frontend - không có business logic hay Prisma access.
> Last verified: 2026-04-17.

## Stack

- **Framework:** Next.js 16 (App Router, React 19 patterns)
- **Port:** `:3011`
- **UI:** shadcn/ui + Radix UI primitives + Tailwind CSS 4
- **Font:** Plus Jakarta Sans
- **Forms:** React Hook Form + Zod (schemas trong `lib/zod-form-validation-schemas.ts`)
- **Tables:** TanStack Table 8
- **Charts:** Recharts 2
- **Drag & drop:** `@dnd-kit`
- **Language:** Vietnamese only - KHÔNG có i18n framework
- **Date format:** DD/MM/YYYY · Number: 1.000.000 · Currency: VND (no decimals)

## Architecture Principle

**Next.js = pure frontend.** Không import Prisma, không gọi DB trực tiếp. Tất cả data qua NestJS qua 2 path:

```
┌─ Server Components ─────┐       ┌─ Client Components ──┐
│ serverFetch() trong     │       │ api.get/post/...     │
│ lib/auth.ts (server use)│       │ trong lib/api-client │
└────────┬────────────────┘       └──────────┬───────────┘
         │                                   │
         ▼                                   ▼
   Trực tiếp NestJS                   /api/proxy/* (BFF)
   http://localhost:3010/api/v1       → đọc httpOnly cookie
   (server gắn Bearer từ              → gắn Bearer → forward
    cookie sẵn)                         → relay response
         │                                   │
         └──────────────┬────────────────────┘
                        ▼
                   NestJS :3010
```

**Lý do 2 path:**
- Server Components chạy trong server runtime, đọc cookie trực tiếp → gọi NestJS trực tiếp
- Client Components không access httpOnly cookie → phải qua BFF proxy để backend forward

## File Structure

```
apps/web/src/
├── app/
│   ├── (auth)/                    Auth group (layout không có sidebar)
│   │   └── login/page.tsx
│   ├── (dashboard)/               Main group (layout có sidebar)
│   │   ├── dashboard/             3 sub-page
│   │   ├── leads/                 6 page (list/new/detail/edit + 2 pool + zoom)
│   │   ├── floating/              Kho thả nổi (lead + customer)
│   │   ├── customers/             4 page
│   │   ├── orders/                2 page
│   │   ├── payments/              1 page
│   │   ├── products/              1 page
│   │   ├── call-logs/             1 page
│   │   ├── tasks/                 1 page
│   │   ├── import/                1 page
│   │   ├── users/                 3 page
│   │   ├── profile/               1 page
│   │   └── settings/              2 page (main + distribution)
│   ├── api/
│   │   ├── auth/[...action]/      Login/logout/refresh - set/clear cookie
│   │   └── proxy/[...path]/       BFF proxy toàn bộ request khác
│   ├── globals.css                Tailwind 4 + custom tokens
│   ├── layout.tsx                 Root layout (fonts, providers)
│   └── page.tsx                   Landing
├── components/                    16 folder (xem table dưới)
├── lib/
│   ├── api-client.ts              Client-side fetcher (qua /api/proxy)
│   ├── auth.ts                    Server-side: getAccessToken, serverFetch, getCurrentUser
│   ├── utils.ts                   cn() + misc helpers
│   └── zod-form-validation-schemas.ts   Form schemas
├── hooks/
│   └── use-form-action.ts         RHF + action dispatch helper
├── providers/
│   └── auth-provider.tsx          Client-side user context
├── types/                         FE-only types (+ re-export từ @crm/types)
└── middleware.ts                  Edge: JWT exp check + login redirect
```

## Routes (31)

### Public / Auth
| Route | File | Role | Ghi chú |
|-------|------|------|---------|
| `/` | `app/page.tsx` | Any | Landing page (`landing/` components) |
| `/login` | `app/(auth)/login/page.tsx` | Any | **Force-dynamic** + split server shell + client form. Redirect về `?redirect=...` sau login |

### Dashboard Group

**Analytics (4):**
| Route | Role | Ghi chú |
|-------|------|---------|
| `/dashboard` | Any | Overview: 4 KPI + 2 mini chart |
| `/dashboard/revenue` | Any | Revenue tab isolated |
| `/dashboard/customers` | Any | Customer analytics |
| `/dashboard/employees` | 👔 | Scorecard 0-100 (conversion/revenue/aging/tasks) |
| `/my-team` | LEADER+ | Team của tôi - member + KPI kỳ hiện tại (`GET /users/my-team`). LEADER ép theo team mình. Sidebar nhóm KINH DOANH |

**Leads (unified):**
| Route | Role | Ghi chú |
|-------|------|---------|
| `/leads` | Any | Unified list - filter bar combo (status multi, assignment 3-state, teamId, dept, label, source, product, date range). Scope theo role qua `buildAccessFilter`. |
| `/leads/new` | 👔 | Tạo thủ công |
| `/leads/[id]` | Any | Chi tiết + timeline |
| `/leads/[id]/edit` | Any | Form edit |
| `/leads/dept` | Any | Legacy redirect -> `/leads?status=POOL&assignment=dept` |
| `/leads/pool/new` | 👔 | Legacy redirect -> `/leads?status=POOL&assignment=unassigned` |
| `/leads/pool/zoom` | 👔 | Legacy redirect -> `/leads?status=ZOOM` |
| `/floating` | Any | Legacy redirect -> `/leads?status=FLOATING` (lead + customer floating dùng chung view) |

Sidebar: "Leads" là flat link `/leads` (bỏ dropdown sub-items cũ).

**Customers (4):** `/customers`, `/customers/new`, `/customers/[id]`, `/customers/[id]/edit`

**Commerce (4):** `/orders`, `/orders/[id]`, `/payments`, `/products`

**Ops (3):** `/call-logs`, `/tasks`, `/import`

**Admin (7):**
| Route | Role |
|-------|------|
| `/users` | 👔 |
| `/users/new` | 👑 |
| `/users/[id]/edit` | 👑 |
| `/profile` | Any (self) |
| `/settings` | 👑 (đa số tabs) |
| `/settings/distribution` | 👔 |

## Component Folders (16)

| Folder | Nội dung |
|--------|----------|
| `ui/` | shadcn/ui primitives - **NO barrel imports** (import từng file: `@/components/ui/button`) |
| `layout/` | Sidebar, header, breadcrumb, nav item với nested dropdown (dashboard sub-pages) |
| `shared/` | DataTable (TanStack), activity timeline, search bar, pagination |
| `landing/` | Landing page hero + sections |
| `leads/` | Lead list/form/card, kho kanban, filters, AI analyze modal |
| `customers/` | Customer list/form, timeline viewer, labels picker |
| `orders/` | Order list/form, line items, status badges |
| `payments/` | Payment form, verify modal, installment picker |
| `bank-transactions/` | Unmatched queue, manual match UI |
| `call-logs/` | Log list, summary viewer, manual match |
| `products/` | Product list + form |
| `import/` | Upload wizard, progress bar, error file download |
| `tasks/` | Quick add bar (smart time parse), list, detail drawer |
| `settings/` | Dept/team/level/source/label/format forms |
| `users/` | User list, form (role + team + level picker) |
| `dashboard/` | `hooks/` (useDashboardStats, useTabData), `tabs/` (customers, revenue, team), `widgets/` (KPI card, chart card, tooltip) |

### Dashboard Sub-folder Anatomy

Dashboard đã refactor (2026-04-14) từ monolithic 452-line sang 14 module < 200 dòng:

```
components/dashboard/
├── dashboard-page.tsx            Orchestrator (42 dòng)
├── dashboard-header.tsx          Title + time range selector
├── dashboard-kpi-section.tsx     4 KPI card với scroll-snap mobile
├── dashboard-main-charts.tsx     Revenue + funnel mini chart
├── dashboard-tabs.tsx            Tab container với URL sync (`?tab=customers`)
├── tabs/
│   ├── tab-customers.tsx         Funnel + aging + conversion trend + sources
│   ├── tab-revenue.tsx           Revenue trend + dept revenue
│   └── tab-team.tsx              Top performers + dept/team performance (MANAGER+)
├── hooks/
│   ├── use-dashboard-stats.ts    Main section data
│   └── use-tab-data.ts           Lazy per-tab với cache
├── widgets/
│   ├── kpi-card.tsx
│   ├── chart-card.tsx
│   └── chart-tooltip.tsx
└── constants.ts                  Design tokens, formatters, types
```

## Data Fetching Patterns

### Server Components (default)

```ts
// Server component - gọi trực tiếp NestJS qua serverFetch
import { serverFetch } from '@/lib/auth';

export default async function LeadsPage() {
  const { data } = await serverFetch<{ data: Lead[] }>('/leads?limit=50');
  return <LeadList leads={data} />;
}
```

**Rules:**
- `cache: 'no-store'` (default trong serverFetch) - CRM data luôn fresh
- `React.cache()` cho data chia sẻ giữa layout + page
- Không gọi serverFetch trong client component

### Client Components

```tsx
'use client';
import { api } from '@/lib/api-client';

// Client - qua /api/proxy/* → BFF forward
const { data } = await api.get<{ data: Lead[] }>('/leads');
```

**Rules:**
- Dùng khi cần interactivity (filter, form submit, modal)
- `401` tự redirect về `/login?redirect=...` (xem `api-client.ts`)
- `credentials: 'include'` mặc định

### Form Submit (Server Actions Pattern - với Proxy)

Dự án không dùng Next.js Server Actions native vì muốn qua NestJS duy nhất. Form handle qua client + `api.post/patch`:

```tsx
'use client';
const onSubmit = async (values: Schema) => {
  await api.post('/leads', values);
  router.refresh();
};
```

## Auth Flow

### Login

```
User → POST /api/auth/login (Next.js route handler)
  → server-side: POST http://nestjs/api/v1/auth/login
  → NestJS trả {accessToken, refreshToken, user}
  → route handler set 2 httpOnly cookies (access_token, refresh_token)
  → redirect về ?redirect=... hoặc /dashboard
```

### Per-Request Auth

- **Server component:** `lib/auth.ts` → `cookies()` → gắn Bearer vào serverFetch
- **Client component:** trình duyệt tự gửi cookie; `/api/proxy/*` route handler đọc cookie → gắn Bearer cho NestJS
- **Middleware (Edge):** `middleware.ts` decode JWT exp (không verify signature vì Edge không có secret) → redirect `/login` nếu expired

### Token Refresh

Hiện tại **KHÔNG auto-refresh client-side**. Khi NestJS trả 401, api-client redirect `/login`. User đăng nhập lại. Route handler `/api/auth/[...action]/route.ts` có endpoint `refresh` cho tương lai.

## Middleware (Edge)

```ts
// middleware.ts
const PUBLIC_PATHS = ['/', '/login'];
// Decode JWT.exp không verify → redirect /login nếu expired
// Skip /_next/*, /api/* (đã protect ở backend)
```

**Caveat:** Edge middleware không access `JWT_SECRET` → chỉ check structural validity + expiry. Real auth luôn ở NestJS.

## Styling Conventions

- **Tailwind 4** với CSS variables cho theme (sky blue #0ea5e9 primary, cyan #06b6d4 secondary)
- **Hover-lift card:** `hover:-translate-y-0.5 hover:shadow-lg transition`
- **Gradient text:** `bg-gradient-to-r from-sky-500 to-cyan-500 bg-clip-text text-transparent`
- **Glass effect:** `backdrop-blur-xl bg-white/80 border border-white/20`
- **Touch target:** min 44×44px (WCAG 2.1 AA)

Xem chi tiết: `design-guidelines.md` (995 dòng).

## Form Validation

Pattern: Zod schema → `useForm({ resolver: zodResolver })`.

```tsx
// lib/zod-form-validation-schemas.ts - centralized schemas
export const leadCreateSchema = z.object({
  name: z.string().min(1, 'Nhập tên khách'),
  phone: z.string().regex(/^0[0-9]{9,10}$/, 'SĐT không hợp lệ'),
  email: z.string().email().optional(),
});

// Usage
const form = useForm({ resolver: zodResolver(leadCreateSchema) });
```

Error messages Vietnamese, đồng bộ với backend Zod error map.

## URL State & Filters

Filters dùng `useSearchParams` + `router.push` để shareable view:

```tsx
const params = useSearchParams();
const status = params.get('status');
// Update: router.push(`${pathname}?${new URLSearchParams({ status: 'POOL' })}`)
```

Áp dụng: lead list filters, order filters, dashboard tab (`?tab=customers`), time range (`?range=7d`).

## Lazy Loading

`next/dynamic` với `{ ssr: false }` cho component heavy:

```tsx
const Kanban = dynamic(() => import('@/components/leads/kanban'), { ssr: false });
const RevenueChart = dynamic(() => import('./revenue-chart'), { ssr: false });
```

## Cache & Stale HTML

Dash có lịch sử bug stale HTML (commit 840219d, 4289865, ef978...). Đã fix bằng:
- `export const dynamic = 'force-dynamic'` trên `/login`
- `no-cache` headers cho `/login` + `/dashboard`
- Cloudflare auto-purge sau deploy (commit a3a9bc7)

Nếu thấy route tĩnh bị cache chunk cũ: check `next.config.js` + nginx `Cache-Control`.

## Common Pitfalls

1. **Đừng import từ `@/components/ui` index** - barrel import break tree-shaking. Import từng file.
2. **Đừng gọi serverFetch trong client component** - runtime error.
3. **Đừng gọi NestJS trực tiếp từ client** - cross-origin cookie không work. Qua `/api/proxy`.
4. **Đừng dùng `<Image>` cho upload preview** - component Next/Image strict, ưu tiên `<img>` cho dynamic URL.
5. **Đừng dùng Server Action của Next.js native** - dự án chọn NestJS làm nguồn logic duy nhất.

## Related Docs

- `design-guidelines.md` - 995 dòng visual tokens, layout patterns
- `api-reference.md` - Endpoint FE gọi
- `code-standards.md` - Formatting, security checklist
- `system-architecture.md` - BFF proxy flow
