import { PrismaClient, UserRole, LeadStatus, CustomerStatus, OrderStatus, PaymentStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Seed password strategy:
// - DEV: defaults to "changeme" (xem docs/demo-accounts.md)
// - PROD: REQUIRES env SEED_PASSWORD (fail fast để tránh leak credentials)
const SEED_PASSWORD = (() => {
  const envPassword = process.env.SEED_PASSWORD;
  if (envPassword && envPassword.length >= 8) return envPassword;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SEED_PASSWORD env var required in production (min 8 chars). ' +
      'Set it in .env.production before running pnpm db:seed. ' +
      'Ex: SEED_PASSWORD=$(openssl rand -base64 16) pnpm db:seed',
    );
  }
  return 'changeme'; // dev only
})();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function main() {
  // Safety guard 2026-08-18: seed.ts wipes ALL business data unconditionally
  // (deleteMany on every table below). Never allow that against a live
  // production database by accident — require an explicit opt-in env var.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED_WIPE !== 'true') {
    throw new Error(
      'db:seed wipes and recreates ALL demo data — refusing to run with NODE_ENV=production. ' +
      'This script is for dev/demo fixtures only. To bootstrap a real admin without wiping data, ' +
      'use db:bootstrap-admin instead. If you really intend to wipe a production database, ' +
      'set ALLOW_PROD_SEED_WIPE=true explicitly.',
    );
  }

  console.log('Seeding database...');
  console.log(`  Using SEED_PASSWORD from ${process.env.SEED_PASSWORD ? 'env' : 'default (dev)'}`);

  // ── Cleanup existing data (order matters for FK constraints) ──────────
  console.log('  Cleaning up existing data...');
  await prisma.notification.deleteMany();
  await prisma.assignmentHistory.deleteMany();
  await prisma.assignmentTemplateMember.deleteMany();
  await prisma.assignmentTemplate.deleteMany();
  await prisma.recallConfig.deleteMany();
  await prisma.aiDistributionConfig.deleteMany();
  await prisma.task.deleteMany();
  await prisma.activityAttachment.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.callLog.deleteMany();
  await prisma.document.deleteMany();
  await prisma.bankTransaction.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  // Lead label is a FK on leads.label_id - cleared automatically with prisma.lead.deleteMany()
  await prisma.customerLabel.deleteMany();
  await prisma.customerPhone.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.label.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productCategory.deleteMany();
  await prisma.paymentType.deleteMany();
  await prisma.leadGroup.deleteMany();
  await prisma.leadSource.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.managerDepartment.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();
  await prisma.employeeLevel.deleteMany();
  console.log('  ✓ Cleanup done');

  // ── Employee Levels ─────────────────────────────────────────────────────
  const [junior, mid, senior] = await Promise.all([
    prisma.employeeLevel.create({ data: { name: 'Junior', rank: 1 } }),
    prisma.employeeLevel.create({ data: { name: 'Mid', rank: 2 } }),
    prisma.employeeLevel.create({ data: { name: 'Senior', rank: 3 } }),
  ]);
  console.log('  ✓ Employee levels');

  // ── Departments ─────────────────────────────────────────────────────────
  const [sales, support, marketing] = await Promise.all([
    prisma.department.create({ data: { name: 'Sales' } }),
    prisma.department.create({ data: { name: 'Support' } }),
    prisma.department.create({ data: { name: 'Marketing' } }),
  ]);
  console.log('  ✓ Departments');

  // ── Users ───────────────────────────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      email: 'admin@crm.local',
      passwordHash: await hashPassword(SEED_PASSWORD),
      name: 'Super Admin',
      phone: '0901234567',
      role: UserRole.SUPER_ADMIN,
      departmentId: sales.id,
      employeeLevelId: senior.id,
    },
  });

  const managerSales = await prisma.user.create({
    data: {
      email: 'manager.sales@crm.local',
      passwordHash: await hashPassword(SEED_PASSWORD),
      name: 'Nguyễn Văn Quản Lý',
      phone: '0901234568',
      role: UserRole.MANAGER,
      departmentId: sales.id,
      employeeLevelId: senior.id,
    },
  });

  const managerSupport = await prisma.user.create({
    data: {
      email: 'manager.support@crm.local',
      passwordHash: await hashPassword(SEED_PASSWORD),
      name: 'Trần Thị Quản Lý',
      phone: '0901234569',
      role: UserRole.MANAGER,
      departmentId: support.id,
      employeeLevelId: senior.id,
    },
  });

  const user1 = await prisma.user.create({
    data: {
      email: 'sale1@crm.local',
      passwordHash: await hashPassword(SEED_PASSWORD),
      name: 'Lê Văn Sale',
      phone: '0911111111',
      role: UserRole.USER,
      departmentId: sales.id,
      employeeLevelId: mid.id,
    },
  });

  const user2 = await prisma.user.create({
    data: {
      email: 'sale2@crm.local',
      passwordHash: await hashPassword(SEED_PASSWORD),
      name: 'Phạm Thị Sale',
      phone: '0922222222',
      role: UserRole.USER,
      departmentId: sales.id,
      employeeLevelId: junior.id,
    },
  });

  const user3 = await prisma.user.create({
    data: {
      email: 'support1@crm.local',
      passwordHash: await hashPassword(SEED_PASSWORD),
      name: 'Hoàng Văn Support',
      phone: '0933333333',
      role: UserRole.USER,
      departmentId: support.id,
      employeeLevelId: mid.id,
    },
  });

  // Trưởng nhóm (role=LEADER): giám sát theo team, làm leaderId của team.
  const leaderSales = await prisma.user.create({
    data: {
      email: 'leader.sales@crm.local',
      passwordHash: await hashPassword(SEED_PASSWORD),
      name: 'Trần Văn Trưởng Nhóm Sale',
      phone: '0911000111',
      role: UserRole.LEADER,
      departmentId: sales.id,
      employeeLevelId: mid.id,
    },
  });

  const leaderSupport = await prisma.user.create({
    data: {
      email: 'leader.support@crm.local',
      passwordHash: await hashPassword(SEED_PASSWORD),
      name: 'Đỗ Thị Trưởng Nhóm Support',
      phone: '0933000333',
      role: UserRole.LEADER,
      departmentId: support.id,
      employeeLevelId: mid.id,
    },
  });
  console.log('  ✓ Users');

  // ── Manager-Department assignments ──────────────────────────────────────
  await Promise.all([
    prisma.managerDepartment.create({ data: { managerId: managerSales.id, departmentId: sales.id } }),
    prisma.managerDepartment.create({ data: { managerId: managerSupport.id, departmentId: support.id } }),
    prisma.managerDepartment.create({ data: { managerId: admin.id, departmentId: marketing.id } }),
  ]);
  console.log('  ✓ Manager-Department assignments');

  // ── Teams ───────────────────────────────────────────────────────────────
  // leaderId trỏ user role=LEADER; member là các USER cùng team (scope theo teamId).
  const teamA = await prisma.team.create({
    data: { name: 'Sales Team A', departmentId: sales.id, leaderId: leaderSales.id },
  });
  await prisma.user.update({ where: { id: leaderSales.id }, data: { teamId: teamA.id } });
  await prisma.user.update({ where: { id: user1.id }, data: { teamId: teamA.id } });
  await prisma.user.update({ where: { id: user2.id }, data: { teamId: teamA.id } });

  const teamSupport = await prisma.team.create({
    data: { name: 'Support Team A', departmentId: support.id, leaderId: leaderSupport.id },
  });
  await prisma.user.update({ where: { id: leaderSupport.id }, data: { teamId: teamSupport.id } });
  await prisma.user.update({ where: { id: user3.id }, data: { teamId: teamSupport.id } });
  console.log('  ✓ Teams');

  // ── Lead Sources (Nguồn cha) + Lead Groups (Nhóm con) ───────────────────
  // Nguồn cha duy nhất cho seed; các tên cũ trở thành Nhóm con.
  const leadSourceMain = await prisma.leadSource.create({ data: { name: 'Marketing' } });
  const leadGroups = await Promise.all(
    ['Website', 'Facebook', 'Referral', 'Cold Call', 'Event'].map((name) =>
      prisma.leadGroup.create({ data: { name, sourceId: leadSourceMain.id } }),
    ),
  );
  console.log('  ✓ Lead sources + groups');

  // ── Payment Types ───────────────────────────────────────────────────────
  await Promise.all(
    ['CK lần 1', 'CK lần 2', 'CK lần 3', 'CK lần 4', 'CK full', 'COD', 'Tiền mặt'].map((name) =>
      prisma.paymentType.create({ data: { name } }),
    ),
  );
  console.log('  ✓ Payment types');

  // ── Customer Tiers (skip-if-exists để KHÔNG đè config admin) ────────────
  // Khác pattern reset thông thường: SUPER_ADMIN có thể sửa emoji/name/benefits
  // qua admin UI, re-seed không reset về default.
  const defaultTiers = [
    { name: 'Đồng',      slug: 'bronze',   minSpending: 0,         color: '#b45309', emoji: '🥉', iconKey: 'Award',  sortOrder: 1, benefits: 'Thông báo sinh nhật, email khuyến mãi' },
    { name: 'Bạc',       slug: 'silver',   minSpending: 5000000,   color: '#94a3b8', emoji: '🥈', iconKey: 'Award',  sortOrder: 2, benefits: 'Quà sinh nhật cơ bản, hotline ưu tiên' },
    { name: 'Vàng',      slug: 'gold',     minSpending: 20000000,  color: '#eab308', emoji: '🥇', iconKey: 'Trophy', sortOrder: 3, benefits: 'Giảm giá 5%, chăm sóc riêng' },
    { name: 'Bạch Kim',  slug: 'platinum', minSpending: 50000000,  color: '#14b8a6', emoji: '🏆', iconKey: 'Medal',  sortOrder: 4, benefits: 'Giảm 10%, VIP support 24/7' },
    { name: 'Kim Cương', slug: 'diamond',  minSpending: 100000000, color: '#a855f7', emoji: '💎', iconKey: 'Gem',    sortOrder: 5, benefits: 'Giảm 15%, account manager riêng' },
  ];
  for (const t of defaultTiers) {
    await prisma.customerTier.upsert({
      where: { slug: t.slug },
      update: {}, // no-op nếu đã tồn tại - không đè config admin
      create: t,
    });
  }
  console.log('  ✓ Customer tiers (5 default, skip-if-exists)');

  // ── Product Categories ──────────────────────────────────────────────────
  const [catCourse, catConsulting] = await Promise.all([
    prisma.productCategory.create({ data: { name: 'Khóa học' } }),
    prisma.productCategory.create({ data: { name: 'Tư vấn' } }),
  ]);
  console.log('  ✓ Product categories');

  // ── Products ────────────────────────────────────────────────────────────
  const [product1, product2, product3] = await Promise.all([
    prisma.product.create({ data: { name: 'Khóa học Sales Pro', price: 5000000, categoryId: catCourse.id, vatRate: 10 } }),
    prisma.product.create({ data: { name: 'Tư vấn Marketing', price: 15000000, categoryId: catConsulting.id, vatRate: 10 } }),
    prisma.product.create({ data: { name: 'Khóa học Digital Marketing', price: 8000000, categoryId: catCourse.id, vatRate: 10 } }),
  ]);
  console.log('  ✓ Products');

  // ── Labels ──────────────────────────────────────────────────────────────
  const labelNames = [
    { name: 'VIP', color: '#ef4444' },
    { name: 'Hot Lead', color: '#f97316' },
    { name: 'Cần follow-up', color: '#eab308' },
    { name: 'Đã liên hệ', color: '#22c55e' },
    { name: 'Chưa nghe máy', color: '#6b7280' },
    { name: 'Quan tâm cao', color: '#3b82f6' },
    { name: 'Giá trị lớn', color: '#8b5cf6' },
    { name: 'Khách cũ', color: '#06b6d4' },
    { name: 'Thu hồi tự động', color: '#dc2626', category: 'system' },
    { name: 'Từ Event', color: '#10b981' },
  ];
  const labels = await Promise.all(
    labelNames.map((l) => prisma.label.create({ data: l })),
  );
  console.log('  ✓ Labels');

  // ── Customers ───────────────────────────────────────────────────────────
  const customers = await Promise.all([
    prisma.customer.create({
      data: { phone: '0981111111', name: 'Nguyễn Văn A', email: 'nguyenvana@email.com', assignedUserId: user1.id, assignedDepartmentId: sales.id },
    }),
    prisma.customer.create({
      data: { phone: '0982222222', name: 'Trần Thị B', email: 'tranthib@email.com', assignedUserId: user2.id, assignedDepartmentId: sales.id },
    }),
    prisma.customer.create({
      data: { phone: '0983333333', name: 'Lê Văn C', assignedUserId: user3.id, assignedDepartmentId: support.id },
    }),
    prisma.customer.create({
      data: { phone: '0984444444', name: 'Phạm Thị D', status: CustomerStatus.INACTIVE },
    }),
    prisma.customer.create({
      data: { phone: '0985555555', name: 'Hoàng Văn E', status: CustomerStatus.FLOATING },
    }),
  ]);
  console.log('  ✓ Customers');

  // ── Leads (various statuses) ────────────────────────────────────────────
  const leadData = [
    // Kho Mới (POOL, no dept)
    { phone: '0971111111', name: 'Lead Mới 1', groupId: leadGroups[0].id, productId: product1.id, status: LeadStatus.POOL },
    { phone: '0971111112', name: 'Lead Mới 2', groupId: leadGroups[1].id, productId: product2.id, status: LeadStatus.POOL },
    { phone: '0971111113', name: 'Lead Mới 3', groupId: leadGroups[2].id, status: LeadStatus.POOL },
    { phone: '0971111114', name: 'Lead Mới 4', groupId: leadGroups[4].id, status: LeadStatus.POOL },
    // Kho Phòng Ban (POOL, dept assigned, no user)
    { phone: '0972222221', name: 'Lead Phòng Ban 1', groupId: leadGroups[0].id, departmentId: sales.id, status: LeadStatus.POOL },
    { phone: '0972222222', name: 'Lead Phòng Ban 2', groupId: leadGroups[1].id, departmentId: sales.id, status: LeadStatus.POOL },
    { phone: '0972222223', name: 'Lead Phòng Ban 3', groupId: leadGroups[3].id, departmentId: support.id, status: LeadStatus.POOL },
    // Assigned to users
    { phone: '0973333331', name: 'Lead Đang Xử Lý 1', groupId: leadGroups[0].id, productId: product1.id, assignedUserId: user1.id, departmentId: sales.id, status: LeadStatus.ASSIGNED },
    { phone: '0973333332', name: 'Lead Đang Xử Lý 2', groupId: leadGroups[1].id, productId: product2.id, assignedUserId: user2.id, departmentId: sales.id, status: LeadStatus.IN_PROGRESS, customerId: customers[0].id },
    { phone: '0973333333', name: 'Lead Đang Xử Lý 3', groupId: leadGroups[2].id, assignedUserId: user3.id, departmentId: support.id, status: LeadStatus.IN_PROGRESS },
    // Converted
    { phone: '0974444441', name: 'Lead Đã Convert 1', groupId: leadGroups[0].id, productId: product1.id, assignedUserId: user1.id, departmentId: sales.id, status: LeadStatus.CONVERTED, customerId: customers[0].id },
    { phone: '0974444442', name: 'Lead Đã Convert 2', groupId: leadGroups[1].id, productId: product3.id, assignedUserId: user2.id, departmentId: sales.id, status: LeadStatus.CONVERTED, customerId: customers[1].id },
    // Lost
    { phone: '0975555551', name: 'Lead Mất 1', groupId: leadGroups[3].id, assignedUserId: user1.id, departmentId: sales.id, status: LeadStatus.LOST },
    { phone: '0975555552', name: 'Lead Mất 2', groupId: leadGroups[4].id, assignedUserId: user2.id, departmentId: sales.id, status: LeadStatus.LOST },
    // Floating
    { phone: '0976666661', name: 'Lead Thả Nổi 1', groupId: leadGroups[0].id, status: LeadStatus.FLOATING },
    { phone: '0976666662', name: 'Lead Thả Nổi 2', groupId: leadGroups[2].id, status: LeadStatus.FLOATING },
    { phone: '0976666663', name: 'Lead Thả Nổi 3', groupId: leadGroups[1].id, departmentId: sales.id, status: LeadStatus.FLOATING },
    // Extra pool leads
    { phone: '0977777771', name: 'Lead Mới Extra 1', groupId: leadGroups[0].id, productId: product3.id, status: LeadStatus.POOL },
    { phone: '0977777772', name: 'Lead Mới Extra 2', groupId: leadGroups[3].id, status: LeadStatus.POOL },
    { phone: '0977777773', name: 'Lead Phòng Ban Extra', groupId: leadGroups[1].id, departmentId: marketing.id, status: LeadStatus.POOL },
  ];

  const leads = await Promise.all(
    // Lead lưu cả groupId (từ leadData) + sourceId cha (suy ra từ Nguồn cha của nhóm).
    leadData.map((data) => prisma.lead.create({ data: { ...data, sourceId: leadSourceMain.id } })),
  );
  console.log('  ✓ Leads (20)');

  // ── Lead Labels (single label per lead via FK) ──────────────────────────
  const now = new Date();
  await Promise.all([
    prisma.lead.update({ where: { id: leads[0].id }, data: { labelId: labels[1].id, labelAssignedAt: now } }),  // Hot Lead
    prisma.lead.update({ where: { id: leads[7].id }, data: { labelId: labels[5].id, labelAssignedAt: now } }),  // Quan tâm cao
    prisma.lead.update({ where: { id: leads[10].id }, data: { labelId: labels[0].id, labelAssignedAt: now } }), // VIP
    prisma.lead.update({ where: { id: leads[14].id }, data: { labelId: labels[8].id, labelAssignedAt: now } }), // Thu hồi tự động
  ]);
  console.log('  ✓ Lead labels (single)');

  // ── Customer Labels ─────────────────────────────────────────────────────
  await Promise.all([
    prisma.customerLabel.create({ data: { customerId: customers[0].id, labelId: labels[0].id } }), // VIP
    prisma.customerLabel.create({ data: { customerId: customers[1].id, labelId: labels[7].id } }), // Khách cũ
  ]);
  console.log('  ✓ Customer labels');

  // ── Orders ──────────────────────────────────────────────────────────────
  const orders = await Promise.all([
    prisma.order.create({
      data: {
        leadId: leads[10].id, customerId: customers[0].id, productId: product1.id,
        amount: 5000000, vatRate: 10, vatAmount: 500000, totalAmount: 5500000,
        status: OrderStatus.COMPLETED, createdBy: user1.id,
      },
    }),
    prisma.order.create({
      data: {
        leadId: leads[11].id, customerId: customers[1].id, productId: product3.id,
        amount: 8000000, vatRate: 10, vatAmount: 800000, totalAmount: 8800000,
        status: OrderStatus.PENDING, createdBy: user2.id, // partial payment (CK lần 1/2) — chưa đủ totalAmount
      },
    }),
    prisma.order.create({
      data: {
        customerId: customers[2].id, productId: product2.id,
        amount: 15000000, vatRate: 10, vatAmount: 1500000, totalAmount: 16500000,
        status: OrderStatus.PENDING, createdBy: user3.id,
      },
    }),
  ]);
  console.log('  ✓ Orders');

  // ── Payments ────────────────────────────────────────────────────────────
  const paymentTypes = await prisma.paymentType.findMany();
  const ckFull = paymentTypes.find((pt) => pt.name === 'CK full')!;
  const ckLan1 = paymentTypes.find((pt) => pt.name === 'CK lần 1')!;

  await Promise.all([
    prisma.payment.create({
      data: {
        orderId: orders[0].id, paymentTypeId: ckFull.id,
        amount: 5500000, status: PaymentStatus.VERIFIED,
        verifiedBy: managerSales.id, verifiedAt: new Date(), verifiedSource: 'MANUAL',
      },
    }),
    prisma.payment.create({
      data: {
        orderId: orders[1].id, paymentTypeId: ckLan1.id,
        amount: 4400000, status: PaymentStatus.VERIFIED,
        transferContent: 'CK LAN 1 KHOA HOC DM',
        verifiedBy: managerSales.id, verifiedAt: new Date(), verifiedSource: 'AUTO',
      },
    }),
    prisma.payment.create({
      data: {
        orderId: orders[1].id, paymentTypeId: paymentTypes.find((pt) => pt.name === 'CK lần 2')!.id,
        amount: 4400000, status: PaymentStatus.PENDING,
        transferContent: 'CK LAN 2 KHOA HOC DM',
      },
    }),
  ]);
  console.log('  ✓ Payments');

  // ── Activities ──────────────────────────────────────────────────────────
  await Promise.all([
    prisma.activity.create({
      data: {
        entityType: 'LEAD', entityId: leads[7].id, userId: user1.id,
        type: 'NOTE', content: 'Khách hàng quan tâm sản phẩm, hẹn gọi lại tuần sau',
      },
    }),
    prisma.activity.create({
      data: {
        entityType: 'LEAD', entityId: leads[8].id, userId: user2.id,
        type: 'CALL', content: 'Gọi điện tư vấn 15 phút, KH đồng ý mua',
        metadata: { duration: 900, callType: 'OUTGOING' },
      },
    }),
    prisma.activity.create({
      data: {
        entityType: 'LEAD', entityId: leads[10].id, userId: user1.id,
        type: 'STATUS_CHANGE', content: 'Chuyển trạng thái: IN_PROGRESS → CONVERTED',
        metadata: { fromStatus: 'IN_PROGRESS', toStatus: 'CONVERTED' },
      },
    }),
    prisma.activity.create({
      data: {
        entityType: 'CUSTOMER', entityId: customers[0].id, userId: user1.id,
        type: 'NOTE', content: 'Khách hàng VIP, cần chăm sóc đặc biệt',
      },
    }),
  ]);
  console.log('  ✓ Activities');

  // ── Recall Config (single autoLabelId) ──────────────────────────────────
  await prisma.recallConfig.create({
    data: {
      entityType: 'LEAD',
      maxDaysInPool: 7,
      autoLabelId: labels[8].id, // "Thu hồi tự động" label
      createdBy: admin.id,
    },
  });
  console.log('  ✓ Recall config');

  console.log('\n✅ Seed completed successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
