# Use-Case Specification - CRM-Custom

> Mô tả actor + use-case chính, suy ra từ code thật (`apps/api/src/modules`, `apps/web/src/app`).
> Phân quyền: xem chi tiết ở `CLAUDE.md` -> "Role Permissions".

## Actors

| Actor | Mô tả | Phạm vi data |
|---|---|---|
| **SUPER_ADMIN** | Quản trị hệ thống toàn quyền | Tất cả + cấu hình hệ thống |
| **MANAGER** | Quản lý nghiệp vụ, gần như super admin | Tất cả data (không scope theo phòng ban), trừ system config |
| **LEADER** | Trưởng nhóm, tự phục vụ như USER | Data của chính mình + đơn hàng cả team |
| **USER (Sale)** | Nhân viên bán hàng | Chỉ data assigned/tạo bởi mình + kho lead công khai |
| **Hệ thống ngoài** | Website, tổng đài, ngân hàng (qua API key) | Endpoint webhook/ingest theo scope key |

---

## UC nhóm Lead

### UC-L1: Nhận lead từ kho (claim)
- **Actor:** USER, LEADER
- **Tiền đề:** có lead ở Kho phòng ban (POOL) hoặc Kho thả nổi (FLOATING).
- **Luồng:** user mở danh sách kho -> chọn lead -> claim -> lead chuyển `assignedUserId = mình`, status ASSIGNED.
- **Kết quả:** lead vào kho cá nhân của user.

### UC-L2: Phân phối lead (thủ công / AI)
- **Actor:** MANAGER, SUPER_ADMIN
- **Luồng:** chọn lead ở Kho Mới -> phân vào phòng ban, hoặc chạy AI distribute (weighted scoring theo tải + hiệu suất).
- **Ràng buộc:** chỉ áp lên lead status POOL/FLOATING.

### UC-L3: Chăm sóc lead -> chuyển đổi
- **Actor:** USER, LEADER (data của mình)
- **Luồng:** ghi note / gọi điện / tạo order đầu tiên -> lead auto chuyển IN_PROGRESS -> khi chốt tạo Customer -> lead CONVERTED.
- **Nhánh phụ:** đánh dấu LOST -> lead về kho thả nổi (FLOATING).

### UC-L4: Import lead từ CSV
- **Actor:** MANAGER, SUPER_ADMIN
- **Luồng:** upload CSV -> preview + validate -> BullMQ xử lý nền -> dedup theo (SĐT + nhóm + sản phẩm).

---

## UC nhóm Khách hàng

### UC-C1: Quản lý khách hàng
- **Actor:** mọi role (self-scope theo role)
- **Luồng:** xem danh sách/chi tiết khách, cập nhật thông tin, gắn nhiều nhãn, xem timeline hoạt động.

### UC-C2: Multi-phone + hạng khách
- **Actor:** USER trở lên
- **Luồng:** thêm nhiều SĐT cho 1 khách; hệ thống tự xếp hạng (tier) theo doanh số.

---

## UC nhóm Đơn hàng & Thanh toán

### UC-O1: Tạo đơn hàng
- **Actor:** USER, LEADER, MANAGER, SUPER_ADMIN (self-service)
- **Luồng:** tạo order gắn customer + sản phẩm -> order status PENDING.

### UC-P1: Tạo & xác minh thanh toán (hybrid)
- **Actor tạo:** sale (mọi role)
- **Actor xác minh:** SUPER_ADMIN
- **Luồng:** sale tạo payment PENDING -> hệ thống auto-match webhook ngân hàng (VERIFIED) hoặc cron fuzzy-match; SUPER_ADMIN verify/reject/refund thủ công.
- **Kết quả:** order tự COMPLETED khi tổng tiền xác minh >= tổng đơn.

### UC-P2: Đối soát giao dịch ngân hàng
- **Actor:** SUPER_ADMIN
- **Luồng:** import CSV sao kê hoặc nhận webhook -> match với payment pending -> đối soát denomination.

---

## UC nhóm Vận hành

### UC-T1: Quản lý công việc (Task)
- **Actor:** mọi role
- **Luồng:** quick-add task (smart time parse), tạo từ note, nhắc hẹn; escalation khi quá hạn.

### UC-CALL: Cuộc gọi (Call log)
- **Actor:** mọi role (USER: của mình, LEADER: team, MANAGER+: tất cả)
- **Luồng:** OmiCall/tổng đài đẩy CDR qua webhook -> ghi call log -> auto-match vào lead/customer + chấm điểm.

### UC-R1: Auto-recall
- **Actor:** hệ thống (cron daily)
- **Luồng:** lead ở kho phòng ban quá X ngày -> tự chuyển FLOATING + gắn nhãn mặc định (chỉ khi lead chưa có nhãn business).

---

## UC nhóm Quản trị

### UC-A1: Quản lý người dùng
- **Actor:** SUPER_ADMIN (mọi role), MANAGER (chỉ USER + LEADER)
- **Luồng:** tạo/sửa/deactivate user, gán role + team. MANAGER không chạm được user MANAGER+.

### UC-A2: Cấu hình hệ thống
- **Actor:** SUPER_ADMIN only
- **Phạm vi:** department, payment-type, api-key, cron-run, order-format, system-settings, audit-log.

### UC-A3: Dashboard & phân tích
- **Actor:** mọi role (self-scope); tổng hợp cross-team chỉ MANAGER+
- **Luồng:** xem KPI, doanh thu, hiệu suất nhân viên, phân rã doanh thu.

---

## UC tích hợp bên thứ ba (API key)

### UC-I1: Ingest lead/giao dịch từ hệ thống ngoài
- **Actor:** hệ thống ngoài (website, ngân hàng)
- **Luồng:** gọi endpoint với API key -> tạo lead / nhận webhook giao dịch. Xem `docs/api-integration-guide.md`.
