# Code Standards

## General

- **Language:** TypeScript strict mode across all packages
- **File naming:** kebab-case (`create-lead.dto.ts`, `jwt-auth.guard.ts`)
- **File size:** Max 200 lines per file. Split large files into focused modules
- **Principles:** YAGNI, KISS, DRY
- **Comments:** Only for complex logic. Self-documenting code preferred

## Backend (NestJS 11)

### Module Structure

```
apps/api/src/modules/{module-name}/
├── {module-name}.module.ts
├── {module-name}.controller.ts
├── {module-name}.service.ts
├── {module-name}.repository.ts
└── dto/
    ├── create-{entity}.dto.ts
    ├── update-{entity}.dto.ts
    └── {entity}-query.dto.ts
```

### Conventions

- Global prefix: `/api/v1`
- Guards: JWT (global), Roles, Ownership, ApiKey
- Interceptors: BigInt serialization (global), logging
- Filters: HTTP exception standardization (global)
- Pipes: ParseBigInt for route params
- Validation: class-validator or Zod in DTOs
- Logging: Pino with redaction (`req.headers.authorization`, `req.body.password`)

### IDOR Prevention (MANDATORY)

```typescript
// EVERY repository query MUST scope to user access.
// mode='write' BẮT BUỘC ở guard mutation (LEADER ghi self-scope, không sửa data team).
async findByIdScoped(id: bigint, user: CurrentUser, mode: 'read' | 'write' = 'read') {
  return prisma.lead.findFirst({
    where: { id, deletedAt: null, ...buildAccessFilter(user, 'lead', mode) }
  });
}

// Nguồn chân lý: apps/api/src/common/filters/build-access-filter.ts
buildAccessFilter(user, entity, mode = 'read') {
  if (user.role === 'SUPER_ADMIN' || user.role === 'MANAGER') return {}; // thấy tất cả
  // LEADER: team-scope khi ĐỌC; self-scope khi GHI (rơi xuống nhánh USER)
  if (user.role === 'LEADER' && user.teamId != null && mode === 'read') {
    return { assignedUser: { teamId: user.teamId } }; // + kho phòng ban chưa giao cho lead
  }
  return { assignedUserId: user.id }; // USER + LEADER(write/không team)
}
```

### API Response Format

```typescript
// Success
{ data: T, meta?: { nextCursor?: string } }

// Error
{ statusCode: number, message: string, error: string }
```

### Pagination

Cursor-based for all list endpoints:
```typescript
class PaginationQueryDto {
  cursor?: string;  // BigInt as string
  limit?: number;   // default 20, max 100
}
```

## Frontend (Next.js 16)

### File Structure

```
apps/web/src/
├── app/                    # App Router pages
│   ├── (auth)/             # Auth group (no sidebar)
│   ├── (dashboard)/        # Main app group (with sidebar)
│   └── api/                # API routes (auth proxy)
├── components/
│   ├── layout/             # Sidebar, header, breadcrumbs
│   ├── ui/                 # shadcn/ui (NO barrel imports)
│   ├── shared/             # Data table, timeline, search
│   ├── leads/              # Lead-specific components
│   ├── customers/          # Customer-specific components
│   ├── orders/             # Order components
│   ├── payments/           # Payment components
│   ├── dashboard/          # Charts, KPI cards
│   ├── settings/           # Settings forms
│   └── notifications/      # Bell, dropdown
├── lib/                    # API client, auth, utils
├── hooks/                  # Custom hooks
├── providers/              # Auth, theme providers
└── types/                  # Frontend types
```

### Conventions

- Server Components by default, Client Components only when needed
- **NO barrel imports** for shadcn/ui: `import { Button } from '@/components/ui/button'`
- Lazy load heavy components: `next/dynamic` with `{ ssr: false }` for charts, kanban
- URL-based filter state (shareable views) via `useSearchParams`
- React Hook Form + Zod for form validation
- `React.cache()` for shared data in Server Components

### Formatting

- Date: DD/MM/YYYY (Vietnamese standard)
- Number: 1.000.000 (dot as thousand separator)
- Currency: VND, no decimals (10.000.000 VND)
- Phone: 0xx xxx xxxx (spaced for readability)
- Language: Vietnamese only, no i18n framework

## Database (PostgreSQL 16 + Prisma 6)

### Naming

- Tables: snake_case via `@@map("table_name")`
- Columns: snake_case via `@map("column_name")`
- Enums: PascalCase in Prisma, UPPER_CASE values

### Primary Keys

- BIGINT with IDENTITY: `id BigInt @id @default(autoincrement())`
- Serialized as string in API responses (BigInt → String interceptor)

### Soft Delete

- `deletedAt DateTime? @map("deleted_at")` on all CRM entities
- Partial indexes: `WHERE deleted_at IS NULL`
- Prisma extension auto-filters `deletedAt: null`

### Unique Constraints on Soft-Delete Tables

**Problem:** `@unique` tạo full unique index trên toàn bảng, kể cả row đã soft-delete. Khi tạo row mới với value đã tồn tại (ở row đã xóa) → ghost-row blocking → lỗi UNIQUE violation.

**Ba pattern được dùng trong project (chọn 1):**

**Pattern A - Partial unique trong raw-indexes.sql (preferred)**

Phù hợp khi trường unique có back-relation one-to-one hoặc đơn thuần là unique business-level.

```prisma
// schema.prisma - BỎ @unique
model Team {
  leaderId  BigInt    @map("leader_id")  // không @unique
  deletedAt DateTime? @map("deleted_at")
}
```

```sql
-- raw-indexes.sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_leader_active
  ON teams(leader_id) WHERE deleted_at IS NULL;
```

**Lưu ý Prisma relation one-to-one:** Nếu bỏ `@unique` mà field có back-relation `Xxx?`, Prisma sẽ fail validation (P1012). Đổi back-relation thành `Xxx[]` (many) - business rule đơn lẻ vẫn enforce ở partial unique + service logic.

**Pattern B - Composite `@@unique([field, deletedAt])`**

Phù hợp khi không muốn đụng raw SQL và chấp nhận constraint chặt hơn một chút.

```prisma
model User {
  email     String
  deletedAt DateTime?
  @@unique([email, deletedAt])  // 2 active users không được cùng email; 2 soft-deleted cùng email + cùng timestamp sẽ fail
}
```

Rủi ro: 2 row soft-delete trong cùng millisecond sẽ conflict (rare but possible).

**Pattern C - Dùng `isActive` flag, không soft-delete**

Phù hợp với lookup tables (LeadSource, PaymentType, BankAccount, Label...). Không có `deletedAt` → không có ghost-row → tạo mới cùng tên vẫn OK.

```prisma
model LeadSource {
  name     String   // không unique, không soft-delete
  isActive Boolean  @default(true)
}
```

**Khi code review, kiểm tra:** mọi `@unique` trên model có `deletedAt` cần 1 trong 3 pattern trên. Không để `@unique` đơn thuần.

### Indexes

- Prisma `@@index` for FK and common queries
- Raw SQL for partial indexes, GIN, FTS (cannot express in Prisma)
- Raw SQL via tagged template literals ONLY (prevent SQL injection)

```typescript
// SAFE
prisma.$queryRaw`SELECT * FROM leads WHERE name ILIKE ${'%' + search + '%'}`

// VULNERABLE - NEVER DO THIS
prisma.$queryRaw(`SELECT * FROM leads WHERE name ILIKE '%${search}%'`)
```

## Security Checklist

- [ ] bcrypt cost 12 for passwords
- [ ] JWT secrets in env vars only
- [ ] Refresh tokens hashed (SHA-256) before DB storage
- [ ] Rate limiting: auth 5/min, API 100/min, 3rd party 100/min per key
- [ ] No user enumeration (generic error messages)
- [ ] API keys hashed in DB, shown ONCE on creation
- [ ] CSV export sanitization (formula injection: prefix `= + - @ |` chars)
- [ ] File uploads: UUID filenames, MIME validation, 10MB max
- [ ] httpOnly + Secure + SameSite cookies for JWT
- [ ] IDOR prevention: buildAccessFilter on ALL queries
- [ ] SQL injection: tagged template literals only
- [ ] XSS: sanitize notification content, call log content
- [ ] Mass assignment: separate DTOs for user self-update vs admin-update

## Git Conventions

- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- No AI references in commit messages
- Commit after each completed feature
- No secrets in commits (.env, API keys, credentials)
