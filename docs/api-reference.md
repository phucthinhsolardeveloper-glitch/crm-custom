# API Reference

> Auto-compiled từ controllers trong `apps/api/src/modules/`.
> Last verified: 2026-04-17.

## Conventions

- **Base URL:** `http://host/api/v1` (prefix set trong `main.ts`)
- **Auth:** Global JWT guard. Skip bằng `@Public()`. API-key-auth cho `/external/*` và `/mcp`, `/ai-agent/*`.
- **Roles:** `@Roles(UserRole.X)` = minimum required. Default (không có decorator) = mọi authenticated user (USER/LEADER/MANAGER/SUPER_ADMIN).
- **IDOR scope:** Mọi endpoint scope dữ liệu qua `buildAccessFilter(user, entity, mode)` → USER self-scope; LEADER team-scope khi ĐỌC + self-scope khi GHI (`mode='write'`); MANAGER/SUPER_ADMIN thấy tất cả.
- **Pagination:** Cursor-based (`?cursor=...&limit=20`). Max 100.
- **Response shape:** `{ data: T, meta?: { nextCursor?: string } }` hoặc `{ statusCode, message, error }` khi lỗi.
- **BigInt:** Mọi `id` serialized thành `string` qua global interceptor.

## Role Legend

| Key | Meaning |
|-----|---------|
| 🌐 | `@Public()` - không cần JWT |
| 🔑 | API key auth (header `x-api-key` hoặc `Authorization: Bearer mcp_...`) |
| 👤 | Authenticated user (USER/LEADER/MANAGER/SUPER_ADMIN) |
| 🧑‍🤝‍🧑 | LEADER+ (LEADER/MANAGER/SUPER_ADMIN) |
| 👔 | MANAGER+ |
| 👑 | SUPER_ADMIN only |

---

## 1. Auth - `/auth`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| POST | `/auth/login` | 🌐 | Trả access+refresh token, set httpOnly cookie qua Next.js BFF |
| POST | `/auth/refresh` | 🌐 | Rotate refresh token |
| POST | `/auth/logout` | 👤 | Revoke refresh token |
| GET | `/auth/me` | 👤 | Current user profile + managedDeptIds |

## 2. Users - `/users`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/users` | 👔 | List users (MANAGER thấy toàn hệ thống, không scope theo dept) |
| GET | `/users/my-team` | 🧑‍🤝‍🧑 | Member + KPI kỳ hiện tại của team. LEADER ép theo team mình; MANAGER/SA truyền `?teamId=` xem team khác. `teamId=null` -> mảng rỗng |
| GET | `/users/:id` | 👤 | Chi tiết user (self hoặc manager+) |
| POST | `/users` | 👔 | Tạo user. MANAGER gán được role USER/LEADER; SUPER_ADMIN không giới hạn |
| PATCH | `/users/profile` | 👤 | Self-update (limited fields) |
| PATCH | `/users/:id` | 👔 | Admin-update (full fields). MANAGER chỉ thao tác user role USER/LEADER, không gán role lên MANAGER+ |
| DELETE | `/users/:id` | 👔 | Soft-delete, cascade lead về dept pool. MANAGER chỉ deactivate user role USER/LEADER |
| POST | `/users/bulk-delete` | 👔 | Bulk soft-delete (max 100). MANAGER skip user role MANAGER+ |

## 3. Departments - `/departments`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/departments` | 👤 | List |
| GET | `/departments/:id` | 👤 | Chi tiết |
| POST | `/departments` | 👑 | Tạo |
| PATCH | `/departments/:id` | 👑 | Update |
| DELETE | `/departments/:id` | 👑 | Soft-delete |

## 4. Teams - `/teams`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/teams` | 👤 | List |
| GET | `/teams/:id` | 👤 | Chi tiết |
| POST | `/teams` | 👑 | Tạo + auto-attach leader as member |
| PATCH | `/teams/:id` | 👑 | Update |
| DELETE | `/teams/:id` | 👑 | Transaction: detach members → soft-delete team |

## 5. Employee Levels - `/employee-levels`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/employee-levels` | 👤 | List + rank + maxLeads cap |
| POST | `/employee-levels` | 👑 | Tạo |
| PATCH | `/employee-levels/:id` | 👑 | Update |
| DELETE | `/employee-levels/:id` | 👑 | Soft-delete |

## 6. Leads - `/leads`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/leads` | 👤 | Unified list. Filter combo: `status[]` (multi-select), `assignment` (unassigned/dept/user), `teamId`, `departmentId`, `assignedUserId`, `labelId`, `sourceId`, `productId`, `hasOrder`, `dateFrom/To`, `assignedFrom/To`, `search` |
| GET | `/leads/label-counts` | 👤 | Đếm lead theo nhãn, nhận cùng filter query như `/leads` (scoped theo role). Thay thế 4 endpoint cũ `/label-counts/{my,pool/new,pool/zoom,floating}` |
| GET | `/leads/my-dept-pool` | 👤 | Kho phòng ban của user |
| GET | `/leads/pool/new` | 👔 | Kho Mới (POOL, dept=null). GIỮ cho 3rd-party backward-compat - UI mới dùng `/leads?status=POOL&assignment=unassigned` |
| GET | `/leads/pool/zoom` | 👔 | Kho Zoom. GIỮ cho backward-compat - UI mới dùng `/leads?status=ZOOM` |
| GET | `/leads/pool/department/:deptId` | 👤 | Dept pool theo ID. GIỮ cho backward-compat - UI mới dùng `/leads?status=POOL&assignment=dept&departmentId=...` |
| GET | `/leads/pool/floating` | 👤 | Kho thả nổi. GIỮ cho backward-compat - UI mới dùng `/leads?status=FLOATING` |
| GET | `/leads/:id` | 👤 | Chi tiết |
| POST | `/leads` | 👔 | Tạo manual |
| PATCH | `/leads/:id` | 👤 | Update (owner hoặc manager dept) |
| POST | `/leads/bulk-assign` | 👔 | Assign nhiều leads (template hoặc manual) |
| POST | `/leads/:id/assign` | 👔 | Assign 1 lead cho user |
| POST | `/leads/:id/recall` | 👔 | Recall về dept pool |
| POST | `/leads/bulk-recall` | 👔 | Recall nhiều |
| POST | `/leads/:id/claim` | 👤 | User claim từ dept pool / floating |
| POST | `/leads/:id/transfer` | 👤 | Transfer (dept khác / floating / unassign) |
| POST | `/leads/:id/status` | 👤 | Đổi status (vd LOST, CONVERTED thủ công) |
| POST | `/leads/:id/convert` | 👤 | Convert → Customer (nếu chưa có) |
| DELETE | `/leads/:id` | 👑 | Soft-delete |
| PATCH | `/leads/:id/label` | 👤 | Gắn / đổi / gỡ nhãn (single label per lead). Body: `{ labelId: string \| null }` |

## 7. Customers - `/customers`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/customers` | 👑 | List full (SUPER_ADMIN only theo NFR) |
| GET | `/customers/search` | 👤 | Search by phone (rate-limited - mọi user) |
| GET | `/customers/:id` | 👤 | Chi tiết (scoped) |
| POST | `/customers` | 👔 | Tạo thủ công |
| PATCH | `/customers/:id` | 👤 | Update |
| POST | `/customers/:id/claim` | 👤 | Claim từ floating |
| POST | `/customers/:id/transfer` | 👤 | Transfer |
| POST | `/customers/:id/reactivate` | 👔 | INACTIVE → ACTIVE |
| DELETE | `/customers/:id` | 👑 | Soft-delete |
| POST | `/customers/:id/labels` | 👤 | Gắn label |
| DELETE | `/customers/:id/labels/:labelId` | 👤 | Gỡ label |
| POST | `/customers/:id/analyze` | 👤 | AI analyze (Gemini) - trả aiRating + shortDescription |
| POST | `/customers/:id/avatar` | 👤 | Upload avatar (multipart `file`, JPG/PNG/WebP, 5MB max). Scope qua buildAccessFilter. |
| DELETE | `/customers/:id/avatar` | 👤 | Xoá avatar + unlink file. |

## 7.1. Customer Tiers - `/customer-tiers`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/customer-tiers` | 👤 | List tất cả tiers (cached 10 phút). Cho dropdown filter + badge lookup. |
| GET | `/customer-tiers/:id` | 👤 | Detail 1 tier. |
| POST | `/customer-tiers` | 👑 | Tạo tier (name, slug, minSpending, color hex, emoji?, iconKey?, sortOrder, benefits?). |
| PATCH | `/customer-tiers/:id` | 👑 | Update. Nếu `minSpending` đổi → auto trigger bulk recalc (response có `recalcTriggered: true`). |
| DELETE | `/customer-tiers/:id` | 👑 | Soft delete = `isActive=false`. Customer FK giữ nguyên, badge vẫn render. |
| PATCH | `/customer-tiers/reorder/batch` | 👑 | Batch update `sortOrder` qua `{ updates: [{ id, sortOrder }] }`. |
| POST | `/customer-tiers/recalc-all` | 👑 | Manual trigger bulk recalc toàn bộ customer (admin tool). |

## 8. Lead Sources - `/lead-sources`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/lead-sources` | 👤 | List (filter `isActive`) |
| POST | `/lead-sources` | 👑 | Tạo (có `skipPool` flag) |
| PATCH | `/lead-sources/:id` | 👑 | Update |
| DELETE | `/lead-sources/:id` | 👑 | Soft-deactivate (`isActive=false`) |

## 9. Labels - `/labels`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/labels` | 👤 | List active labels |
| POST | `/labels` | 👔 | Tạo |
| PATCH | `/labels/:id` | 👔 | Update name/color |
| DELETE | `/labels/:id` | 👔 | Soft-deactivate (giữ LeadLabel/CustomerLabel history) |

## 10. Activities - `/leads|customers/:id/activities`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/leads/:id/activities` | 👤 | Timeline của lead |
| POST | `/leads/:id/activities` | 👤 | Tạo note/call (auto-trigger IN_PROGRESS nếu lead đang ASSIGNED) |
| GET | `/customers/:id/activities` | 👤 | Timeline customer |
| POST | `/customers/:id/activities` | 👤 | Tạo note/call cho customer |
| GET | `/activities/stats/by-department` | 👔 | Thống kê activity/dept/ngày |

## 11. Products - `/products`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/products` | 👤 | List |
| GET | `/products/:id` | 👤 | Chi tiết |
| POST | `/products` | 👔 | Tạo |
| PATCH | `/products/:id` | 👔 | Update |
| DELETE | `/products/:id` | 👑 | Soft-delete |

## 12. Product Categories - `/product-categories`

| Method | Path | Role |
|--------|------|------|
| GET | `/product-categories` | 👤 |
| POST | `/product-categories` | 👔 |
| PATCH | `/product-categories/:id` | 👔 |
| DELETE | `/product-categories/:id` | 👑 |

## 13. Product Groups - `/product-groups`

| Method | Path | Role |
|--------|------|------|
| GET | `/product-groups` | 👤 |
| POST | `/product-groups` | 👑 |
| PATCH | `/product-groups/:id` | 👑 |
| DELETE | `/product-groups/:id` | 👑 |

## 14. Order Formats - `/order-formats`

| Method | Path | Role |
|--------|------|------|
| GET | `/order-formats` | 👤 |
| POST | `/order-formats` | 👑 |
| PATCH | `/order-formats/:id` | 👑 |
| DELETE | `/order-formats/:id` | 👑 |

## 15. Orders - `/orders`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/orders` | 👤 | List (scoped) |
| GET | `/orders/:id` | 👤 | Chi tiết + payments |
| POST | `/orders` | 👤 | Tạo (bất kỳ user có lead/customer) |
| PATCH | `/orders/:id/status` | 👔 | Đổi status (2 value: PENDING, COMPLETED) - auto-COMPLETED khi payment SUM(VERIFIED+REJECTED) >= totalAmount |
| DELETE | `/orders/:id` | 👑 | Soft-delete |

**Order Status (2 value):**
- PENDING: Vừa tạo, chờ payment
- COMPLETED: Tổng VERIFIED+REJECTED payment >= order.totalAmount (auto-trigger hoặc manual)

## 16. Payments - `/payments`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/payments` | 👤 | List |
| GET | `/payments/pending` | 👔 | Chỉ PENDING (verify queue) |
| GET | `/payments/export` | 👔 | CSV (MANAGER scoped own dept) |
| GET | `/payments/import-template` | 👔 | Template CSV để import |
| POST | `/payments/import` | 👔 | CSV import (bulk tạo PENDING) |
| GET | `/payments/:id` | 👤 | Chi tiết |
| POST | `/payments` | 👤 | Tạo PENDING (sale nhập CK) |
| POST | `/payments/:id/verify` | 👑 | SUPER_ADMIN: PENDING → VERIFIED + trigger order COMPLETED check |
| POST | `/payments/:id/reject` | 👑 | SUPER_ADMIN: PENDING/VERIFIED → REJECTED {reason} (sale nhập sai - phạt) |
| POST | `/payments/:id/cancel` | 👑 / sale | SUPER_ADMIN hoặc sale (owner): PENDING → CANCELLED {reason} (tạo nhầm) |
| POST | `/payments/:id/refund` | 👑 | SUPER_ADMIN: VERIFIED → REFUNDED {reason} (trả khách) |

**Payment Status (5 value):**
- PENDING: Chờ duyệt (sale tạo hoặc bank webhook auto-match chưa verify)
- VERIFIED: Tiền về đúng (SUPER_ADMIN verify hoặc webhook auto-match)
- REJECTED: Sale nhập sai → phạt (SUPER_ADMIN action, reason lưu, vẫn tính doanh thu tổng)
- REFUNDED: Trả lại khách (SUPER_ADMIN action, reason lưu)
- CANCELLED: Tạo nhầm, tiền không về (SUPER_ADMIN hoặc sale owner khi PENDING, reason lưu)

**Revenue Calculation:**
- Doanh thu TỔNG (công ty) = SUM(amount) WHERE status IN (VERIFIED, REJECTED) AND order.deletedAt IS NULL
- Doanh số SALE (KPI) = SUM(amount) WHERE status = VERIFIED AND order.deletedAt IS NULL

## 17. Payment Types - `/payment-types`

| Method | Path | Role |
|--------|------|------|
| GET | `/payment-types` | 👤 |
| POST | `/payment-types` | 👑 |
| PATCH | `/payment-types/:id` | 👑 |
| DELETE | `/payment-types/:id` | 👑 |

## 18. Payment Installments - `/payment-installments`

| Method | Path | Role |
|--------|------|------|
| GET | `/payment-installments` | 👤 |
| POST | `/payment-installments` | 👑 |
| PATCH | `/payment-installments/:id` | 👑 |
| DELETE | `/payment-installments/:id` | 👑 |

## 19. Bank Accounts - `/bank-accounts`

| Method | Path | Role |
|--------|------|------|
| GET | `/bank-accounts` | 👤 |
| POST | `/bank-accounts` | 👑 |
| PATCH | `/bank-accounts/:id` | 👑 |
| DELETE | `/bank-accounts/:id` | 👑 |

## 20. Bank Transactions - `/bank-transactions` + webhook

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| POST | `/webhooks/bank-transactions` | 🌐 `WebhookSignatureGuard` | Ingest webhook ngân hàng → auto-match payment (legacy; `transactionTime` optional, fallback `now()`) |
| POST | `/bank-transactions/import` | 👑 SA | Multipart CSV import - dedup `externalId`, auto-match, resp: `{ total, imported, skipped_duplicate, auto_matched, errors[] }` |
| GET | `/bank-transactions/import/template` | 👑 SA | Download CSV template 7 cột (UTF-8 BOM): Mã GD / Số tiền / Nội dung / Thời gian / TK nhận / Người gửi / TK gửi |
| GET | `/bank-transactions` | 👔 | List |
| GET | `/bank-transactions/unmatched` | 👔 | Queue UNMATCHED để manager xử lý |
| POST | `/bank-transactions/:id/match` | 👔 | Thủ công match với payment |

## 21. Call Logs - `/call-logs`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| POST | `/call-logs/ingest` | 🌐 | Tổng đài webhook → `findFirst({deletedAt:null})` lookup |
| GET | `/call-logs` | 👤 | List scoped: USER cuộc của mình, LEADER cuộc team, MANAGER+ all |
| GET | `/call-logs/sales` | 👔+LEADER | Dropdown sale (LEADER chỉ member team) |
| POST | `/call-logs/summarize` | 👔+LEADER | AI tóm tắt (Gemini), scope theo role |
| GET | `/call-logs/unmatched` | 👔 | Queue cần verify (deprecated) |
| POST | `/call-logs/:id/match` | 👔 | Thủ công match |

**Lưu ý:** `analysis.score` thang **0-10**.

## 21b. Call Feedbacks - `/call-feedbacks`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| POST | `/call-feedbacks` | LEADER+ | Tạo feedback (LEADER chỉ cuộc team), notify sale |
| GET | `/call-feedbacks?callLogId=` | 👤 | List (USER chỉ cuộc của mình) |
| PATCH | `/call-feedbacks/:id` | tác giả | Sửa nội dung |
| DELETE | `/call-feedbacks/:id` | tác giả / 👔 | Soft delete |

## 22. Tasks - `/tasks`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/tasks` | 👤 | List (mặc định assigned cho self) |
| POST | `/tasks` | 👤 | Tạo (quick add hỗ trợ smart time parse) |
| POST | `/tasks/:id/complete` | 👤 | COMPLETED |
| POST | `/tasks/:id/cancel` | 👤 | CANCELLED |
| PATCH | `/tasks/:id` | 👤 | Update |
| DELETE | `/tasks/:id` | 👤 | Soft-delete |

## 23. Notifications - `/notifications`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/notifications` | 👤 | List polling 30s |
| GET | `/notifications/unread-count` | 👤 | Badge count |
| POST | `/notifications/:id/read` | 👤 | Mark 1 |
| POST | `/notifications/read-all` | 👤 | Mark tất cả |

## 24. Dashboard - `/dashboard`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/dashboard/stats` | 👤 | 4 KPI tổng |
| GET | `/dashboard/lead-funnel` | 👤 | Funnel count theo status |
| GET | `/dashboard/revenue-trend` | 👤 | Revenue theo ngày/tuần/tháng |
| GET | `/dashboard/top-performers` | 👔 | Top sale theo revenue/conversion |
| GET | `/dashboard/leads-by-source` | 👔 | Lead count theo source |
| GET | `/dashboard/conversion-trend` | 👔 | Conversion rate timeline |
| GET | `/dashboard/lead-aging` | 👤 | Bucket 0-7 / 8-14 / 15-30 / 30+ ngày |
| GET | `/dashboard/dept-performance` | 👔 | KPI theo dept |
| GET | `/dashboard/team-performance` | 👔 | KPI theo team |
| GET | `/dashboard/employee-scores` | 👔 | Scorecard 0-100 (conversion 40% + revenue 30% + aging 20% + tasks 10%) |

## 25. Distribution - `/distribution`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/distribution/config/:deptId` | 👔 | Lấy AiDistributionConfig |
| PATCH | `/distribution/config/:deptId` | 👑 | Update weights/criteria |
| GET | `/distribution/scores/:deptId` | 👔 | Preview scores trước khi distribute |
| POST | `/distribution/distribute/:deptId` | 👔 | Run AI distribute trên dept pool |

## 26. Assignment Templates - `/assignment-templates`

| Method | Path | Role |
|--------|------|------|
| GET | `/assignment-templates` | 👔 |
| GET | `/assignment-templates/:id` | 👔 |
| POST | `/assignment-templates` | 👔 |
| PATCH | `/assignment-templates/:id` | 👔 |
| DELETE | `/assignment-templates/:id` | 👔 |
| POST | `/assignment-templates/:id/apply` | 👔 | Áp round-robin lên danh sách lead IDs |

## 27. Recall Config - `/recall-configs`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/recall-configs` | 👑 | List |
| GET | `/recall-configs/:id` | 👑 | Chi tiết |
| POST | `/recall-configs` | 👑 | Tạo (entityType, maxDays, autoLabelIds) |
| PATCH | `/recall-configs/:id` | 👑 | Update |
| DELETE | `/recall-configs/:id` | 👑 | Xóa |
| POST | `/recall-configs/run-now` | 👑 | Trigger cron ngay lập tức (debug) |

## 28. Import - `/imports`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| POST | `/imports/leads` | 👔 | Multipart CSV → enqueue BullMQ |
| POST | `/imports/customers` | 👔 | Multipart CSV |
| GET | `/imports` | 👔 | List job history |
| GET | `/imports/:id/status` | 👔 | Poll progress + errorFileUrl |

**CSV requirements:** UTF-8 BOM khuyến nghị (Excel VN), header row bắt buộc, streaming parse (`csv-parse`), progress update mỗi 100 rows. Parser accept cả **header tiếng Anh (camelCase) lẫn tiếng Việt** - khớp 1 trong 2 là OK.

### CSV - Leads (5 cols + metadata JSONB)

| Header VN | Header EN | Required | Ghi chú |
|---|---|---|---|
| Số điện thoại | `phone` | ✅ | Normalize VN (bỏ +84, thêm 0). `isValidVNPhone` check |
| Họ tên | `name` | ❌ | Fallback = phone nếu rỗng |
| Email | `email` | ❌ | |
| Nguồn | `source` | ❌ | Match `LeadSource.name` (case-insensitive). Nguồn có `skipPool=true` → lead vào `ZOOM` thay `POOL` |
| Sản phẩm | `product` | ❌ | Match `Product.name` (exact trước → substring fallback) |

- **Dedup:** `phone + sourceId + productId + deletedAt=null`. Trùng → error row `Trùng lead`
- **Auto-create customer** theo `phone` (hoặc reuse nếu đã có). Labels của customer merge sang lead mới
- **Metadata JSONB:** Mọi cột **không thuộc** 5 header trên (cả EN và VN) đều auto-map vào `lead.metadata` key=header, value=cell

### CSV - Customers (11 cols)

| Header VN | Header EN | Required | Ghi chú |
|---|---|---|---|
| Số điện thoại | `phone` | ✅ | |
| Họ tên | `name` | ✅ | Rỗng → error row |
| Email | `email` | ❌ | |
| Công ty | `companyName` | ❌ | |
| Facebook | `facebookUrl` | ❌ | |
| Instagram | `instagramUrl` | ❌ | |
| Zalo | `zaloUrl` | ❌ | |
| LinkedIn | `linkedinUrl` | ❌ | |
| Mô tả ngắn | `shortDescription` | ❌ | |
| Mô tả | `description` | ❌ | |
| Nhãn | `labels` | ❌ | Comma-separated (`"VIP,Quan tâm"`). Match case-insensitive với `Label.name`. **Lead = single label**: chỉ áp dụng nhãn đầu tiên resolvable, các nhãn còn lại + nhãn chưa có DB → ghi `[Warning]` vào error CSV, row vẫn **success** |

- **Dedup:** `phone + deletedAt=null`. Trùng → error row `Trùng khách hàng`
- **Template download:** FE sinh file `mau-import-khach-hang.csv` với BOM UTF-8 + 3 sample rows (full / chỉ bắt buộc / partial)

### Response - `GET /imports/:id/status`

```json
{
  "id": "123",
  "type": "customers",
  "status": "COMPLETED",   // PENDING | PROCESSING | COMPLETED | FAILED
  "totalRows": 500,
  "successCount": 487,
  "errorCount": 13,
  "errorFileUrl": "imports/errors/error-123.csv",  // null nếu không có error
  "fileName": "<uuid>.csv",
  "createdAt": "...",
  "completedAt": "..."
}
```

Error CSV columns: `row, field, message`. Warning rows (label không match) cũng xuất hiện ở đây với `field=general, message=[Warning] Nhãn "..." không tồn tại trong hệ thống - bỏ qua`.

## 29. Export - `/exports`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/exports/leads` | 👔 | CSV leads (formula-sanitized) |
| GET | `/exports/customers` | 👔 | CSV customers |
| GET | `/exports/orders` | 👔 | CSV orders |

## 30. File Upload - `/files`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| POST | `/files/upload` | 👤 | Upload (UUID filename, MIME + 10MB check) |
| GET | `/files/*` | 👤 | Stream file (JWT protected, path-traversal safe) |

## 31. Third-Party API - `/external`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| POST | `/external/leads` | 🔑 `x-api-key` | Tạo lead từ website/FB form (auto-create source, phone normalized) |

Xem chi tiết trong `api-integration-guide.md`.

## 32. MCP Agent - `/mcp` + `/ai-agent`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| POST | `/mcp` | 🔑 MCP key | Streamable HTTP transport (JSON-RPC 2.0) |
| GET | `/mcp` | 🔑 | Session re-attach |
| DELETE | `/mcp` | 🔑 | Terminate session |
| GET | `/ai-agent/leads` | 🔑 | REST fallback read-only |
| GET | `/ai-agent/leads/:id` | 🔑 | - |
| GET | `/ai-agent/customers` | 🔑 | - |
| GET | `/ai-agent/orders` | 🔑 | - |
| GET | `/ai-agent/stats` | 🔑 | - |

**MCP tools exposed (all read-only):** `get_schema`, leads, customers, orders, `list_products`, stats (`get_stats`, `get_revenue_trend`, `get_top_performers`, `get_dept_performance`, `get_team_performance`, `get_leads_by_source`, `get_conversion_trend`, `get_lead_aging`, `analyze_lead_quality`, `analyze_ads_effectiveness`), `list_users`, `get_reference_data` (lookup tables), `get_revenue_breakdown` (DT theo verify-status/nguồn/sale), `get_tier_distribution`, `get_tier_upgrades`.

**MCP permission scopes:** `mcp:*`, `mcp:leads:read`, `mcp:customers:read`, `mcp:orders:read`, `mcp:products:read`, `mcp:stats:read`, `mcp:users:read`, `mcp:reference:read`, `mcp:schema:read`.

## 33. API Keys - `/api-keys`

All 👑 SUPER_ADMIN only.

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api-keys` | List |
| POST | `/api-keys` | Tạo (response chứa plaintext key - 1 lần) |
| PATCH | `/api-keys/:id/deactivate` | - |
| PATCH | `/api-keys/:id/activate` | - |
| DELETE | `/api-keys/:id` | Xóa |

## 34. System Settings - `/system-settings`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/system-settings` | 👑 | All key-value |
| PUT | `/system-settings/:key` | 👑 | Upsert |

## 35. Search - `/search`

| Method | Path | Role | Mô tả |
|--------|------|------|-------|
| GET | `/search` | 👤 | Global FTS (leads + customers + orders + call_logs) qua GIN index |

## Next.js BFF Proxy

Browser KHÔNG gọi thẳng NestJS. Mọi request client-side đi qua:

```
GET /api/proxy/:path*  →  Next.js route handler
  → đọc httpOnly cookie `access_token`
  → forward tới NestJS :3010/api/v1/:path* với `Authorization: Bearer ...`
  → relay response
```

Điều này giải cross-origin cookie + giữ token ngoài JS scope (XSS-safe).

## Related Docs

- `system-architecture.md` - Module dependency graph + cron jobs
- `code-standards.md` - IDOR prevention, pagination, response format
- `api-integration-guide.md` - 3rd-party key integration chi tiết
- `business-flows.md` - Sequence diagram cho payment verify, lead lifecycle
