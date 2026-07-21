
import { PrismaClient, UserRole, LeadStatus, CustomerStatus, OrderStatus, PaymentStatus, CallType, MatchStatus, TaskStatus, TaskPriority } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Seed password strategy giống seed.ts gốc: dev default 'changeme', prod bắt buộc env.
const SEED_PASSWORD = (() => {
  const envPassword = process.env.SEED_PASSWORD;
  if (envPassword && envPassword.length >= 8) return envPassword;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SEED_PASSWORD env var required in production (min 8 chars). ' +
      'Ex: SEED_PASSWORD=$(openssl rand -base64 16) tsx prisma/demo-seed.ts',
    );
  }
  return 'changeme'; // dev only
})();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const rand = (n: number) => Math.floor(Math.random() * n);
const pick = <T>(arr: T[]): T => arr[rand(arr.length)];
const randInt = (min: number, max: number) => min + rand(max - min + 1);

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const DEM = ['Văn', 'Thị', 'Hữu', 'Đức', 'Quang', 'Minh', 'Thanh', 'Ngọc', 'Thu', 'Hồng', 'Xuân', 'Anh', 'Gia', 'Bảo', 'Khánh'];
const TEN = ['An', 'Bình', 'Cường', 'Dũng', 'Hà', 'Hải', 'Hạnh', 'Hoa', 'Hùng', 'Hương', 'Khoa', 'Lan', 'Linh', 'Long', 'Mai', 'Nam', 'Nga', 'Nhung', 'Phong', 'Quân', 'Sơn', 'Tâm', 'Thảo', 'Trang', 'Trung', 'Tú', 'Tuấn', 'Vy', 'Yến', 'Đạt'];

const fullName = () => `${pick(HO)} ${pick(DEM)} ${pick(TEN)}`;

// Unique phone generator (09xx/08xx/07xx, 10 số, không trùng).
const usedPhones = new Set<string>();
function uniquePhone(): string {
  let phone: string;
  do {
    const prefix = pick(['09', '08', '07', '03', '05']);
    phone = prefix + String(randInt(10000000, 99999999)).padStart(8, '0');
  } while (usedPhones.has(phone));
  usedPhones.add(phone);
  return phone;
}

const slugEmail = (name: string, i: number) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/\s+/g, '.').toLowerCase() + `${i}@email.com`;

async function main() {
  console.log('Seeding DEMO database (khóa học online)...');
  console.log(`  Using SEED_PASSWORD from ${process.env.SEED_PASSWORD ? 'env' : 'default (dev)'}`);

  // ── Cleanup (thứ tự FK giống seed.ts gốc) ────────────────────────────────
  console.log('  Cleaning up existing data...');
  await prisma.notification.deleteMany();
  await prisma.assignmentHistory.deleteMany();
  await prisma.assignmentTemplateMember.deleteMany();
  await prisma.assignmentTemplate.deleteMany();
  await prisma.recallConfig.deleteMany();
  await prisma.aiDistributionConfig.deleteMany();
  await prisma.taskReminder.deleteMany();
  await prisma.task.deleteMany();
  await prisma.activityAttachment.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.callFeedback.deleteMany();
  await prisma.callLog.deleteMany();
  await prisma.document.deleteMany();
  await prisma.bankTransaction.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
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

  // ── Employee Levels ──────────────────────────────────────────────────────
  const [junior, mid, senior] = await Promise.all([
    prisma.employeeLevel.create({ data: { name: 'Junior', rank: 1 } }),
    prisma.employeeLevel.create({ data: { name: 'Mid', rank: 2 } }),
    prisma.employeeLevel.create({ data: { name: 'Senior', rank: 3 } }),
  ]);
  const levels = [junior, mid, senior];

  // ── Departments ───────────────────────────────────────────────────────────
  const [sales, support, marketing] = await Promise.all([
    prisma.department.create({ data: { name: 'Sales' } }),
    prisma.department.create({ data: { name: 'Support' } }),
    prisma.department.create({ data: { name: 'Marketing' } }),
  ]);
  const depts = [sales, support, marketing];
  console.log('  ✓ Levels + departments');

  // ── Users (~20) ────────────────────────────────────────────────────────────
  // Tài khoản đăng nhập demo (SUPER_ADMIN).
  const demoAdmin = await prisma.user.create({
    data: {
      email: 'demo@crm-custom.vn',
      passwordHash: await hashPassword(SEED_PASSWORD),
      name: 'Quản Trị Demo',
      phone: uniquePhone(),
      role: UserRole.SUPER_ADMIN,
      departmentId: sales.id,
      employeeLevelId: senior.id,
    },
  });

  const managerSales = await prisma.user.create({
    data: { email: 'manager.sales@crm-custom.vn', passwordHash: await hashPassword(SEED_PASSWORD), name: 'Nguyễn Thanh Quản', phone: uniquePhone(), role: UserRole.MANAGER, departmentId: sales.id, employeeLevelId: senior.id },
  });
  const managerSupport = await prisma.user.create({
    data: { email: 'manager.support@crm-custom.vn', passwordHash: await hashPassword(SEED_PASSWORD), name: 'Trần Ngọc Điều', phone: uniquePhone(), role: UserRole.MANAGER, departmentId: support.id, employeeLevelId: senior.id },
  });
  const managerMkt = await prisma.user.create({
    data: { email: 'manager.marketing@crm-custom.vn', passwordHash: await hashPassword(SEED_PASSWORD), name: 'Lê Minh Chiến', phone: uniquePhone(), role: UserRole.MANAGER, departmentId: marketing.id, employeeLevelId: senior.id },
  });

  const leaderSales = await prisma.user.create({
    data: { email: 'leader.sales@crm-custom.vn', passwordHash: await hashPassword(SEED_PASSWORD), name: 'Phạm Hữu Trưởng', phone: uniquePhone(), role: UserRole.LEADER, departmentId: sales.id, employeeLevelId: mid.id },
  });
  const leaderSupport = await prisma.user.create({
    data: { email: 'leader.support@crm-custom.vn', passwordHash: await hashPassword(SEED_PASSWORD), name: 'Vũ Thị Nhóm', phone: uniquePhone(), role: UserRole.LEADER, departmentId: support.id, employeeLevelId: mid.id },
  });

  // USER thường: rải vào 3 dept. Giữ danh sách saleUsers (Sales) làm chủ lực bán hàng.
  const userDefs = [
    { dept: sales, level: senior }, { dept: sales, level: mid }, { dept: sales, level: mid },
    { dept: sales, level: junior }, { dept: sales, level: junior }, { dept: sales, level: mid },
    { dept: sales, level: junior }, { dept: support, level: mid }, { dept: support, level: junior },
    { dept: support, level: junior }, { dept: marketing, level: mid }, { dept: marketing, level: junior },
    { dept: marketing, level: junior },
  ];
  const regularUsers = [];
  for (let i = 0; i < userDefs.length; i++) {
    const d = userDefs[i];
    const name = fullName();
    regularUsers.push(
      await prisma.user.create({
        data: {
          email: slugEmail(name, i + 1).replace('@email.com', '@crm-custom.vn'),
          passwordHash: await hashPassword(SEED_PASSWORD),
          name,
          phone: uniquePhone(),
          role: UserRole.USER,
          departmentId: d.dept.id,
          employeeLevelId: d.level.id,
          createdAt: daysAgo(randInt(180, 300)),
        },
      }),
    );
  }
  const allUsers = [demoAdmin, managerSales, managerSupport, managerMkt, leaderSales, leaderSupport, ...regularUsers];
  const salesUsers = regularUsers.filter((_, i) => userDefs[i].dept.id === sales.id);
  const supportUsers = regularUsers.filter((_, i) => userDefs[i].dept.id === support.id);
  // Top performers = 3 sale đầu (bán nhiều), phần còn lại bán ít hơn.
  console.log(`  ✓ Users (${allUsers.length})`);

  // ── Manager-Department ─────────────────────────────────────────────────────
  await Promise.all([
    prisma.managerDepartment.create({ data: { managerId: managerSales.id, departmentId: sales.id } }),
    prisma.managerDepartment.create({ data: { managerId: managerSupport.id, departmentId: support.id } }),
    prisma.managerDepartment.create({ data: { managerId: managerMkt.id, departmentId: marketing.id } }),
    prisma.managerDepartment.create({ data: { managerId: demoAdmin.id, departmentId: marketing.id } }),
  ]);

  // ── Teams ──────────────────────────────────────────────────────────────────
  const teamSales = await prisma.team.create({ data: { name: 'Sales Team A', departmentId: sales.id, leaderId: leaderSales.id } });
  const teamSupport = await prisma.team.create({ data: { name: 'Support Team A', departmentId: support.id, leaderId: leaderSupport.id } });
  await prisma.user.update({ where: { id: leaderSales.id }, data: { teamId: teamSales.id } });
  await prisma.user.update({ where: { id: leaderSupport.id }, data: { teamId: teamSupport.id } });
  for (const u of salesUsers) await prisma.user.update({ where: { id: u.id }, data: { teamId: teamSales.id } });
  for (const u of supportUsers) await prisma.user.update({ where: { id: u.id }, data: { teamId: teamSupport.id } });
  console.log('  ✓ Teams + manager assignments');

  // ── Lead Sources (Nguồn cha) + Lead Groups (Nhóm con) ─────────────────────
  const leadSourceMain = await prisma.leadSource.create({ data: { name: 'Marketing' } });
  const leadSourceFb = await prisma.leadSource.create({ data: { name: 'Facebook Ads' } });
  const leadGroups = await Promise.all(
    [
      { name: 'Website', source: leadSourceMain },
      { name: 'Landing Page', source: leadSourceMain },
      { name: 'Zalo OA', source: leadSourceMain },
      { name: 'Facebook Fanpage', source: leadSourceFb },
      { name: 'Facebook Group', source: leadSourceFb },
      { name: 'TikTok', source: leadSourceFb },
      { name: 'Giới thiệu', source: leadSourceMain },
      { name: 'Hội thảo', source: leadSourceMain },
    ].map((g) => prisma.leadGroup.create({ data: { name: g.name, sourceId: g.source.id } })),
  );
  // Map group -> source cha (để set lead.sourceId đúng Nguồn cha).
  const groupSourceId = new Map<string, bigint>();
  const fbGroupNames = new Set(['Facebook Fanpage', 'Facebook Group', 'TikTok']);
  for (const g of leadGroups) groupSourceId.set(g.id.toString(), fbGroupNames.has(g.name) ? leadSourceFb.id : leadSourceMain.id);
  console.log('  ✓ Lead sources + groups');

  // ── Payment Types ──────────────────────────────────────────────────────────
  await Promise.all(
    ['CK lần 1', 'CK lần 2', 'CK lần 3', 'CK lần 4', 'CK full', 'COD', 'Tiền mặt', 'Ví MoMo'].map((name) =>
      prisma.paymentType.create({ data: { name } }),
    ),
  );
  const paymentTypes = await prisma.paymentType.findMany();
  const ptFull = paymentTypes.find((p) => p.name === 'CK full')!;
  const ptLan1 = paymentTypes.find((p) => p.name === 'CK lần 1')!;
  const ptLan2 = paymentTypes.find((p) => p.name === 'CK lần 2')!;
  console.log('  ✓ Payment types');

  // ── Customer Tiers (skip-if-exists) ────────────────────────────────────────
  const defaultTiers = [
    { name: 'Đồng', slug: 'bronze', minSpending: 0, color: '#b45309', emoji: '🥉', iconKey: 'Award', sortOrder: 1, benefits: 'Thông báo sinh nhật, email khuyến mãi' },
    { name: 'Bạc', slug: 'silver', minSpending: 5000000, color: '#94a3b8', emoji: '🥈', iconKey: 'Award', sortOrder: 2, benefits: 'Quà sinh nhật cơ bản, hotline ưu tiên' },
    { name: 'Vàng', slug: 'gold', minSpending: 20000000, color: '#eab308', emoji: '🥇', iconKey: 'Trophy', sortOrder: 3, benefits: 'Giảm giá 5%, chăm sóc riêng' },
    { name: 'Bạch Kim', slug: 'platinum', minSpending: 50000000, color: '#14b8a6', emoji: '🏆', iconKey: 'Medal', sortOrder: 4, benefits: 'Giảm 10%, VIP support 24/7' },
    { name: 'Kim Cương', slug: 'diamond', minSpending: 100000000, color: '#a855f7', emoji: '💎', iconKey: 'Gem', sortOrder: 5, benefits: 'Giảm 15%, account manager riêng' },
  ];
  for (const t of defaultTiers) {
    await prisma.customerTier.upsert({ where: { slug: t.slug }, update: {}, create: t });
  }
  console.log('  ✓ Customer tiers');

  // ── Product Categories + Products (~9 khóa học) ────────────────────────────
  const [catCourse, catCombo] = await Promise.all([
    prisma.productCategory.create({ data: { name: 'Khóa học' } }),
    prisma.productCategory.create({ data: { name: 'Combo' } }),
  ]);
  const productDefs = [
    { name: 'Khóa học Facebook Ads', price: 3500000, cat: catCourse },
    { name: 'Khóa học SEO 2026', price: 4500000, cat: catCourse },
    { name: 'Khóa học Content Marketing', price: 2900000, cat: catCourse },
    { name: 'Khóa học ChatGPT cho Marketing', price: 2500000, cat: catCourse },
    { name: 'Khóa học Livestream bán hàng', price: 3900000, cat: catCourse },
    { name: 'Khóa học TikTok Ads', price: 4200000, cat: catCourse },
    { name: 'Khóa học Email Marketing', price: 1990000, cat: catCourse },
    { name: 'Khóa học Google Ads', price: 4800000, cat: catCourse },
    { name: 'Combo Digital Marketing Master', price: 19900000, cat: catCombo },
  ];
  const products = await Promise.all(
    productDefs.map((p) => prisma.product.create({ data: { name: p.name, price: p.price, categoryId: p.cat.id, vatRate: 10 } })),
  );
  console.log(`  ✓ Products (${products.length})`);

  // ── Labels ─────────────────────────────────────────────────────────────────
  const labelDefs = [
    { name: 'VIP', color: '#ef4444' },
    { name: 'Hot Lead', color: '#f97316' },
    { name: 'Cần follow-up', color: '#eab308' },
    { name: 'Đã liên hệ', color: '#22c55e' },
    { name: 'Chưa nghe máy', color: '#6b7280' },
    { name: 'Quan tâm cao', color: '#3b82f6' },
    { name: 'Học viên cũ', color: '#06b6d4' },
    { name: 'Chờ khai giảng', color: '#8b5cf6' },
    { name: 'Thu hồi tự động', color: '#dc2626', category: 'system' },
    { name: 'Từ hội thảo', color: '#10b981' },
  ];
  const labels = await Promise.all(labelDefs.map((l) => prisma.label.create({ data: l })));
  console.log('  ✓ Labels');

  // ── Customers (~150) ───────────────────────────────────────────────────────
  const assignableUsers = [...salesUsers, ...supportUsers];
  const customers = [];
  for (let i = 0; i < 150; i++) {
    const name = fullName();
    // ~78% ACTIVE, ~14% INACTIVE, ~8% FLOATING
    const r = Math.random();
    const status = r < 0.78 ? CustomerStatus.ACTIVE : r < 0.92 ? CustomerStatus.INACTIVE : CustomerStatus.FLOATING;
    const assigned = status === CustomerStatus.FLOATING ? null : pick(assignableUsers);
    customers.push(
      await prisma.customer.create({
        data: {
          phone: uniquePhone(),
          name,
          email: Math.random() < 0.6 ? slugEmail(name, i) : null,
          status,
          assignedUserId: assigned?.id ?? null,
          assignedDepartmentId: assigned ? (salesUsers.includes(assigned) ? sales.id : support.id) : null,
          createdAt: daysAgo(randInt(0, 180)),
        },
      }),
    );
  }
  console.log(`  ✓ Customers (${customers.length})`);

  // Vài customer có số phụ + nhãn.
  for (let i = 0; i < 12; i++) {
    const c = pick(customers);
    await prisma.customerPhone.create({ data: { customerId: c.id, phone: uniquePhone(), label: pick(['Vợ', 'Chồng', 'Thư ký', 'Công ty', 'Người thân']), createdBy: demoAdmin.id } });
  }
  const usedCustLabel = new Set<string>();
  for (let i = 0; i < 25; i++) {
    const c = pick(customers);
    const l = pick(labels);
    const key = `${c.id}-${l.id}`;
    if (usedCustLabel.has(key)) continue;
    usedCustLabel.add(key);
    await prisma.customerLabel.create({ data: { customerId: c.id, labelId: l.id } });
  }
  console.log('  ✓ Customer phones + labels');

  // ── Leads (~350) rải mọi status theo 3 kho ────────────────────────────────
  // Phân bổ status: POOL kho mới, POOL kho phòng ban, ASSIGNED, IN_PROGRESS,
  // CONVERTED, LOST, FLOATING.
  const leadStatusPlan: Array<{ status: LeadStatus; dept?: bigint; assign: boolean }> = [];
  const push = (n: number, cfg: { status: LeadStatus; dept?: bigint; assign: boolean }) => { for (let i = 0; i < n; i++) leadStatusPlan.push(cfg); };
  push(50, { status: LeadStatus.POOL, assign: false });                      // Kho Mới (không dept)
  push(45, { status: LeadStatus.POOL, dept: sales.id, assign: false });      // Kho phòng ban
  push(20, { status: LeadStatus.POOL, dept: support.id, assign: false });
  push(55, { status: LeadStatus.ASSIGNED, dept: sales.id, assign: true });
  push(60, { status: LeadStatus.IN_PROGRESS, dept: sales.id, assign: true });
  push(55, { status: LeadStatus.CONVERTED, dept: sales.id, assign: true });  // convert -> có order
  push(35, { status: LeadStatus.LOST, dept: sales.id, assign: true });
  push(30, { status: LeadStatus.FLOATING, assign: false });

  const leads = [];
  for (let i = 0; i < leadStatusPlan.length; i++) {
    const plan = leadStatusPlan[i];
    const group = pick(leadGroups);
    const name = fullName();
    const assignedUser = plan.assign ? pick(salesUsers) : null;
    const lead = await prisma.lead.create({
      data: {
        phone: uniquePhone(),
        name,
        email: Math.random() < 0.3 ? slugEmail(name, 1000 + i) : null,
        groupId: group.id,
        sourceId: groupSourceId.get(group.id.toString())!,
        productId: Math.random() < 0.7 ? pick(products).id : null,
        assignedUserId: assignedUser?.id ?? null,
        departmentId: plan.dept ?? null,
        status: plan.status,
        labelId: Math.random() < 0.25 ? pick(labels).id : null,
        createdAt: daysAgo(randInt(0, 180)),
      },
    });
    leads.push({ lead, status: plan.status, assignedUser });
  }
  console.log(`  ✓ Leads (${leads.length})`);

  // ── Orders (~180) backdate rải 6 tháng ─────────────────────────────────────
  // Top performer: sale index 0,1,2 tạo nhiều đơn hơn. leadId chỉ gán cho lead CONVERTED.
  const convertedLeads = leads.filter((l) => l.status === LeadStatus.CONVERTED);
  const activeCustomers = customers.filter((c) => c.status !== CustomerStatus.FLOATING);
  const orders: Array<{ id: bigint; total: number; createdAt: Date; createdBy: bigint; status: OrderStatus }> = [];

  const weightedSale = (): typeof salesUsers[number] => {
    // 55% đơn rơi vào 3 top sale đầu, 45% cho phần còn lại.
    if (Math.random() < 0.55) return salesUsers[rand(Math.min(3, salesUsers.length))];
    return pick(salesUsers);
  };

  for (let i = 0; i < 180; i++) {
    const product = pick(products);
    const price = Number(product.price);
    const vatRate = 10;
    const vatAmount = Math.round(price * vatRate / 100);
    const totalAmount = price + vatAmount;
    // ~72% COMPLETED, ~18% PENDING (schema chỉ có PENDING/COMPLETED)
    const status = Math.random() < 0.78 ? OrderStatus.COMPLETED : OrderStatus.PENDING;
    const createdAt = daysAgo(randInt(0, 180));
    const sale = weightedSale();
    // Ưu tiên gắn 1 lead converted (nếu còn), luôn gắn customer.
    const linkLead = i < convertedLeads.length ? convertedLeads[i] : null;
    const customer = pick(activeCustomers);
    const order = await prisma.order.create({
      data: {
        leadId: linkLead?.lead.id ?? null,
        customerId: customer.id,
        productId: product.id,
        amount: price,
        vatRate,
        vatAmount,
        totalAmount,
        status,
        customerName: customer.name,
        customerPhone: customer.phone,
        courseCode: `KH-${String(2026)}-${String(randInt(100, 999))}`,
        createdBy: (linkLead?.assignedUser?.id) ?? sale.id,
        createdAt,
      },
    });
    orders.push({ id: order.id, total: totalAmount, createdAt, createdBy: (linkLead?.assignedUser?.id) ?? sale.id, status });
  }
  console.log(`  ✓ Orders (${orders.length})`);

  // ── Payments (~200+) khớp order, đa số VERIFIED ────────────────────────────
  let paymentCount = 0;
  for (const order of orders) {
    if (order.status === OrderStatus.COMPLETED) {
      // Đã thu đủ: 1 payment full VERIFIED, hoặc 2 lần (lần 1 VERIFIED + lần 2 VERIFIED).
      const verifiedAt = new Date(order.createdAt.getTime() + randInt(1, 5) * 3600000);
      if (Math.random() < 0.7) {
        await prisma.payment.create({
          data: {
            orderId: order.id, paymentTypeId: ptFull.id, amount: order.total,
            status: PaymentStatus.VERIFIED, verifiedBy: demoAdmin.id, verifiedAt, verifiedSource: 'AUTO',
            transferContent: 'CK FULL KHOA HOC', createdBy: order.createdBy, createdAt: order.createdAt,
          },
        });
        paymentCount++;
      } else {
        const half = Math.round(order.total / 2);
        await prisma.payment.create({ data: { orderId: order.id, paymentTypeId: ptLan1.id, amount: half, status: PaymentStatus.VERIFIED, verifiedBy: demoAdmin.id, verifiedAt, verifiedSource: 'AUTO', transferContent: 'CK LAN 1', createdBy: order.createdBy, createdAt: order.createdAt } });
        await prisma.payment.create({ data: { orderId: order.id, paymentTypeId: ptLan2.id, amount: order.total - half, status: PaymentStatus.VERIFIED, verifiedBy: demoAdmin.id, verifiedAt: new Date(verifiedAt.getTime() + 2 * 86400000), verifiedSource: 'MANUAL', transferContent: 'CK LAN 2', createdBy: order.createdBy, createdAt: new Date(order.createdAt.getTime() + 2 * 86400000) } });
        paymentCount += 2;
      }
    } else {
      // PENDING order: 1 payment PENDING, đôi khi REJECTED.
      const isRejected = Math.random() < 0.25;
      await prisma.payment.create({
        data: {
          orderId: order.id, paymentTypeId: ptLan1.id, amount: order.total,
          status: isRejected ? PaymentStatus.REJECTED : PaymentStatus.PENDING,
          statusReason: isRejected ? 'Nội dung CK không khớp mã đơn' : null,
          verifiedBy: isRejected ? demoAdmin.id : null,
          verifiedAt: isRejected ? new Date(order.createdAt.getTime() + 4 * 3600000) : null,
          verifiedSource: isRejected ? 'MANUAL' : null,
          transferContent: 'CK KHOA HOC', createdBy: order.createdBy, createdAt: order.createdAt,
        },
      });
      paymentCount++;
    }
  }
  console.log(`  ✓ Payments (${paymentCount})`);

  // ── Activities (~50) ───────────────────────────────────────────────────────
  const noteContents = [
    'Khách quan tâm khóa học, hẹn tư vấn lại vào cuối tuần',
    'Đã gửi lộ trình học qua Zalo, chờ khách phản hồi',
    'Khách hỏi về học phí trả góp, đã gửi bảng giá',
    'Khách muốn học thử 1 buổi trước khi đăng ký',
    'Chốt đơn Combo Digital Marketing, khách chuyển khoản trong hôm nay',
    'Khách bận, hẹn gọi lại sau 3 ngày',
    'Đã tư vấn xong, khách cân nhắc thêm với gia đình',
    'Khách là học viên cũ, giới thiệu thêm bạn bè đăng ký',
  ];
  let activityCount = 0;
  for (let i = 0; i < 50; i++) {
    const useCustomer = Math.random() < 0.4;
    const type = pick(['NOTE', 'CALL', 'STATUS_CHANGE'] as const);
    if (useCustomer) {
      const c = pick(customers);
      await prisma.activity.create({ data: { entityType: 'CUSTOMER', entityId: c.id, userId: (c.assignedUserId ?? demoAdmin.id), type, content: pick(noteContents), metadata: type === 'CALL' ? { duration: randInt(60, 1200), callType: 'OUTGOING' } : undefined, createdAt: daysAgo(randInt(0, 120)) } });
    } else {
      const l = pick(leads);
      await prisma.activity.create({ data: { entityType: 'LEAD', entityId: l.lead.id, userId: (l.assignedUser?.id ?? demoAdmin.id), type, content: pick(noteContents), metadata: type === 'CALL' ? { duration: randInt(60, 1200), callType: 'OUTGOING' } : undefined, createdAt: daysAgo(randInt(0, 120)) } });
    }
    activityCount++;
  }
  console.log(`  ✓ Activities (${activityCount})`);

  // ── Call Logs (~40) ────────────────────────────────────────────────────────
  for (let i = 0; i < 40; i++) {
    const onCustomer = Math.random() < 0.5;
    const target = onCustomer ? pick(customers) : pick(leads).lead;
    const callType = pick([CallType.OUTGOING, CallType.INCOMING, CallType.MISSED]);
    const callTime = daysAgo(randInt(0, 90));
    await prisma.callLog.create({
      data: {
        externalId: `demo-call-${i}-${Date.now()}`,
        phoneNumber: target.phone,
        callType,
        callTime,
        duration: callType === CallType.MISSED ? 0 : randInt(30, 1500),
        content: callType === CallType.MISSED ? 'Khách không nghe máy' : 'Tư vấn khóa học qua điện thoại',
        matchedEntityType: onCustomer ? 'CUSTOMER' : 'LEAD',
        matchedEntityId: target.id,
        matchedUserId: pick(salesUsers).id,
        matchStatus: MatchStatus.AUTO_MATCHED,
        createdAt: callTime,
      },
    });
  }
  console.log('  ✓ Call logs (40)');

  // ── Tasks (~30) một số quá hạn, một số sắp tới ─────────────────────────────
  const taskTitles = [
    'Gọi lại tư vấn khóa Facebook Ads',
    'Gửi hợp đồng khóa học cho khách',
    'Follow-up khách quan tâm Combo Digital',
    'Nhắc khách hoàn tất chuyển khoản đợt 2',
    'Chăm sóc học viên sau khai giảng',
    'Chốt đơn khóa SEO cho khách hẹn hôm nay',
    'Gửi tài liệu học thử cho lead mới',
    'Xác nhận lịch học với khách đã đăng ký',
  ];
  for (let i = 0; i < 30; i++) {
    const overdue = Math.random() < 0.35;
    const done = Math.random() < 0.25;
    const dueDate = overdue ? daysAgo(randInt(1, 20)) : new Date(Date.now() + randInt(1, 14) * 86400000);
    const assignee = pick([...salesUsers, ...supportUsers]);
    await prisma.task.create({
      data: {
        title: pick(taskTitles),
        description: Math.random() < 0.5 ? 'Ưu tiên xử lý trong ngày, khách đang quan tâm cao.' : null,
        assignedTo: assignee.id,
        createdBy: pick([managerSales.id, leaderSales.id, demoAdmin.id]),
        dueDate,
        status: done ? TaskStatus.COMPLETED : TaskStatus.PENDING,
        priority: pick([TaskPriority.LOW, TaskPriority.MEDIUM, TaskPriority.HIGH]),
        completedAt: done ? daysAgo(randInt(0, 10)) : null,
        createdAt: daysAgo(randInt(0, 60)),
      },
    });
  }
  console.log('  ✓ Tasks (30)');

  // ── Recall Config ──────────────────────────────────────────────────────────
  await prisma.recallConfig.create({
    data: { entityType: 'LEAD', maxDaysInPool: 7, autoLabelId: labels[8].id, createdBy: demoAdmin.id },
  });

  console.log('\n✅ Demo seed completed!');
  console.log(`   Đăng nhập demo: demo@crm-custom.vn / ${process.env.SEED_PASSWORD ? '<SEED_PASSWORD env>' : SEED_PASSWORD}`);
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => {
    console.error('Demo seed failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
