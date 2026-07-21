# Deployment Guide - CRM-Custom

> Hướng dẫn triển khai production trung tính. Thay `your-domain.com` bằng domain thật của bạn.
> Stack: PostgreSQL 16 + Redis 7 (Docker) + NestJS API + Next.js Web (PM2) + Nginx reverse proxy.

## Yêu cầu hệ thống

- Node.js 22 (xem `.nvmrc`)
- pnpm 9+
- Docker + Docker Compose
- PM2 (`npm i -g pm2`)
- Nginx (hoặc Nginx Proxy Manager)
- RAM tối thiểu 2GB (API 512M + Web 512M + PG + Redis)

## 1. Chuẩn bị mã nguồn

```bash
git clone <repo> crm-custom && cd crm-custom
pnpm install
```

## 2. Cấu hình biến môi trường

```bash
cp .env.example .env
```

Bắt buộc điền:
- `DATABASE_URL` - connection string PostgreSQL
- `JWT_SECRET`, `JWT_REFRESH_SECRET` - sinh bằng `openssl rand -hex 32`
- `REDIS_URL`, `REDIS_PASSWORD`
- `FRONTEND_URL`, `NEXT_PUBLIC_API_URL` - trỏ về domain thật

Tùy chọn (module tự disable nếu để trống): `OMICALL_*`, `LARK_*`, `VAPID_*`, `WEBHOOK_SECRET`.

> Prod nên set `WEBHOOK_SECRET` để bật xác thực HMAC cho webhook ngân hàng.

## 3. Khởi động hạ tầng (PostgreSQL + Redis)

Dev:
```bash
docker compose up -d
```

Production (bắt buộc set `DB_PASSWORD`, `REDIS_PASSWORD` trong env):
```bash
docker compose -f docker-compose.prod.yml up -d
```

Cả 2 container bind về `127.0.0.1` (không expose ra ngoài).

## 4. Khởi tạo database

```bash
pnpm db:generate     # Generate Prisma client
pnpm db:push         # Push schema vào DB
pnpm db:seed         # Seed dữ liệu ban đầu (bắt buộc SEED_PASSWORD ở prod)
```

## 5. Build

```bash
pnpm build           # Build toàn workspace (API + Web + packages)
```

## 6. Chạy production với PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup          # Tự khởi động khi reboot
```

- API chạy port **3010** (`crm-api`)
- Web chạy port **3011** (`crm-web`)
- Web gọi API nội bộ qua `127.0.0.1:3010` (tránh round-trip qua public URL)

## 7. Reverse proxy (Nginx)

Trỏ domain `your-domain.com` về Web (3011), route `/api/` và `/files/` về API (3010).
Tham khảo `nginx/proxy-host.conf`. Các location chính:

- `/api/auth/` -> Next.js (3011) - xử lý cookie
- `/api/` -> NestJS (3010)
- `/files/` -> NestJS (3010) - file upload
- `/health` -> NestJS health check

Đặt `client_max_body_size 10M` (giới hạn upload).

## 8. HTTPS

Dùng Let's Encrypt (certbot) hoặc Nginx Proxy Manager tự cấp SSL. Cookie JWT dùng `Secure + httpOnly + SameSite=Lax` nên bắt buộc HTTPS ở prod.

## Kiểm tra sau deploy

```bash
curl https://your-domain.com/health          # {"status":"ok"}
pm2 status                                    # crm-api + crm-web online
pm2 logs                                      # Xem log realtime
```

## Cập nhật phiên bản

```bash
git pull
pnpm install
pnpm build
pnpm db:push          # Nếu có thay đổi schema
pm2 reload ecosystem.config.cjs
```

## Backup (gợi ý)

- Database: `pg_dump` định kỳ (cron).
- Uploads: sao lưu thư mục `uploads/`.
- Redis: dùng cho hàng đợi BullMQ (không chứa data quan trọng, có thể tái tạo).

## Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| API không start | Thiếu JWT_SECRET / DATABASE_URL sai |
| Web 502 | API chưa chạy hoặc sai INTERNAL_API_URL |
| Upload lỗi 413 | Thiếu `client_max_body_size` ở Nginx |
| Webhook ngân hàng bị từ chối | Thiếu API key hoặc sai WEBHOOK_SECRET |
