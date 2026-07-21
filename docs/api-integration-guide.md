# API Integration Guide - CRM V4

Tài liệu hướng dẫn tích hợp CRM V4 với hệ thống bên thứ 3 (website, tổng đài, ngân hàng).

## Xác thực

Tất cả endpoint bên thứ 3 yêu cầu **API Key** trong header:

```
x-api-key: crm_xxxxxxxxxxxxxxxxxxxx
```

Tạo API key tại: **Cài đặt → API Keys** (chỉ Super Admin).
Key chỉ hiện **1 lần** khi tạo - lưu lại ngay.

---

## 1. Tạo Lead từ bên ngoài

Nhận lead từ website form, Facebook Lead Ads, landing page,...

```
POST /api/v1/external/leads
```

### Request

| Field | Type | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `name` | string | ✅ | Họ tên khách hàng |
| `phone` | string | ✅ | SĐT (tự động chuẩn hóa +84/0) |
| `email` | string | | Email |
| `source` | string | | Tên nguồn (auto-create nếu chưa có) |
| `metadata` | object | | Dữ liệu tùy chỉnh (key-value) |

### Ví dụ

```bash
curl -X POST http://your-domain.com/api/v1/external/leads \
  -H "x-api-key: crm_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nguyễn Văn A",
    "phone": "0901234567",
    "email": "nguyenvana@gmail.com",
    "source": "Facebook",
    "metadata": { "campaign": "Summer2026", "utm_source": "fb_ads" }
  }'
```

### Response (200)

```json
{
  "data": {
    "id": "123",
    "phone": "0901234567",
    "name": "Nguyễn Văn A",
    "status": "POOL",
    "customerId": "456"
  }
}
```

### Lưu ý
- Lead tạo qua API **luôn vào Kho Mới** (status=POOL)
- **Không dedup** - luôn tạo lead mới (khác CSV import)
- Customer tự động tạo nếu SĐT chưa tồn tại
- Nguồn (source) tự động tạo nếu chưa có trong hệ thống

---

## 2. Gửi Log Cuộc Gọi

Nhận log cuộc gọi từ tổng đài (StringeeX, Zoiper, 3CX,...).

```
POST /api/v1/call-logs/ingest
```

### Request

| Field | Type | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `externalId` | string | ✅ | ID duy nhất từ tổng đài (dedup) |
| `phoneNumber` | string | ✅ | SĐT khách hàng |
| `callType` | string | ✅ | `INCOMING` / `OUTGOING` / `MISSED` |
| `callTime` | string | ✅ | ISO 8601 (VD: `2026-04-03T14:30:00Z`) |
| `duration` | number | | Thời lượng (giây) |
| `content` | string | | Ghi chú cuộc gọi |

### Ví dụ

```bash
curl -X POST http://your-domain.com/api/v1/call-logs/ingest \
  -H "x-api-key: crm_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "stringee_call_789",
    "phoneNumber": "0901234567",
    "callType": "OUTGOING",
    "callTime": "2026-04-03T14:30:00Z",
    "duration": 120,
    "content": "Tư vấn sản phẩm khóa học"
  }'
```

### Response (200)

```json
{
  "data": {
    "id": "789",
    "phoneNumber": "0901234567",
    "callType": "OUTGOING",
    "matchStatus": "MATCHED",
    "matchedEntityType": "LEAD",
    "matchedEntityId": "123"
  }
}
```

### Lưu ý
- **Auto-match**: SĐT tự động match với lead/customer trong hệ thống
- **Dedup**: `externalId` trùng → trả lỗi 409 Conflict
- `matchStatus`: `MATCHED` (tìm thấy lead/customer) hoặc `UNMATCHED`
- Manager có thể match thủ công các cuộc gọi UNMATCHED

---

## 3. Webhook Giao Dịch Ngân Hàng

Nhận thông báo giao dịch từ ngân hàng (SePay, Casso, webhook tự build,...).

```
POST /api/v1/webhooks/bank-transactions
```

### Request

| Field | Type | Bắt buộc | Mô tả |
|-------|------|----------|-------|
| `externalId` | string | ✅ | ID giao dịch từ ngân hàng (dedup) |
| `amount` | number | ✅ | Số tiền (VNĐ) |
| `content` | string | ✅ | Nội dung chuyển khoản |
| `bankAccount` | string | | Số tài khoản nhận |
| `senderName` | string | | Tên người chuyển |
| `senderAccount` | string | | Số TK người chuyển |
| `transactionTime` | string | ✅ | ISO 8601 |
| `rawData` | object | | Dữ liệu gốc từ ngân hàng |

### Ví dụ

```bash
curl -X POST http://your-domain.com/api/v1/webhooks/bank-transactions \
  -H "x-api-key: crm_abc123..." \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "sepay_txn_456",
    "amount": 5500000,
    "content": "CK LAN 1 KHOA HOC DM",
    "senderName": "NGUYEN VAN A",
    "transactionTime": "2026-04-03T10:00:00Z"
  }'
```

### Response (200)

```json
{
  "data": {
    "id": "456",
    "amount": 5500000,
    "content": "CK LAN 1 KHOA HOC DM",
    "matchStatus": "MATCHED",
    "matchedPaymentId": "789"
  }
}
```

### Lưu ý
- **Auto-match**: Nội dung CK tự match với payment PENDING (so khớp `transferContent`)
- **Dedup**: `externalId` trùng → trả lỗi 409 Conflict
- Payment matched tự động chuyển sang `VERIFIED`
- Giao dịch không match → `UNMATCHED`, manager verify thủ công

---

## Mã lỗi

| HTTP | Ý nghĩa |
|------|---------|
| 200 | Thành công |
| 401 | API key không hợp lệ hoặc thiếu |
| 409 | Trùng lặp (externalId đã tồn tại) |
| 400 | Dữ liệu không hợp lệ |
| 429 | Rate limit (100 req/phút/key) |
| 500 | Lỗi server |

---

## Rate Limiting

- **100 requests/phút** per API key
- Header trả về: `x-ratelimit-remaining-short`
