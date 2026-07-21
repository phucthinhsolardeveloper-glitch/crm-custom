/**
 * Frontend entity interfaces derived from API response shapes.
 * These represent the data as received from NestJS API (BigInt serialized as string).
 */

// ─── Common ────────────────────────────────────────────────────────────────

export interface NamedEntity {
  id: string;
  name: string;
}

export interface LabelEntity {
  id: string;
  name: string;
  color: string;
  textColor: string;
  category?: string | null;
  isActive?: boolean;
  /** Khi gán nhãn này cho lead ở bảng /leads → tự mở popup tạo đơn hàng. */
  triggersOrder?: boolean;
}

export interface NestedLabel {
  label: LabelEntity;
}

export interface LabelRecallConfigItem {
  id: string;
  labelId: string;
  // Window stored as raw MINUTES. UI decomposes into value+unit (min/hour/day) for display/edit.
  recallMinutes: number;
  // RECALL = pull lead back to POOL when overdue, NOTIFY = only notify the holder.
  // "Nothing" mode = no config row at all.
  action: 'RECALL' | 'NOTIFY';
  isActive: boolean;
  label?: { id: string; name: string; color: string; textColor: string };
}

// ─── User ──────────────────────────────────────────────────────────────────

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  role: 'SUPER_ADMIN' | 'MANAGER' | 'LEADER' | 'USER';
  status: 'ACTIVE' | 'INACTIVE';
  departmentId: string | null;
  teamId: string | null;
  employeeLevelId?: string | null;
  department?: NamedEntity | null;
  team?: NamedEntity | null;
  employeeLevel?: NamedEntity | null;
  // Có cấu hình SIP/tổng đài hay chưa (chỉ trả về id để biết tồn tại).
  sipConfig?: { id: string } | null;
}

// ─── Lead ──────────────────────────────────────────────────────────────────

export interface LeadRecord {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  status: string;
  companyName?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  zaloUrl?: string | null;
  linkedinUrl?: string | null;
  sourceId?: string | null;
  groupId?: string | null;
  productId?: string | null;
  customerId?: string | null;
  source?: NamedEntity | null;
  group?: NamedEntity | null;
  product?: NamedEntity | null;
  assignedUser?: NamedEntity | null;
  department?: NamedEntity | null;
  customer?: { name: string; phone?: string | null } | null;
  labelId?: string | null;
  label?: LabelEntity | null;
  labelAssignedAt?: string | null;
  orders?: OrderRecord[];
  activityCount?: number;
  lastInteractionAt?: string | null;
  metadata?: LeadMetadata | null;
  createdAt: string;
}

export interface LeadMetadata {
  aiLevel?: string;
  aiScore?: number;
  aiSummary?: string;
  aiScoreReason?: string;
  [key: string]: unknown;
}

// ─── Customer ──────────────────────────────────────────────────────────────

export interface CustomerPhoneRecord {
  id: string;
  customerId: string;
  phone: string;
  label?: string | null;
  note?: string | null;
  createdAt: string;
}

/** Hạng KH - config qua /settings/customer-tiers (SUPER_ADMIN). */
export interface CustomerTier {
  id: string;
  name: string;
  slug: string;
  /** Decimal serialized as string. Ngưỡng VND. */
  minSpending: string;
  /** Hex #RRGGBB. */
  color: string;
  /** SUPER_ADMIN tự set qua admin UI. Ưu tiên hơn iconKey khi render. */
  emoji: string | null;
  /** Lucide icon name fallback khi emoji null (Award/Trophy/Medal/Gem/Crown/Star). */
  iconKey: string | null;
  sortOrder: number;
  benefits: string | null;
  isActive: boolean;
}

export interface CustomerRecord {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  status: string;
  shortDescription?: string | null;
  description?: string | null;
  aiRating?: number | null;
  /** ISO date YYYY-MM-DD. Năm chỉ để tính tuổi, ngày tháng dùng cho reminder. */
  birthday?: string | null;
  /** Computed ở backend: số ngày tới sinh nhật tiếp theo. `null` nếu birthday null. */
  daysUntilBirthday?: number | null;
  /** Computed ở backend: timestamp activity mới nhất (mọi loại). `null` nếu chưa có activity. */
  lastContactAt?: string | null;
  companyName?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  zaloUrl?: string | null;
  linkedinUrl?: string | null;
  /** Địa chỉ có cấu trúc (mô hình 2 cấp: tỉnh/thành -> phường/xã + số nhà/đường tự nhập). */
  addressProvinceCode?: string | null;
  addressProvinceName?: string | null;
  addressWardCode?: string | null;
  addressWardName?: string | null;
  addressStreet?: string | null;
  /** Avatar relative path. Frontend prefix với host nếu cần. */
  avatarUrl?: string | null;
  /** Decimal serialized string. Denormalized SUM(payments VERIFIED). */
  totalSpent?: string | null;
  currentTierId?: string | null;
  /** Tier object (subset fields cần render badge). */
  currentTier?: Pick<CustomerTier, 'id' | 'name' | 'slug' | 'color' | 'emoji' | 'iconKey'> & {
    minSpending?: string;
  } | null;
  assignedUserId?: string | null;
  assignedDepartmentId?: string | null;
  assignedUser?: NamedEntity | null;
  assignedDepartment?: NamedEntity | null;
  department?: NamedEntity | null;
  /** Computed BE: phòng ban của lead CONVERTED gần nhất (fallback lead gần nhất). Hiển thị sidebar. */
  leadDepartment?: NamedEntity | null;
  employeeLevel?: NamedEntity | null;
  labels?: NestedLabel[];
  leads?: LeadRecord[];
  orders?: OrderRecord[];
  phones?: CustomerPhoneRecord[];
  /** Counts dùng cho tab badges (orders, leads, phones, ...). */
  _count?: {
    leads?: number;
    orders?: number;
    phones?: number;
  };
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt?: string;
}

// ─── Order ─────────────────────────────────────────────────────────────────

export interface OrderRecord {
  id: string;
  status: string;
  totalAmount: number;
  amount?: number;
  quantity?: number;
  larkSyncId?: string | null;
  vatRate?: number;
  vatAmount?: number;
  notes?: string | null;
  vatEmail?: string | null;
  companyName?: string | null;
  taxCode?: string | null;
  contactPerson?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  address?: string | null;
  courseCode?: string | null;
  stt?: string | null;
  formatId?: string | null;
  productGroupId?: string | null;
  orderFormat?: NamedEntity | null;
  productGroup?: NamedEntity | null;
  customer?: { id?: string; name: string; phone?: string | null };
  product?: { id?: string; name: string; price?: number } | null;
  lead?: { id: string; name: string; phone: string; status: string; source?: NamedEntity | null } | null;
  creator?: { id?: string; name: string; team?: NamedEntity | null } | null;
  payments?: PaymentRecord[];
  createdAt: string;
}

// ─── Payment ───────────────────────────────────────────────────────────────

export interface PaymentRecord {
  id: string;
  amount: number;
  status: string;
  orderId?: string;
  createdBy?: string | null; // Nguoi tao payment. Dung de USER biet payment nao la cua minh de sua/huy.
  creator?: { id: string; name: string } | null; // Nguoi tao payment (ten). Null = payment cu / import / webhook.
  bestMatchScore?: number | null;
  candidateCount?: number;
  paymentType?: NamedEntity | null;
  bankAccount?: NamedEntity | null;
  transferContent?: string | null;
  transferDate?: string | null;
  vatAmount?: number | null;
  installmentId?: string | null;
  installment?: NamedEntity | null;
  verifiedSource?: string | null;
  verifier?: NamedEntity | null;
  verifiedAt?: string | null;
  notes?: string | null;
  completionRate?: number | null;
  matchedTransaction?: { id: string; externalId?: string | null; amount: number; content: string; senderName?: string | null; transactionTime?: string | null } | null;
  order?: {
    id: string;
    status: string;
    amount?: number;
    vatRate?: number;
    totalAmount: number;
    vatEmail?: string | null;
    companyName?: string | null;
    taxCode?: string | null;
    contactPerson?: string | null;
    address?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    courseCode?: string | null;
    stt?: string | null;
    customer?: { id: string; name: string; phone?: string | null } | null;
    product?: { id: string; name: string; price?: number } | null;
    productGroup?: NamedEntity | null;
    orderFormat?: NamedEntity | null;
    creator?: { id: string; name: string; team?: NamedEntity | null } | null;
    lead?: { id: string; name: string; source?: NamedEntity | null; group?: NamedEntity | null } | null;
  } | null;
  createdAt: string;
}

// ─── Refund (bảng hoàn tiền nhập tay) ──────────────────────────────────────

export interface RefundRecord {
  id: string;
  customerName?: string | null;
  customerPhone?: string | null;
  productId?: string | null;
  productName?: string | null;
  productPrice?: number | null; // Doanh thu về công ty (gồm VAT) - snapshot giá SP lúc tạo
  vatRate?: number | null;      // %VAT snapshot; tiền VAT = price*vat/(100+vat)
  groupName?: string | null;
  teamName?: string | null;
  refundDate?: string | null;
  amount: number;
  refundMethod?: string | null;
  refundBank?: string | null;
  billImage?: string | null;    // Duong dan tuong doi anh bill (uploads/)
  notes?: string | null;
  createdBy?: string | null;
  larkSyncId?: string | null;   // Đường ống Lark đã chọn để đổ dòng hoàn tiền
  larkSyncedAt?: string | null; // Mốc đổ Lark thành công gần nhất
  creator?: { id: string; name: string; team?: NamedEntity | null } | null;
  createdAt: string;
}

// ─── BankTransaction ───────────────────────────────────────────────────────

export interface BankTransactionRecord {
  id: string;
  amount: number;
  status: string;
  transactionTime: string;
  content?: string | null;
  senderName?: string | null;
  matchStatus: string;
}

// ─── Payment matching (scoring) ────────────────────────────────────────────

export interface ScoreReason {
  key: 'amount' | 'content' | 'sender' | 'time';
  weight: number;
  label: string;
}

export interface MatchCandidate {
  bankTx: BankTransactionRecord;
  score: number;
  reasons: ScoreReason[];
}

export interface FuzzyQueueItem {
  bankTx: BankTransactionRecord;
  payment: PaymentRecord;
  score: number;
  reasons: ScoreReason[] | null;
}

export interface PaymentReconStats {
  pendingCount: number;
  unmatchedCount: number;
  fuzzyCount: number;
  todayMatchedCount: number;
  autoMatchRate: number;
}

// ─── Product ───────────────────────────────────────────────────────────────

export interface ProductRecord {
  id: string;
  name: string;
  price?: number;
  description?: string | null;
  category?: NamedEntity | null;
  categoryId?: string | null;
  vatRate?: number;
  isActive: boolean;
  /** SP gom nhiều SP con. */
  isCombo?: boolean;
  /** SP con khi đây là combo (rỗng nếu không phải combo). */
  comboItems?: { child: { id: string; name: string; price?: number } }[];
}

/** Số lượng sản phẩm theo danh mục - phục vụ sidebar lọc ở trang Sản phẩm. */
export interface ProductCategoryCounts {
  total: number;
  uncategorized: number;
  byCategory: Record<string, number>;
}

/** Số lượng sản phẩm theo loại - sidebar lọc (Tất cả / Combo / Thường / Đã tắt). */
export interface ProductTypeCounts {
  all: number;
  combo: number;
  normal: number;
  inactive: number;
}

// ─── CallLog ───────────────────────────────────────────────────────────────

/** Schema v2 bento - tat ca field moi deu optional de backward-compat log v1. */
export interface CallAnalysisV2 {
  tags?: string[];
  detail?: string;
  score?: number | null;
  summary?: string;
  meta?: { mood?: string; intent?: string; outcome?: string };
  customer?: { need?: string; concern?: string; moods?: string[] };
  sale?: { intent?: string; strengths?: string[]; improvements?: string[] };
  actions?: Array<{
    title: string;
    priority?: 'urgent' | 'today' | 'optional';
    dueHint?: string;
    note?: string;
  }>;
}

export interface CallLogRecord {
  id: string;
  externalId?: string;
  phoneNumber: string;
  callType: string;
  callTime: string;
  duration?: number;
  content?: string | null;
  // analysis tu API: JSON string (v1 hoac v2). UI parses qua parseAnalysis().
  // Schema v2 bento: { tags, detail, score?, summary?, meta?, customer?, sale?, actions? }
  analysis?: string | CallAnalysisV2 | null;
  matchStatus: string;
  matchedEntityType?: string | null;
  matchedEntityId?: string | null;
  matchedUserId?: string | null;
  matchedUser?: { id: string; name: string } | null;
  recordingUrl?: string | null;
  hangupCause?: string | null;
  disposition?: string | null;
  endbyName?: string | null;
}

export interface SaleSummary {
  id: string;
  name: string;
  count: number;
}

export interface CallFeedbackRecord {
  id: string;
  callLogId: string;
  content: string;
  author: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

// ─── Task ──────────────────────────────────────────────────────────────────

export interface TaskRecord {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: string | null;
  remindAt?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  assignedTo?: string | null;
  createdAt: string;
}

// ─── Activity ──────────────────────────────────────────────────────────────

export interface ActivityRecord {
  id: string;
  type: string;
  content?: string | null;
  createdAt: string;
  user?: NamedEntity | null;
  metadata?: { duration?: number; [key: string]: unknown } | null;
  _source?: string;
}

// ─── User Phone Assignment ─────────────────────────────────────────────────

export interface UserPhoneRecord {
  id: string;
  phone: string;
  userId: string;
  user?: {
    id: string;
    name: string;
    email: string;
    department?: { name: string } | null;
  } | null;
  assignedAt: string;
  assignedBy: string;
  assigner?: { id: string; name: string } | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPhoneHistoryRecord {
  id: string;
  phone: string;
  userId: string;
  user?: { id: string; name: string } | null;
  assignedAt: string;
  releasedAt: string;
  reason: 'TRANSFERRED' | 'DELETED' | 'REASSIGNED';
  changedBy: string;
  changer?: { id: string; name: string } | null;
  note: string | null;
  createdAt: string;
}

export interface BulkUserPhoneRow {
  phone: string;
  userId: string;
  status: 'CREATED' | 'SKIPPED' | 'FAILED';
  reason?: string;
  id?: string;
}

export interface BulkUserPhoneResponse {
  created: BulkUserPhoneRow[];
  skipped: BulkUserPhoneRow[];
  failed: BulkUserPhoneRow[];
}

// ─── Settings ──────────────────────────────────────────────────────────────

export interface SettingsItem {
  id: string;
  name: string;
  [key: string]: unknown;
}

// ─── API Response ──────────────────────────────────────────────────────────

export interface ApiListResponse<T> {
  data: T[];
  meta?: {
    nextCursor?: string;
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
    // Tong tien toan bo tap dang loc (dong tong cuoi bang /orders). Chi payments list tra ve.
    totals?: { amount: number; vatAmount: number; netRevenue: number };
  };
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalLeads?: number;
  totalCustomers?: number;
  totalOrders?: number;
  totalRevenue?: number;
  [key: string]: unknown;
}

// ─── Phễu Livestream (manager+ điền) ───────────────────────────────────────

/** 1 dòng phễu = 1 khoá (lớp phễu) gắn 1 ngày. Khớp FunnelClass ở backend. */
export interface FunnelClass {
  id: string;
  entryDate: string; // 'YYYY-MM-DD'
  lopPheu: string;
  adBudget: number | null;
  khachDienForm: number | null;
  soMatXem: number | null;
  vaoNhomZalo: number | null;
  slVaoZoom: number | null;
  mua: number | null;
  cocTrongZoom: number | null;
  doanhThu: number | null;
  /** Doanh thu tự cộng từ đơn CRM có Mã khoá = tên khoá (null = không có đơn khớp). */
  doanhThuAuto: number | null;
  notes: string | null;
}

/** Các field số nhập tay (dùng cho ô input + lưu PUT). */
export type FunnelNumField =
  | 'adBudget' | 'khachDienForm' | 'soMatXem' | 'vaoNhomZalo'
  | 'slVaoZoom' | 'mua' | 'cocTrongZoom' | 'doanhThu';

// ─── Đối soát thanh toán theo mệnh giá ─────────────────────────────────────

/** 1 phiếu Sale rút gọn để hiển thị trong bảng đối soát. */
export interface ReconPayment {
  id: string;
  amount: number;
  status: string;
  transferContent: string | null;
  transferDate: string | null;
  customerName: string | null;
  productName: string | null;
  sourceName: string | null;
  installmentName: string | null;
  createdAt: string | null;
}

/** 1 giao dịch ngân hàng rút gọn để hiển thị trong bảng đối soát. */
export interface ReconBankTx {
  id: string;
  amount: number;
  content: string;
  senderName: string | null;
  senderAccount: string | null;
  transactionTime: string | null;
  matchStatus: string;
  matchedPaymentId: string | null;
}

/** 1 cặp ghép Sale <-> Bank trong 1 mệnh giá. Thiếu 1 bên = lệch. */
export interface DenominationPair {
  paymentId?: string;
  bankTxId?: string;
  score: number;
  mapped: boolean;
  reasons: Array<{ key: string; weight: number; label: string }>;
  payment?: ReconPayment;
  bankTx?: ReconBankTx;
}

/** 1 mệnh giá (nhóm cùng số tiền) sau khi gom + ghép cặp. */
export interface DenominationGroup {
  amount: number;
  saleCount: number;
  bankCount: number;
  saleSum: number;
  bankSum: number;
  diff: number;
  mappedCount: number;
  pairTotal: number;
  status: 'ok' | 'warn' | 'err';
  pairs: DenominationPair[];
}

/** Kết quả đối soát 1 khoảng thời gian. Khớp response GET /payments/reconciliation. */
export interface ReconciliationResult {
  denominations: DenominationGroup[];
  summary: {
    saleTxTotal: number;
    bankTxTotal: number;
    saleGrandSum: number;
    bankGrandSum: number;
    grandDiff: number;
    okDenomCount: number;
    totalDenomCount: number;
    mappedGrandTotal: number;
    pairGrandTotal: number;
  };
}

// Tien du: giao dich bank khong phai ban hang, admin danh dau tay. Bang tach CRM.
export interface SurplusTransaction {
  id: string;
  externalId: string;
  amount: number;
  content: string;
  senderName?: string | null;
  senderAccount?: string | null;
  transactionTime: string;
  note?: string | null;
  markedBy: string;
  markedAt: string;
}

// Lich su 1 lan doi soat (ban tom tat nhe). summary = ReconciliationResult['summary'].
export interface ReconciliationRun {
  id: string;
  fromDate: string;
  toDate: string;
  runBy: string;
  runAt: string;
  summary: ReconciliationResult['summary'];
}
