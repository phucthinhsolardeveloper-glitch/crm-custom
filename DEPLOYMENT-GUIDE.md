# CRM-Custom Deployment Guide

## 📋 Quick Start

### Prerequisites
- **Node.js** 18+ with npm/pnpm installed
- **Docker Desktop** running (or Docker + Docker Compose)
- **PostgreSQL 16** (via Docker Compose)
- **Redis 7** (via Docker Compose)
- At least **2GB RAM** free for Docker services

### Local Development Setup (5-10 minutes)

```bash
# 1. Clone repository
git clone <repo-url> crm-custom
cd crm-custom

# 2. Install dependencies (turbo monorepo)
pnpm install --frozen-lockfile

# 3. Start Docker services (PostgreSQL + Redis)
docker compose up -d

# 4. Generate Prisma client and sync schema
pnpm db:generate
pnpm db:push

# 5. Seed demo data (creates users, leads, customers, orders)
pnpm db:seed

# 6. Start development server
pnpm dev
```

**Access Points:**
- 🌐 Frontend: http://localhost:3011
- 📡 API: http://localhost:3010/api/v1
- 🗄️ Database: localhost:5434 (psql)
- 🔴 Redis: localhost:6380

---

## 🏗️ Architecture Overview

### Tech Stack
| Component | Version | Purpose |
|-----------|---------|---------|
| **Backend** | NestJS 11 | API server, business logic, RLS |
| **Frontend** | Next.js 16 | React UI, dashboard, lead/customer management |
| **Database** | PostgreSQL 16 | Core data store with RLS policies |
| **Cache** | Redis 7 | Session storage, rate limiting, queues |
| **ORM** | Prisma 6 | Type-safe database access |
| **Package Manager** | pnpm | Monorepo with Turborepo |

### Project Structure
```
crm-custom/
├── apps/
│   ├── api/           # NestJS backend server
│   └── web/           # Next.js frontend application
├── packages/
│   ├── database/      # Prisma schema, migrations, seeds
│   ├── types/         # Shared TypeScript types
│   └── utils/         # Shared utilities
├── docker-compose.yml # PostgreSQL + Redis config
└── .env              # Environment variables
```

### Key Features
1. **Lead Pipeline Management** - 3 lead pools (New, Department, Floating) with AI-based distribution
2. **Customer Relationship** - Track customer lifecycle, orders, payments
3. **Order & Payment Reconciliation** - Auto-verify payments via bank webhooks
4. **Role-Based Access Control (RBAC)** - SUPER_ADMIN, MANAGER, LEADER, USER roles
5. **Multi-Department Support** - Organize teams by departments with separate pools
6. **Analytics Dashboard** - Real-time KPIs, conversion tracking, revenue insights
7. **Task Management** - Create tasks with smart time parsing and reminders
8. **CSV Import** - Bulk import with deduplication and progress tracking

---

## 🔑 Real Admin Bootstrap (Production)

`pnpm db:seed` always wipes and recreates the fixed demo fixtures below — it now refuses to
run with `NODE_ENV=production` unless `ALLOW_PROD_SEED_WIPE=true` is explicitly set, to prevent
accidentally destroying real data.

To create the **real first SUPER_ADMIN** without touching any other data, use the non-destructive
bootstrap script instead:

```bash
BOOTSTRAP_ADMIN_EMAIL=admin@yourcompany.com \
BOOTSTRAP_ADMIN_NAME="Tên quản trị" \
BOOTSTRAP_ADMIN_PHONE=09xxxxxxxx \
BOOTSTRAP_ADMIN_PASSWORD='StrongPassword123!' \
pnpm db:bootstrap-admin
```

Idempotent — safe to re-run (updates the same account instead of duplicating). Add real
departments/teams/employees afterwards via the `/users` admin UI.

## 👥 Demo Users (dev/testing only)

All demo users have password: **`changeme`**

| Email | Role | Department | Purpose |
|-------|------|-----------|---------|
| `admin@crm.local` | SUPER_ADMIN | - | Full system access |
| `manager.sales@crm.local` | MANAGER | Sales | Sales team management |
| `manager.support@crm.local` | MANAGER | Support | Support team management |
| `leader.sales@crm.local` | LEADER | Sales | Sales team lead |
| `leader.support@crm.local` | LEADER | Support | Support team lead |
| `sale1@crm.local` | USER | Sales | Sales representative 1 |
| `sale2@crm.local` | USER | Sales | Sales representative 2 |
| `support1@crm.local` | USER | Support | Support representative |

**Demo Data Seeded:**
- 20 leads (across POOL, ASSIGNED, PROCESSING, CONVERTED statuses)
- 5 customers with tier history
- 3 orders with payment tracking
- 3 products (consulting, courses)
- Labels, sources, teams, departments

---

## 📡 Core API Modules

### Authentication
```
POST   /api/v1/auth/login              # Login with email/password
POST   /api/v1/auth/refresh            # Refresh JWT tokens
POST   /api/v1/auth/logout             # Logout
GET    /api/v1/auth/me                 # Get current user info
```

### Leads
```
GET    /api/v1/leads                   # List all leads (paginated)
GET    /api/v1/leads/pool              # Leads in new pool
GET    /api/v1/leads/zoom              # Leads in department pool
GET    /api/v1/leads/floating          # Floating leads
GET    /api/v1/leads/:id               # Lead detail
POST   /api/v1/leads                   # Create lead
PATCH  /api/v1/leads/:id               # Update lead
```

### Customers
```
GET    /api/v1/customers               # List customers
GET    /api/v1/customers/:id           # Customer detail
POST   /api/v1/customers               # Create customer
PATCH  /api/v1/customers/:id           # Update customer
```

### Orders
```
GET    /api/v1/orders                  # List orders
GET    /api/v1/orders/:id              # Order detail
POST   /api/v1/orders                  # Create order
```

### Payments
```
GET    /api/v1/payments                # List payments
POST   /api/v1/payments/reconcile      # Reconcile payments
GET    /api/v1/payments/summary        # Payment summary stats
```

### Dashboard
```
GET    /api/v1/stats/overview          # Dashboard KPIs
GET    /api/v1/stats/funnel            # Lead conversion funnel
GET    /api/v1/stats/revenue           # Revenue by product/period
```

---

## 🌐 Frontend Pages

| URL | Purpose | Role Restriction |
|-----|---------|------------------|
| `/login` | User authentication | None (public) |
| `/dashboard` | Summary dashboard | Authenticated |
| `/dashboard/revenue` | Revenue analytics | Authenticated |
| `/dashboard/employees` | Employee performance | MANAGER+ |
| `/leads` | All leads | Authenticated |
| `/leads/pool` | Lead pool assignment | Authenticated |
| `/leads/zoom` | Department pool | Authenticated |
| `/leads/floating` | Floating leads | Authenticated |
| `/customers` | Customer list | Authenticated |
| `/customers/:id` | Customer detail | Authenticated |
| `/orders` | Order management | Authenticated |
| `/payments` | Payment reconciliation | Authenticated |
| `/products` | Product catalog | Authenticated |
| `/tasks` | Task management | Authenticated |
| `/users` | User management | MANAGER+ |
| `/settings/*` | System settings | SUPER_ADMIN + MANAGER |

---

## 🚀 Production Deployment

### Environment Setup

Create `.env.production` with:
```env
# Database
DATABASE_URL="postgresql://user:pass@host:5432/crm_prod"
DIRECT_URL="postgresql://user:pass@host:5432/crm_prod"

# Redis
REDIS_URL="redis://host:6379"

# JWT Secrets (generate with: openssl rand -base64 32)
JWT_SECRET="<random-32-byte-base64>"
JWT_REFRESH_SECRET="<random-32-byte-base64>"

# API Configuration
API_URL="https://api.crm.example.com"
WEB_URL="https://crm.example.com"

# Optional: Third-party integrations
TELEGRAM_BOT_TOKEN="<if-using-telegram>"
LARK_APP_ID="<if-using-lark>"
```

### Docker Build & Deploy

```bash
# Build production image
docker build -f docker/Dockerfile -t crm-custom:latest .

# Or use docker-compose for staging
docker compose -f docker-compose.yml up -d
```

### Database Migration
```bash
# Run Prisma migrations in production
pnpm db:migrate:deploy

# Seed initial data
pnpm db:seed
```

### Nginx Configuration Example
```nginx
upstream api {
    server localhost:3010;
}

upstream web {
    server localhost:3011;
}

server {
    listen 80;
    server_name api.crm.example.com;
    location / {
        proxy_pass http://api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

server {
    listen 80;
    server_name crm.example.com;
    location / {
        proxy_pass http://web;
        proxy_set_header Host $host;
    }
}
```

---

## ⚙️ Configuration

### Key Environment Variables
| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6380` | Redis connection string |
| `JWT_SECRET` | (required) | Secret for JWT signing |
| `ENCRYPTION_KEY` | (required) | 64-char hex (32 bytes), `openssl rand -hex 32`. AES-256-GCM key for encrypting `UserSipConfig.sipPassword` (OmiCall) at rest — see `apps/api/src/common/utils/aes-gcm.ts` |
| `JWT_EXPIRY` | `3600` | JWT token lifetime (seconds) |
| `API_PORT` | `3010` | Backend API port |
| `WEB_PORT` | `3011` | Frontend port |
| `LOG_LEVEL` | `info` | Log verbosity |

### Database Migrations
```bash
# View pending migrations
pnpm db:migrate:status

# Create new migration
pnpm db:migrate:dev --name migration_name

# Apply migrations
pnpm db:migrate:deploy

# Reset database (dev only)
pnpm db:reset
```

---

## 🐛 Troubleshooting

### Issue: Port Already in Use
```bash
# Find process using port
lsof -i :3010

# Kill process
kill -9 <PID>
```

### Issue: Docker Services Won't Start
```bash
# Check Docker status
docker ps -a

# View logs
docker compose logs postgres
docker compose logs redis

# Restart services
docker compose down
docker compose up -d
```

### Issue: Database Connection Error
```bash
# Verify connection string in .env
# Check PostgreSQL is running
docker compose ps

# Test connection
psql -h localhost -p 5434 -U crm_user -d crm_db
```

### Issue: Authentication Fails
```bash
# Verify demo user exists
pnpm db:seed

# Check JWT secrets are set
echo $JWT_SECRET

# Clear cookies and try again
```

### Issue: API Returns 429 (Too Many Requests)
- Rate limiting is enabled - wait a moment and retry
- Check `throttle:limit` config in environment variables

---

## 📊 Monitoring & Logging

### View API Logs
```bash
# Development server
pnpm dev  # See console output

# Production with docker
docker logs -f crm-api
```

### Check Database Health
```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U crm_user -d crm_db

# Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) 
FROM pg_tables 
WHERE schemaname != 'pg_catalog' 
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Monitor Redis
```bash
# Connect to Redis CLI
docker compose exec redis redis-cli

# Check memory usage
INFO memory

# Monitor commands in real-time
MONITOR
```

---

## 🔒 Security Checklist

- [ ] Change all default passwords in `.env`
- [ ] Set strong `JWT_SECRET` (min 32 bytes, random)
- [ ] Enable HTTPS in production
- [ ] Configure CORS properly for your domain
- [ ] Set up database backups (daily)
- [ ] Enable PostgreSQL SSL connections
- [ ] Use environment-specific `.env` files
- [ ] Restrict API access with rate limiting
- [ ] Enable audit logging for sensitive operations
- [ ] Review RBAC permissions per department

---

## 📚 Additional Resources

- [API Documentation](./docs/zalocrm-api/)
- [Architecture Decisions](./docs/architecture/)
- [Deployment Procedures](./docs/)
- [Database Schema](./packages/database/prisma/schema.prisma)
- [Contributing Guidelines](./CONTRIBUTING.md)

---

## 📞 Support & Next Steps

1. **Local Testing** - Run `pnpm dev` and test with demo users
2. **Team Onboarding** - Invite team with different roles to test access
3. **Customization** - Adjust labels, sources, departments in settings
4. **Integration** - Set up payment webhooks, Telegram bridge, Lark sync
5. **Production** - Deploy to staging first, then production

For issues or questions, refer to the repository documentation or reach out to the development team.
