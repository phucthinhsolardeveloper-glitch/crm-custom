// Non-destructive bootstrap for the real first SUPER_ADMIN account.
//
// Unlike seed.ts (which wipes and recreates fixed demo fixtures), this script
// touches nothing except a single user row. Safe to run against a database
// that already has real data — it upserts by email and never deletes.
//
// Required env vars (fail fast if missing):
//   BOOTSTRAP_ADMIN_EMAIL
//   BOOTSTRAP_ADMIN_NAME
//   BOOTSTRAP_ADMIN_PASSWORD   (min 8 chars)
// Optional:
//   BOOTSTRAP_ADMIN_PHONE
//
// Usage: BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_NAME=... BOOTSTRAP_ADMIN_PASSWORD=... pnpm db:bootstrap-admin
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required. Set it before running db:bootstrap-admin.`);
  }
  return value.trim();
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function main() {
  const email = requireEnv('BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const name = requireEnv('BOOTSTRAP_ADMIN_NAME');
  const password = requireEnv('BOOTSTRAP_ADMIN_PASSWORD');
  const phone = process.env.BOOTSTRAP_ADMIN_PHONE?.trim() || undefined;

  if (password.length < 8) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`BOOTSTRAP_ADMIN_EMAIL "${email}" is not a valid email address.`);
  }

  const existing = await prisma.user.findFirst({
    where: { email, deletedAt: null },
    select: { id: true, role: true, name: true },
  });

  const passwordHash = await hashPassword(password);

  if (existing) {
    if (existing.role !== UserRole.SUPER_ADMIN) {
      throw new Error(
        `User ${email} already exists with role ${existing.role}, not SUPER_ADMIN. ` +
        'Refusing to silently change an existing account\'s role — update it manually if intended.',
      );
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { name, passwordHash, phone, status: UserStatus.ACTIVE },
    });
    console.log(`✓ SUPER_ADMIN "${email}" already existed — password and profile updated.`);
    return;
  }

  const anySuperAdmin = await prisma.user.findFirst({
    where: { role: UserRole.SUPER_ADMIN, deletedAt: null },
    select: { email: true },
  });
  if (anySuperAdmin) {
    console.log(
      `Note: another SUPER_ADMIN already exists (${anySuperAdmin.email}). ` +
      'Creating an additional one as requested.',
    );
  }

  const created = await prisma.user.create({
    data: {
      email,
      name,
      phone,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
    select: { id: true, email: true },
  });

  console.log(`✓ Created SUPER_ADMIN "${created.email}" (id=${created.id}).`);
  console.log('  No other data was touched. Assign a department/team later via the Users UI if needed.');
}

main()
  .catch((err) => {
    console.error('✗ bootstrap-admin failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
