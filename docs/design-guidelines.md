# CRM-Custom - Design Guidelines

## 1. Design System

**Style:** Modern SaaS - Trustworthy, Vibrant, Polished, Dimensional, Enterprise-Ready
**Font:** Plus Jakarta Sans (400/500/600/700/800)
**Primary:** Sky Blue (#0ea5e9) | **Accent:** Cyan (#06b6d4)
**Visual DNA:** Sky-blue colored shadows, gradient text (sky→cyan), atmospheric blur orbs, hover lift cards

### Color Palette

```
PRIMARY (Indigo)
  --primary-50:  #eef2ff    ← background tint
  --primary-100: #e0e7ff    ← hover states
  --primary-200: #c7d2fe    ← borders, dividers
  --primary-300: #a5b4fc    ← secondary buttons
  --primary-400: #818cf8    ← icons, links
  --primary-500: #6366f1    ← accent
  --primary-600: #4f46e5    ← PRIMARY action buttons
  --primary-700: #4338ca    ← hover on primary buttons
  --primary-800: #3730a3    ← active/pressed
  --primary-900: #312e81    ← dark sections

SECONDARY (Violet)
  --secondary-600: #7c3aed  ← gradient end, accents
  --secondary-500: #8b5cf6  ← floating status, badges

NEUTRAL (Trắng + Slate)
  --white:       #ffffff
  --slate-50:    #f8fafc    ← page background
  --slate-100:   #f1f5f9    ← card background (light)
  --slate-200:   #e2e8f0    ← borders
  --slate-300:   #cbd5e1    ← disabled
  --slate-400:   #94a3b8    ← placeholder text
  --slate-500:   #64748b    ← secondary text
  --slate-700:   #334155    ← primary text
  --slate-900:   #0f172a    ← headings

STATUS COLORS
  --success:     #10b981    (emerald-500)  ← VERIFIED, CONVERTED, ACTIVE
  --warning:     #f59e0b    (amber-500)    ← PENDING, IN_PROGRESS
  --danger:      #ef4444    (red-500)      ← REJECTED, LOST
  --info:        #4f46e5    (indigo-600)   ← POOL, ASSIGNED
  --floating:    #8b5cf6    (violet-500)   ← FLOATING, kho thả nổi
  --inactive:    #94a3b8    (gray-400)     ← INACTIVE

DARK MODE
  --dark-bg:     #0f172a    ← slate-900
  --dark-card:   #1e293b    ← slate-800
  --dark-border: #334155    ← slate-700
  --dark-text:   #e2e8f0    ← slate-200
```

### Glassmorphism Tokens

```css
/* Subtle glass - dùng cho cards, sidebar, dialogs */
.glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

/* Dark mode glass */
.dark .glass {
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(51, 65, 85, 0.5);
}

/* Stronger glass - dùng cho sidebar, floating elements */
.glass-strong {
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
}

/* Glass card hover */
.glass-hover:hover {
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 8px 25px rgba(79, 70, 229, 0.1);
  transition: all 0.2s ease;
}
```

### Typography

```
Font: Inter (Google Fonts) - clean, professional, great VN support
Fallback: system-ui, -apple-system, sans-serif

Headings:
  h1: 24px / 700 / gray-900     ← page titles
  h2: 20px / 600 / gray-900     ← section titles
  h3: 16px / 600 / gray-700     ← card titles
  h4: 14px / 600 / gray-700     ← sub-sections

Body:
  base:  14px / 400 / gray-700  ← default text
  small: 12px / 400 / gray-500  ← helper text, timestamps
  tiny:  11px / 500 / gray-400  ← badges, labels

Monospace: JetBrains Mono - for IDs, codes, amounts
```

### Spacing & Radius

```
Spacing scale: 4px base
  xs: 4px   sm: 8px   md: 12px   lg: 16px   xl: 24px   2xl: 32px

Border radius:
  sm: 6px    ← buttons, inputs, badges
  md: 8px    ← cards, dropdowns
  lg: 12px   ← dialogs, panels
  xl: 16px   ← sidebar, main containers
  full: 9999px ← avatars, pills
```

---

## 2. Layout

### App Shell

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER (h=56px, glass-strong, fixed top)                     │
│ ┌────────┬──────────────────────┬───────────────────────────┐│
│ │ ☰ Logo │  🔍 Global Search    │ 🔔 3  👤 Nguyễn Văn A ▾ ││
│ └────────┴──────────────────────┴───────────────────────────┘│
├──────────┬───────────────────────────────────────────────────┤
│ SIDEBAR  │ MAIN CONTENT                                      │
│ (w=260px │ (padding: 24px, bg: gray-50)                     │
│  glass-  │                                                   │
│  strong) │  ┌─ Breadcrumbs ──────────────────────────────┐  │
│          │  │ Trang chủ > Leads > Chi tiết               │  │
│ ┌──────┐ │  └────────────────────────────────────────────┘  │
│ │ Nav  │ │                                                   │
│ │ items│ │  ┌─ Page Content ─────────────────────────────┐  │
│ │      │ │  │                                            │  │
│ │ 🏠   │ │  │  (varies per page)                         │  │
│ │ 📋   │ │  │                                            │  │
│ │ 🌊   │ │  │                                            │  │
│ │ 👥   │ │  │                                            │  │
│ │ 🛒   │ │  └────────────────────────────────────────────┘  │
│ │ 📦   │ │                                                   │
│ │ 📞   │ │                                                   │
│ │ ⚙️   │ │                                                   │
│ │ 📥   │ │                                                   │
│ └──────┘ │                                                   │
│          │                                                   │
│ ┌──────┐ │                                                   │
│ │ User │ │                                                   │
│ │ card │ │                                                   │
│ └──────┘ │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

### Sidebar Navigation

```
SIDEBAR (glass-strong, border-right: 1px solid primary-200)

  ┌─────────────────────┐
  │  🔷 CRM V4          │  ← Logo + collapse button
  ├─────────────────────┤
  │                     │
  │  🏠 Trang chủ       │  ← Dashboard (all users)
  │                     │
  │  ── QUẢN LÝ ──     │  ← Section divider
  │  📋 Leads           │  ← Submenu: Danh sách, Kho mới*, Kho PB, Kanban
  │  🌊 Kho thả nổi    │  ← Floating pool (all users)
  │  👥 Khách hàng      │  ← Customer search
  │  🛒 Đơn hàng       │  ← Orders list
  │  📦 Sản phẩm       │  ← Products (manager+)
  │                     │
  │  ── TỔNG ĐÀI ──    │
  │  📞 Cuộc gọi       │  ← Call logs
  │                     │
  │  ── HỆ THỐNG ──    │  ← Visible to manager+
  │  📥 Nhập dữ liệu   │  ← CSV import (manager+)
  │  ⚙️ Cài đặt        │  ← Settings (manager+)
  │                     │
  ├─────────────────────┤
  │  👤 Nguyễn Văn A    │  ← User card at bottom
  │     Sale · Sales    │
  │     [Đăng xuất]     │
  └─────────────────────┘

  * Kho mới: chỉ manager+ thấy menu item này
  * Leads submenu expand khi click
  * Active state: primary-100 bg + primary-500 left border (3px)
  * Hover: primary-50 bg
  * Collapsed mode (mobile): chỉ hiện icons, w=64px
```

---

## 3. Page Designs

### 3.1 Login Page

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│              bg: gradient primary-50 → white                 │
│                                                              │
│          ┌─────────────────────────────┐                     │
│          │   glass card (w=400px)      │                     │
│          │                             │                     │
│          │   🔷 CRM V4                 │                     │
│          │   Đăng nhập hệ thống       │                     │
│          │                             │                     │
│          │   ┌─ Email ──────────────┐  │                     │
│          │   │ admin@crm.local      │  │                     │
│          │   └──────────────────────┘  │                     │
│          │                             │                     │
│          │   ┌─ Mật khẩu ──────────┐  │                     │
│          │   │ ••••••••         👁  │  │                     │
│          │   └──────────────────────┘  │                     │
│          │                             │                     │
│          │   [  Đăng nhập  ] ← primary │                     │
│          │                             │                     │
│          │   ⚠ Email hoặc mật khẩu    │                     │
│          │     không đúng              │                     │
│          │                             │                     │
│          └─────────────────────────────┘                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Dashboard (Trang chủ)

```
┌──────────────────────────────────────────────────────────────┐
│ Breadcrumb: Trang chủ                                        │
│                                                              │
│ ┌── KPI Cards (glass, 5 columns) ───────────────────────────┐│
│ │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────┐││
│ │ │📊 Leads │ │📈 Tỉ lệ │ │💰Doanh  │ │🔄 Đang  │ │🌊Thả││
│ │ │  mới    │ │  chuyển  │ │  thu    │ │  xử lý  │ │ nổi ││
│ │ │         │ │  đổi    │ │         │ │         │ │     ││
│ │ │  156    │ │  23.5%  │ │ 1.2 tỷ  │ │   45    │ │  12 ││
│ │ │ ↑12%    │ │ ↑2.1%   │ │ ↑18%    │ │ ↓3     │ │ ↓5  ││
│ │ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └──────┘││
│ └────────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Row 2 ──────────────────────────────────────────────────┐│
│ │ ┌─ Conversion Funnel (glass) ─┐ ┌─ Revenue Chart (glass)─┐││
│ │ │                              │ │                        │││
│ │ │  POOL ████████████ 156      │ │  📈 Line chart         │││
│ │ │  ASSIGNED █████████ 89      │ │     Jan-Mar revenue    │││
│ │ │  IN_PROGRESS █████ 45       │ │     by period          │││
│ │ │  CONVERTED ███ 23           │ │                        │││
│ │ │  LOST ██ 12                 │ │  [Ngày|Tuần|Tháng]    │││
│ │ │                              │ │                        │││
│ │ └──────────────────────────────┘ └────────────────────────┘││
│ └────────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Row 3 ──────────────────────────────────────────────────┐│
│ │ ┌─ Sales Ranking (glass) ─────┐ ┌─ Source Chart (glass) ─┐││
│ │ │                              │ │                        │││
│ │ │ 🥇 Bình   45 leads  32% CR │ │  📊 Bar chart          │││
│ │ │ 🥈 Cường  38 leads  28% CR │ │     leads by source    │││
│ │ │ 🥉 Mai    32 leads  25% CR │ │                        │││
│ │ │ 4. Hùng   28 leads  22% CR │ │  Website ████████ 56   │││
│ │ │ 5. Dũng   25 leads  20% CR │ │  Facebook █████ 34     │││
│ │ │                              │ │  Referral ███ 22       │││
│ │ └──────────────────────────────┘ └────────────────────────┘││
│ └────────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌─ Period Filter ───────────────────────────────────────────┐│
│ │ [Hôm nay] [7 ngày] [30 ngày] [90 ngày] [📅 Tuỳ chọn]   ││
│ │ Phòng ban: [Tất cả ▾]                                    ││
│ └────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### 3.3 Lead List Page

```
┌──────────────────────────────────────────────────────────────┐
│ Breadcrumb: Leads > Danh sách                                │
│                                                              │
│ ┌── Toolbar (glass) ────────────────────────────────────────┐│
│ │ 🔍 [Tìm kiếm tên, SĐT...]  [Trạng thái ▾] [Nguồn ▾]   ││
│ │ [Phòng ban ▾] [Ngày ▾]       [📋 Bảng] [📊 Kanban]      ││
│ │                                                            ││
│ │ ☑ 3 đã chọn  [Gán ▾] [Chuyển ▾] [Xuất CSV]  [+ Tạo mới]││
│ └────────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Data Table (glass) ─────────────────────────────────────┐│
│ │ ☐ │ Tên          │ SĐT        │Trạng thái│Nguồn   │Sale  ││
│ │───┼──────────────┼────────────┼──────────┼────────┼──────││
│ │ ☐ │ Trần Thị B   │ 090 123 45 │🟡ASSIGNED│Website │Bình  ││
│ │ ☑ │ Lê Văn C     │ 098 765 43 │🔵POOL    │Facebook│ -    ││
│ │ ☐ │ Phạm Thị D   │ 091 234 56 │🟠IN_PROG │Referral│Cường ││
│ │ ☐ │ Nguyễn E     │ 097 654 32 │🟢CONVERT │Website │Mai   ││
│ │ ☐ │ Hoàng F      │ 093 456 78 │🔴LOST    │ColdCall│Hùng  ││
│ │ ☐ │ Vũ Thị G     │ 096 543 21 │🟣FLOAT   │Event   │ -    ││
│ │                                                            ││
│ │ Hiển thị 1-20 / 156          [← Trước] [Tiếp →]          ││
│ └────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘

Status badges (pill shape, subtle bg):
  🔵 POOL:        bg-sky-100     text-sky-700     border-sky-200
  🟡 ASSIGNED:    bg-amber-100   text-amber-700   border-amber-200
  🟠 IN_PROGRESS: bg-orange-100  text-orange-700  border-orange-200
  🟢 CONVERTED:   bg-emerald-100 text-emerald-700 border-emerald-200
  🔴 LOST:        bg-red-100     text-red-700     border-red-200
  🟣 FLOATING:    bg-violet-100  text-violet-700  border-violet-200
```

### 3.4 Lead Detail Page

```
┌──────────────────────────────────────────────────────────────┐
│ Breadcrumb: Leads > Trần Thị B                               │
│                                                              │
│ ┌── Header (glass) ─────────────────────────────────────────┐│
│ │ 👤 Trần Thị B              🟡 ASSIGNED                    ││
│ │ 📱 090 123 4567  ✉ b@email.com                            ││
│ │ 🏢 Sales · Sale Bình       📦 Gói Premium                 ││
│ │ 🏷 [Hot Lead] [VIP]                                       ││
│ │                                                            ││
│ │ [✏ Sửa] [📤 Chuyển] [🔄 Đổi trạng thái ▾]              ││
│ └────────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Tabs ────────────────────────────────────────────────────┐│
│ │ [Timeline] [Đơn hàng] [Thanh toán] [Tài liệu] [Cuộc gọi]││
│ └────────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Timeline Tab (glass) ───────────────────────────────────┐│
│ │                                                            ││
│ │  ┌─ Add Note ───────────────────────────────────────────┐ ││
│ │  │ [Nhập ghi chú...                              ] [Gửi]│ ││
│ │  └──────────────────────────────────────────────────────┘ ││
│ │                                                            ││
│ │  ● 14:30 hôm nay - 📝 Ghi chú (Sale Bình)               ││
│ │  │  "Khách quan tâm gói Premium, hẹn gọi lại thứ 5"     ││
│ │  │                                                        ││
│ │  ● 10:00 hôm nay - 📞 Cuộc gọi đi (5p30s)              ││
│ │  │  Auto-matched · Gọi tư vấn lần đầu                    ││
│ │  │                                                        ││
│ │  ● 09:05 hôm nay - 🔄 Trạng thái                        ││
│ │  │  POOL → ASSIGNED (auto, template "Chia Team A")        ││
│ │  │                                                        ││
│ │  ● 09:00 hôm nay - ➕ Tạo mới                            ││
│ │  │  Lead tạo từ CSV Import                                ││
│ │  │                                                        ││
│ │  [Xem thêm...]                                            ││
│ └────────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Sidebar Info (glass, right panel on desktop) ───────────┐│
│ │ KHÁCH HÀNG LIÊN KẾT                                       ││
│ │ 👤 Trần Thị B                                             ││
│ │ 📱 090 123 4567                                            ││
│ │ Leads: 2 (1 CONVERTED, 1 đang xử lý)                     ││
│ │ [Xem chi tiết →]                                          ││
│ │                                                            ││
│ │ NHÃN                                                       ││
│ │ [Hot Lead ×] [VIP ×] [+ Thêm nhãn]                       ││
│ │                                                            ││
│ │ LỊCH SỬ GÁN                                               ││
│ │ 09:05 → Bình (template)                                   ││
│ └────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### 3.5 Kanban Board

```
┌──────────────────────────────────────────────────────────────┐
│ Breadcrumb: Leads > Kanban                                    │
│ Filters: [Phòng ban ▾] [Ngày ▾]                             │
│                                                              │
│ ┌─POOL──────┐┌─ASSIGNED───┐┌─IN_PROGRESS─┐┌─CONVERTED─┐┌─LOST─┐
│ │ 🔵 23     ││ 🟡 15      ││ 🟠 8        ││ 🟢 45     ││🔴 12│
│ │           ││            ││             ││           ││     │
│ │┌─────────┐││┌─────────┐ ││┌─────────┐  ││           ││     │
│ ││Trần B   ││││Lê C     │ ││|Phạm D   │  ││           ││     │
│ ││090xxx   ││││098xxx   │ ││|091xxx   │  ││           ││     │
│ ││Website  ││││Facebook │ ││|Referral │  ││           ││     │
│ ││[Hot]    ││││         │ ││|👤Cường  │  ││           ││     │
│ │└─────────┘││└─────────┘ ││└─────────┘  ││           ││     │
│ │┌─────────┐││            ││             ││           ││     │
│ ││Nguyễn E ││││            ││             ││           ││     │
│ ││097xxx   ││││            ││             ││           ││     │
│ │└─────────┘││            ││             ││           ││     │
│ └───────────┘└────────────┘└─────────────┘└───────────┘└─────┘
│                                                              │
│  Drag & drop cards between columns to change status          │
│  Card: glass-hover effect on drag                            │
└──────────────────────────────────────────────────────────────┘

Kanban card (glass, w=240px):
  ┌──────────────────────┐
  │ Trần Thị B           │  ← name, font-medium
  │ 📱 090 123 4567      │  ← phone, text-sm gray-500
  │ 📦 Gói Premium       │  ← product, text-sm
  │ 🏷 [Hot] [VIP]       │  ← labels, tiny pills
  │ 👤 Bình · 2 ngày trước│ ← assigned + time
  └──────────────────────┘
```

### 3.6 Kho Thả Nổi (Floating Pool)

```
┌──────────────────────────────────────────────────────────────┐
│ Breadcrumb: Kho thả nổi                                      │
│                                                              │
│ ┌── Header ─────────────────────────────────────────────────┐│
│ │ 🌊 Kho thả nổi                                            ││
│ │ Leads và khách hàng chờ được nhận                         ││
│ │                                                            ││
│ │ Tabs: [Leads (12)] [Khách hàng (5)]                       ││
│ └────────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Grid Cards (glass-hover) ───────────────────────────────┐│
│ │                                                            ││
│ │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐        ││
│ │ │ 🟣 FLOATING   │ │ 🟣 FLOATING   │ │ 🟣 FLOATING   │        ││
│ │ │              │ │              │ │              │        ││
│ │ │ Lê Văn C     │ │ Hoàng F      │ │ Vũ Thị G     │        ││
│ │ │ 098 765 4321 │ │ 093 456 7890 │ │ 096 543 2100 │        ││
│ │ │ Facebook     │ │ Cold Call    │ │ Event        │        ││
│ │ │              │ │              │ │              │        ││
│ │ │ 🏷[Thu hồi]  │ │ 🏷[Cần xử lý]│ │ 🏷[Thu hồi]  │        ││
│ │ │              │ │              │ │              │        ││
│ │ │ Trước: Sales │ │ Trước: Supp  │ │ Trước: Mktg  │        ││
│ │ │ 5 ngày trước │ │ 3 ngày trước │ │ 1 ngày trước │        ││
│ │ │              │ │              │ │              │        ││
│ │ │ [🤚 Nhận]   │ │ [🤚 Nhận]   │ │ [🤚 Nhận]   │        ││
│ │ └──────────────┘ └──────────────┘ └──────────────┘        ││
│ │                                                            ││
│ └────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘

Floating card: glass + violet-100 left border (4px)
"Nhận" button: primary-500, on click → claim, lead về kho cá nhân
```

### 3.7 Customer Detail

```
┌──────────────────────────────────────────────────────────────┐
│ Breadcrumb: Khách hàng > Trần Thị B                          │
│                                                              │
│ ┌── Header (glass) ─────────────────────────────────────────┐│
│ │ 👤 Trần Thị B              🟢 ACTIVE                      ││
│ │ 📱 090 123 4567  ✉ b@email.com                            ││
│ │ 🏢 Support · NV Dũng                                      ││
│ │ 🏷 [VIP] [Đã mua] [Cần follow]                           ││
│ │                                                            ││
│ │ [✏ Sửa] [📤 Chuyển ▾] [😴 Hoàn tất]                     ││
│ │  Chuyển menu: [Phòng ban khác] [Kho thả nổi]             ││
│ │  Hoàn tất: → INACTIVE, ẩn khỏi kho                       ││
│ └────────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Tabs ────────────────────────────────────────────────────┐│
│ │ [Leads (3)] [Đơn hàng (1)] [Thanh toán (2)] [Timeline]    ││
│ │ [Tài liệu (2)] [Cuộc gọi (5)]                            ││
│ └────────────────────────────────────────────────────────────┘│
│                                                              │
│ ┌── Leads Tab (glass) ──────────────────────────────────────┐│
│ │                                                            ││
│ │  #101 Gói Premium    🟢 CONVERTED   Sale Bình   01/03/26  ││
│ │  #156 Gói VIP        🟠 IN_PROGRESS Sale Mai    15/03/26  ││
│ │  #200 Gia hạn        🔵 POOL        -           25/03/26  ││
│ │                                                            ││
│ └────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### 3.8 Payment Verification Page (Manager)

```
┌──────────────────────────────────────────────────────────────┐
│ Breadcrumb: Đơn hàng > Chờ xác minh                          │
│                                                              │
│ ┌── Split View ─────────────────────────────────────────────┐│
│ │                                                            ││
│ │ LEFT: Payments PENDING          RIGHT: Bank TX UNMATCHED  ││
│ │                                                            ││
│ │ ┌─────────────────────┐        ┌─────────────────────┐    ││
│ │ │ 💰 Payment #320     │   ↔    │ 🏦 Bank TX #501     │    ││
│ │ │ 5.000.000đ          │  drag  │ 5.000.000đ          │    ││
│ │ │ "PHAM THI D CK LAN1"│  to    │ "PHAM THI D CK LAN1"│    ││
│ │ │ CK lần 1            │  match │ 14:30 27/03/2026    │    ││
│ │ │ Sale: Hùng           │        │ VCB → CRM           │    ││
│ │ │                     │        │                     │    ││
│ │ │ [✅ Verify] [❌ Reject]│       │ [🔗 Ghép thủ công]  │    ││
│ │ └─────────────────────┘        └─────────────────────┘    ││
│ │                                                            ││
│ │ ┌─────────────────────┐        ┌─────────────────────┐    ││
│ │ │ 💰 Payment #322     │        │ 🏦 Bank TX #505     │    ││
│ │ │ 5.000.000đ          │        │ 5.000.000đ          │    ││
│ │ │ "PHAM THI D CK LAN3"│        │ "PHAM D LAN3"       │    ││
│ │ │ CK lần 3            │        │ 09:15 27/03/2026    │    ││
│ │ │ ⚠ Chưa match        │        │ ⚠ Content khác      │    ││
│ │ └─────────────────────┘        └─────────────────────┘    ││
│ │                                                            ││
│ └────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘

Match action: drag bank TX → payment card, hoặc click "Ghép thủ công"
→ confirm dialog → verify payment
```

### 3.9 Settings Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Breadcrumb: Cài đặt > Người dùng                             │
│                                                              │
│ ┌── Settings Sidebar ──┬─ Content ──────────────────────────┐│
│ │ (glass, w=220px)     │                                    ││
│ │                      │ ┌── Toolbar ──────────────────────┐││
│ │ 👥 Người dùng        │ │ 🔍 [Tìm kiếm...]  [+ Thêm mới]│││
│ │ 👥 Teams             │ └─────────────────────────────────┘││
│ │ 🏢 Phòng ban         │                                    ││
│ │ 📊 Cấp bậc          │ ┌── Table (glass) ────────────────┐││
│ │ 📋 Nguồn lead       │ │ Tên     │Email    │Vai trò│PB   │││
│ │ 💳 Loại thanh toán   │ │─────────┼─────────┼───────┼─────│││
│ │ 🏷 Nhãn             │ │ Bình    │b@crm   │User   │Sales│││
│ │ 📦 Sản phẩm         │ │ Cường   │c@crm   │User   │Sales│││
│ │ 📁 Danh mục SP      │ │ Mai     │m@crm   │Mgr    │Mktg │││
│ │ 🔑 API Keys         │ └─────────────────────────────────┘││
│ │ 📋 Templates chia số │                                    ││
│ │ ⏰ Cấu hình thu hồi │ ┌── Edit Sheet (glass, slide-in) ─┐││
│ │ ⚙ Phân phối AI      │ │ ✏ Sửa người dùng               │││
│ │                      │ │ Tên: [Bình]                     │││
│ │                      │ │ Email: [b@crm.local]            │││
│ │                      │ │ Vai trò: [User ▾]               │││
│ │                      │ │ Phòng ban: [Sales ▾]            │││
│ │                      │ │ Team: [Team A ▾]                │││
│ │                      │ │ Cấp bậc: [Senior ▾]            │││
│ │                      │ │                                  │││
│ │                      │ │ [Huỷ] [Lưu]                     │││
│ │                      │ └──────────────────────────────────┘││
│ └──────────────────────┴─────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Component Patterns

### Status Badges

```
Pill shape, subtle background, no bold border:

  POOL         bg-sky-100    text-sky-700
  ASSIGNED     bg-amber-100  text-amber-700
  IN_PROGRESS  bg-orange-100 text-orange-700
  CONVERTED    bg-emerald-100 text-emerald-700
  LOST         bg-red-100    text-red-700
  FLOATING     bg-violet-100 text-violet-700
  ACTIVE       bg-emerald-100 text-emerald-700
  INACTIVE     bg-gray-100   text-gray-500
  PENDING      bg-amber-100  text-amber-700
  VERIFIED     bg-emerald-100 text-emerald-700
  REJECTED     bg-red-100    text-red-700
```

### Glass Card

```
Default: glass + rounded-lg + p-4
Hover: glass-hover (brighter bg + subtle primary shadow)
Active/Selected: border-primary-300 + bg-primary-50/30
Clickable: cursor-pointer + hover transform translateY(-1px)
```

### Data Table

```
Header: bg-gray-50/80 + text-sm font-medium text-gray-500 + sticky top
Row: glass bg + hover:bg-primary-50/30 + border-b border-gray-100
Selected row: bg-primary-50 + border-l-3 border-primary-500
Pagination: bottom, cursor-based [← Trước] [Tiếp →]
Empty state: centered icon + text "Không có dữ liệu"
```

### Forms (Sheet/Dialog)

```
Sheet (slide-in from right): glass-strong + w-[400px] + shadow-xl
Dialog (centered modal): glass-strong + max-w-md + rounded-xl
Input: bg-white + border-gray-200 + focus:border-primary-400 + focus:ring-primary-100
Select: shadcn Select with glass dropdown
Button primary: bg-primary-500 + hover:bg-primary-600 + text-white + rounded-md
Button secondary: bg-white + border-gray-200 + hover:bg-gray-50 + text-gray-700
Button danger: bg-red-50 + text-red-600 + hover:bg-red-100
```

### Timeline

```
Vertical line: border-l-2 border-gray-200 (left side)
Node: 8px circle on the line
  Note: bg-primary-400
  Call: bg-emerald-400
  Status change: bg-amber-400
  Assignment: bg-violet-400
  System: bg-gray-400
Content: glass card, ml-4 from line
Time: text-xs text-gray-400, above content
```

---

## 5. Responsive Strategy - Breakpoints & Rules

### Breakpoints (Tailwind 4)

```
xs:   320px   ← iPhone SE, small Android
sm:   640px   ← Large phone landscape
md:   768px   ← iPad Mini portrait
lg:   1024px  ← iPad Pro portrait, tablet landscape
xl:   1280px  ← Laptop
2xl:  1536px  ← Desktop
3xl:  1920px  ← Large desktop
```

### Global Rules

```
Touch targets:     min 44x44px trên mobile/tablet (WCAG 2.5.5)
Font size:         min 14px body, min 12px secondary (không dùng <11px trên mobile)
Spacing:           reduce 1 level trên mobile (lg→md, md→sm)
Glass effect:      giảm blur trên mobile (12px→8px) để tăng performance
Backdrop-filter:   fallback bg-white/90 cho browser không hỗ trợ
Scroll:            -webkit-overflow-scrolling: touch cho smooth scroll
Safe areas:        padding-bottom cho iPhone notch (env(safe-area-inset-bottom))
Orientation:       hỗ trợ cả portrait + landscape
```

### Layout theo Breakpoint

```
┌──────────┬────────────┬────────────┬────────────┬────────────┐
│          │  Mobile    │  Tablet    │  Laptop    │  Desktop   │
│          │  <768px    │  768-1279  │  1280-1535 │  ≥1536     │
├──────────┼────────────┼────────────┼────────────┼────────────┤
│ Sidebar  │ Overlay    │ Overlay    │ Fixed 260px│ Fixed 260px│
│          │ full-width │ 260px      │ collapsible│            │
│          │ hamburger  │ hamburger  │ to 64px    │            │
├──────────┼────────────┼────────────┼────────────┼────────────┤
│ Header   │ 48px       │ 52px       │ 56px       │ 56px       │
│          │ compact    │            │            │            │
├──────────┼────────────┼────────────┼────────────┼────────────┤
│ Content  │ px-3       │ px-4       │ px-6       │ px-6       │
│ padding  │ py-3       │ py-4       │ py-6       │ py-6       │
├──────────┼────────────┼────────────┼────────────┼────────────┤
│ Grid     │ 1 col      │ 2 col      │ 3-4 col    │ 4-5 col    │
│ columns  │            │            │            │            │
├──────────┼────────────┼────────────┼────────────┼────────────┤
│ Tables   │ Card view  │ Scroll     │ Full table │ Full table │
│          │ OR scroll  │ horizontal │            │            │
├──────────┼────────────┼────────────┼────────────┼────────────┤
│ Forms    │ Bottom     │ Right      │ Right      │ Right      │
│          │ sheet full │ sheet 400px│ sheet 400px│ sheet 480px│
├──────────┼────────────┼────────────┼────────────┼────────────┤
│ Dialogs  │ Full screen│ Centered   │ Centered   │ Centered   │
│          │ bottom-up  │ max-w-md   │ max-w-md   │ max-w-lg   │
└──────────┴────────────┴────────────┴────────────┴────────────┘
```

---

## 6. Responsive per Page

### 6.1 Login

```
Desktop:     Centered card w-400px, gradient bg
Tablet:      Centered card w-400px
Mobile:      Full-width card, px-4, no gradient (solid primary-50 bg)
             Input/button height: 48px (touch-friendly)
```

### 6.2 Dashboard

```
Desktop (≥1280px):
  KPI cards: 5 columns (grid-cols-5)
  Charts: 2 columns (funnel + revenue | ranking + source)
  Filter bar: inline

Tablet (768-1279px):
  KPI cards: 3 columns top row + 2 bottom (grid-cols-3 + grid-cols-2)
  Charts: 1 column stack
  Filter bar: inline

Mobile (<768px):
  KPI cards: horizontal scroll snap (scroll-x, snap-x mandatory)
    → Swipe left/right, mỗi card w-[70vw], gap-3
    → Dots indicator bên dưới
  Charts: 1 column stack, full width
  Funnel: horizontal bars (không đổi)
  Revenue chart: full width, height giảm 200px→160px
  Ranking: card list thay vì table
  Filter bar: collapsible (icon button → expand)
  Period buttons: horizontal scroll
```

### 6.3 Lead List

```
Desktop:
  Full data table, all columns visible
  Toolbar: single row (search + filters + actions)
  Bulk actions: inline toolbar

Tablet:
  Table: hide columns (source, created date) - show on row expand
  Toolbar: 2 rows (search | filters + actions)

Mobile (<768px):
  *** SWITCH TO CARD VIEW (không dùng table) ***
  Mỗi lead = 1 card:
  ┌────────────────────────────────┐
  │ Trần Thị B         🟡ASSIGNED │
  │ 📱 090 123 4567               │
  │ 📦 Gói Premium · Website      │
  │ 👤 Bình · 2 ngày trước        │
  │ 🏷 [Hot] [VIP]                │
  └────────────────────────────────┘
  → Tap card → navigate to detail
  → Long press → select mode (bulk)
  → Filters: bottom sheet (slide up)
  → Search: sticky top, expands on focus
  → FAB (floating action button): + Tạo mới (bottom-right, 56px)
  → Pagination: infinite scroll (load more on scroll bottom)
```

### 6.4 Lead Detail

```
Desktop (≥1280px):
  2-column layout:
  ┌─────────────────────┬──────────────┐
  │ Main content (65%)  │ Side panel   │
  │ Header + Tabs       │ Customer     │
  │ Timeline/Orders/... │ Labels       │
  │                     │ Assignment   │
  └─────────────────────┴──────────────┘

Tablet (768-1279px):
  1 column, side panel collapsed into tab "Thông tin"
  Tabs: scrollable horizontal

Mobile (<768px):
  1 column, full width
  Header: compact (name + status + phone trên 2 dòng)
  Action buttons: fixed bottom bar (glass)
  ┌────────────────────────────────┐
  │ [✏ Sửa] [📤 Chuyển] [⋯ More]│
  └────────────────────────────────┘
  Tabs: scrollable horizontal, sticky below header
  Timeline: full width, reduced padding
  Add note: sticky bottom input (like chat)
  ┌────────────────────────────────┐
  │ [Nhập ghi chú...       ] [Gửi]│
  └────────────────────────────────┘
```

### 6.5 Kanban

```
Desktop:
  5 columns side-by-side, drag & drop
  Column min-width: 240px

Tablet landscape:
  5 columns, tighter spacing (200px each)

Tablet portrait:
  3 columns visible, horizontal scroll for rest
  Snap to column on scroll

Mobile (<768px):
  *** SINGLE COLUMN VIEW with tab switcher ***
  Tab bar: [Pool 23] [Assigned 15] [In Progress 8] [Converted 45] [Lost 12]
  → Swipe left/right to switch columns
  → OR horizontal scroll with snap
  → Cards: full width, stacked vertically
  → Drag disabled on mobile → tap card → status change via action sheet

  Action sheet (bottom) khi tap card:
  ┌────────────────────────────────┐
  │ Trần Thị B                    │
  │ ─────────────────────────────  │
  │ 📋 Xem chi tiết               │
  │ 🔄 Chuyển sang Assigned       │
  │ 🔄 Chuyển sang In Progress    │
  │ 👤 Gán cho...                 │
  │ ❌ Huỷ                        │
  └────────────────────────────────┘
```

### 6.6 Kho Thả Nổi

```
Desktop:   Grid 4 columns (grid-cols-4)
Tablet:    Grid 2 columns (grid-cols-2)
Mobile:    Grid 1 column, full width cards
           "Nhận" button: full width, h-48px, primary color
           Swipe right on card → quick claim (optional gesture)
```

### 6.7 Customer Detail

```
Desktop:   Same as Lead Detail (2 columns)
Tablet:    1 column, tabs scrollable
Mobile:    1 column
  Tabs: 6 tabs → scrollable horizontal
  "Hoàn tất" button: trong overflow menu (⋯)
  Transfer: bottom action sheet với 3 options
  ┌────────────────────────────────┐
  │ Chuyển khách hàng             │
  │ ─────────────────────────────  │
  │ 🏢 Chuyển phòng ban khác     │
  │ 🌊 Chuyển kho thả nổi        │
  │ 😴 Đánh dấu hoàn tất         │
  │ ❌ Huỷ                        │
  └────────────────────────────────┘
```

### 6.8 Payment Verification

```
Desktop (≥1280px):
  Split view: left (Payments) | right (Bank TX)
  Drag bank TX → payment to match

Tablet (768-1279px):
  Split view: stacked tabs
  [Tab: Chờ xác minh (5)] [Tab: Giao dịch ngân hàng (8)]
  Tap bank TX → select → tap payment → "Ghép" button appears

Mobile (<768px):
  *** TAB VIEW (không split) ***
  Tab 1: Payments PENDING (card list)
  Tab 2: Bank TX UNMATCHED (card list)

  Flow ghép thủ công:
  1. Ở tab Bank TX → tap chọn 1 TX → badge "Đã chọn 1"
  2. Chuyển sang tab Payments → tap payment → confirm dialog

  Verify button: trong card, full width
  ┌────────────────────────────────┐
  │ 💰 Payment #320               │
  │ 5.000.000đ · CK lần 1        │
  │ "PHAM THI D CK LAN 1"        │
  │ Sale: Hùng                    │
  │                                │
  │ [✅ Xác minh] [❌ Từ chối]    │
  └────────────────────────────────┘
```

### 6.9 Settings

```
Desktop:
  Secondary sidebar (220px) + content area
  Table + sheet edit form (right slide-in)

Tablet:
  Secondary sidebar collapses to horizontal tabs at top
  [Người dùng] [Teams] [Phòng ban] [Cấp bậc] [...]
  Scrollable horizontal tabs

Mobile (<768px):
  Settings home: list of menu items (full page)
  ┌────────────────────────────────┐
  │ ⚙ Cài đặt                     │
  │ ──────────────────────────     │
  │ 👥 Người dùng            →    │
  │ 👥 Teams                 →    │
  │ 🏢 Phòng ban             →    │
  │ 📊 Cấp bậc               →    │
  │ 📋 Nguồn lead            →    │
  │ 💳 Loại thanh toán       →    │
  │ 🏷 Nhãn                  →    │
  │ 📦 Sản phẩm              →    │
  │ 📁 Danh mục SP           →    │
  │ 🔑 API Keys              →    │
  │ 📋 Templates chia số     →    │
  │ ⏰ Cấu hình thu hồi      →    │
  │ ⚙ Phân phối AI           →    │
  └────────────────────────────────┘
  Tap → navigate to sub-page (full screen)
  Table → card view (same as lead list mobile)
  Edit form: full-screen page (not sheet)
  Back button: top-left arrow
```

---

## 7. Mobile-Specific Patterns

### Bottom Navigation (alternative to sidebar on mobile)

```
Nếu sidebar overlay quá nặng, có thể dùng bottom nav bar:

┌─────────────────────────────────────────┐
│                                         │
│           Main Content                  │
│                                         │
├─────────────────────────────────────────┤
│  🏠    📋    🌊    👥    ⋯             │
│ Home  Leads  Float  KH   More          │
└─────────────────────────────────────────┘

"More" mở bottom sheet với: Đơn hàng, Sản phẩm, Cuộc gọi, Nhập dữ liệu, Cài đặt

Đề xuất: dùng SIDEBAR OVERLAY (nhất quán desktop/mobile)
Bottom nav chỉ khi user feedback cần.
```

### Pull-to-Refresh

```
Tất cả list pages trên mobile: pull down → refresh data
Animation: primary-500 spinner
```

### Swipe Gestures

```
Lead/Customer card in list:
  Swipe right → quick action (claim / assign)
  Swipe left → secondary action (transfer / archive)

Notification item:
  Swipe right → mark as read
  Swipe left → dismiss
```

### Offline Indicator

```
Khi mất kết nối:
  Top banner: "Mất kết nối mạng" (bg-amber-100, text-amber-700)
  Disable mutation buttons (gray out)
  Cache list data với stale indicator
```

---

## 8. Animation & Micro-interactions

```
Page transitions: none (instant, SPA feel)
Sidebar collapse: w transition 200ms ease
Card hover: translateY(-1px) + shadow, 150ms (desktop only, disabled touch)
Button click: scale(0.98), 100ms
Toast: slide-in from top-right (desktop) / top-center (mobile), 300ms
Sheet open: slide-in from right (desktop) / bottom (mobile), 200ms
Dialog open: fade + scale(0.95→1) desktop / slide-up mobile, 150ms
Kanban drag: opacity(0.8) + rotate(2deg) + shadow-lg (desktop only)
Status change: badge color transition 200ms
Loading skeleton: shimmer animation (bg gradient slide)
Pull-to-refresh: spring animation, primary spinner
Infinite scroll: fade-in new items, 150ms
Bottom sheet: spring physics animation (velocity-based)
```

---

## 9. Accessibility

```
WCAG 2.1 AA compliance:
  Color contrast: ≥4.5:1 text, ≥3:1 large text + UI components
  Focus visible: ring-2 ring-primary-400 ring-offset-2
  Keyboard navigation: all interactive elements focusable
  Screen reader: proper ARIA labels on all buttons/icons
  Skip to content: hidden link at top of page
  Reduced motion: @media (prefers-reduced-motion) → disable animations
  Touch targets: min 44x44px
  Error messages: associated with inputs via aria-describedby
  Status badges: text label (not color alone) for color-blind users
```
