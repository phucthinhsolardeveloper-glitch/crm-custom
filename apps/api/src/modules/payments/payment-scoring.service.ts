import { Injectable } from '@nestjs/common';
import {
  stripVietnameseDiacritics,
  tokenize,
  levenshteinDistance,
} from '@crm/utils';

// Token thuần chữ cái (tên người, từ ngữ). Loại token chứa chữ số vì đó là mã
// GD/ref/ngày/SĐT ngân hàng tự chèn, không mang tín hiệu định danh khách.
const WORD_TOKEN = (t: string) => /^[a-z]+$/.test(t);

// 2 token coi như trùng: bằng nhau hoặc lệch <=1 ký tự (gõ nhầm/viết tắt:
// mtkc~mckc). Chỉ fuzzy với token >=3 ký tự để tránh khớp bừa từ quá ngắn.
const tokensSimilar = (a: string, b: string) =>
  a === b || (a.length >= 3 && b.length >= 3 && levenshteinDistance(a, b) <= 1);

// Score weights total 100: content 50, sender 22, amount 20, time 8.
// Tiền cố ý chỉ 20 điểm: nhiều khách chuyển cùng mệnh giá nên "trùng tiền suông"
// không được phép gợi ý. Dấu hiệu phân biệt thật là nội dung CK + tên chủ TK
// chuyển (senderName lấy từ cột "Tên tài khoản đối ứng" của sao kê).
// Gate: nếu cả nội dung và tên đều không khớp -> cap điểm dưới ngưỡng gợi ý.
const AMOUNT_TOLERANCE = 5000;
const AMOUNT_SOFT_TOLERANCE = 2000;

// Cả content lẫn sender = 0 -> chỉ còn tiền + thời gian, không đủ phân biệt.
// Cap tại đây để dù ngưỡng FUZZY có hạ về sau cũng không lọt gợi ý sai.
const NO_SIGNAL_CAP = 50;

// Cửa sổ thời gian (ngày): tiền vào ngân hàng cách ngày sale khai chuyển bao xa.
const TIME_FULL_DAYS = 3;
const TIME_NEAR_DAYS = 7;
const MS_PER_DAY = 86_400_000;

export type ScoreReasonKey = 'amount' | 'content' | 'sender' | 'time';

export interface ScoreReason {
  key: ScoreReasonKey;
  weight: number;
  label: string;
}

export interface MatchScore {
  score: number;
  reasons: ScoreReason[];
}

type DateLike = Date | string | null | undefined;

interface PaymentInput {
  amount: number | string | { toString(): string };
  transferContent?: string | null;
  transferDate?: DateLike;
  createdAt?: DateLike;
  order?: { customer?: { name?: string | null } | null } | null;
}

interface BankTxInput {
  amount: number | string | { toString(): string };
  content: string;
  senderName?: string | null;
  transactionTime?: DateLike;
}

@Injectable()
export class PaymentScoringService {
  /**
   * Score a (payment, bankTx) pair on 0..100. Returns null when amount delta
   * exceeds tolerance - signals the pair should NOT appear in candidates.
   */
  scorePair(payment: PaymentInput, bankTx: BankTxInput): MatchScore | null {
    const paymentAmount = Number(payment.amount);
    const bankAmount = Number(bankTx.amount);
    const delta = Math.abs(paymentAmount - bankAmount);

    if (delta > AMOUNT_TOLERANCE) return null;

    const reasons: ScoreReason[] = [];

    const amountScore = this.scoreAmount(delta, reasons);
    const contentScore = this.scoreContent(payment.transferContent ?? null, bankTx.content, reasons);

    // Mốc ngày của payment: ưu tiên ngày sale khai chuyển, fallback ngày tạo phiếu.
    const paymentDate = payment.transferDate ?? payment.createdAt ?? null;
    const timeScore = this.scoreTime(paymentDate, bankTx.transactionTime ?? null, reasons);

    const customerName = payment.order?.customer?.name ?? null;
    let senderScore = 0;
    if (customerName && bankTx.senderName) {
      senderScore = this.scoreSender(customerName, bankTx.senderName, reasons);
    }

    let score = amountScore + contentScore + timeScore + senderScore;

    // Gate phân biệt: không có tín hiệu nội dung lẫn tên -> cap dưới ngưỡng gợi ý.
    // Chặn kịch bản "nhiều khách cùng mệnh giá" bị ghép nhầm chỉ vì trùng tiền.
    if (contentScore === 0 && senderScore === 0) {
      score = Math.min(score, NO_SIGNAL_CAP);
    }

    return { score, reasons };
  }

  private scoreAmount(delta: number, reasons: ScoreReason[]): number {
    if (delta === 0) {
      reasons.push({ key: 'amount', weight: 20, label: 'Số tiền khớp 100%' });
      return 20;
    }
    if (delta <= AMOUNT_SOFT_TOLERANCE) {
      reasons.push({
        key: 'amount',
        weight: 15,
        label: `Lệch ${delta.toLocaleString('vi-VN')}đ (trong soft tolerance)`,
      });
      return 15;
    }
    reasons.push({
      key: 'amount',
      weight: 10,
      label: `Lệch ${delta.toLocaleString('vi-VN')}đ (trong tolerance ±5.000đ)`,
    });
    return 10;
  }

  private scoreContent(paymentContent: string | null, bankContent: string, reasons: ScoreReason[]): number {
    if (!paymentContent) return 0;

    const pNorm = stripVietnameseDiacritics(paymentContent).toLowerCase().trim();
    const bNorm = stripVietnameseDiacritics(bankContent).toLowerCase().trim();
    if (!pNorm) return 0;

    if (bNorm.includes(pNorm)) {
      reasons.push({ key: 'content', weight: 50, label: 'Nội dung khớp tuyệt đối' });
      return 50;
    }

    // Chỉ giữ token thuần chữ. Sao kê ngân hàng chèn mã GD/ref/ngày/SĐT
    // (FT26195..., 6195IBT..., 140726) - token chứa chữ số - pha loãng tín hiệu
    // tên/nội dung thật; loại đi để "anh van" không bị chia cho cả rổ mã số.
    const pTokens = tokenize(paymentContent).filter(WORD_TOKEN);
    const bTokens = tokenize(bankContent).filter(WORD_TOKEN);

    if (pTokens.length > 0 && bTokens.length > 0) {
      // Coverage phía Sale: bao nhiêu % từ khai báo xuất hiện bên bank. Fuzzy 1 ký
      // tự cho lỗi gõ/viết tắt (mtkc~mckc). Mẫu số = phía Sale (bên ngắn, chủ đích),
      // KHÔNG phải max -> mã GD dài bên bank không còn kéo tụt tỉ lệ.
      const matched = pTokens.filter((t) => bTokens.some((bt) => tokensSimilar(t, bt))).length;
      const coverage = matched / pTokens.length;
      if (coverage >= 0.7) {
        reasons.push({ key: 'content', weight: 40, label: `Nội dung khớp ${Math.round(coverage * 100)}% (${matched}/${pTokens.length} từ)` });
        return 40;
      }
      if (coverage >= 0.5) {
        reasons.push({ key: 'content', weight: 30, label: `Nội dung khớp ${Math.round(coverage * 100)}% (${matched}/${pTokens.length} từ)` });
        return 30;
      }
      if (coverage >= 0.34) {
        reasons.push({ key: 'content', weight: 18, label: `Nội dung khớp ${Math.round(coverage * 100)}% (${matched}/${pTokens.length} từ)` });
        return 18;
      }
    }

    const dist = levenshteinDistance(pNorm, bNorm);
    if (dist <= 3) {
      reasons.push({ key: 'content', weight: 15, label: `Nội dung gần giống (khác ${dist} ký tự)` });
      return 15;
    }

    return 0;
  }

  private scoreSender(customerName: string, senderName: string, reasons: ScoreReason[]): number {
    const cNorm = stripVietnameseDiacritics(customerName).toLowerCase().trim();
    const sNorm = stripVietnameseDiacritics(senderName).toLowerCase().trim();
    if (!cNorm || !sNorm) return 0;

    if (cNorm === sNorm || sNorm.includes(cNorm) || cNorm.includes(sNorm)) {
      reasons.push({ key: 'sender', weight: 22, label: 'Tên người chuyển khớp khách hàng' });
      return 22;
    }

    const cTokens = tokenize(customerName, new Set());
    const sTokens = tokenize(senderName, new Set());
    const common = cTokens.filter((t) => sTokens.includes(t));
    if (common.length > 0) {
      reasons.push({ key: 'sender', weight: 11, label: `Tên người chuyển trùng ${common.length} từ` });
      return 11;
    }

    return 0;
  }

  /**
   * Điểm theo độ gần thời gian giữa ngày tiền vào ngân hàng và mốc ngày payment.
   * Thiếu một trong hai mốc -> trả 0 (graceful, không push reason) để caller nào
   * không select trường ngày vẫn chạy bình thường.
   */
  private scoreTime(paymentDate: DateLike, bankTxTime: DateLike, reasons: ScoreReason[]): number {
    if (!paymentDate || !bankTxTime) return 0;

    const pMs = new Date(paymentDate).getTime();
    const bMs = new Date(bankTxTime).getTime();
    if (Number.isNaN(pMs) || Number.isNaN(bMs)) return 0;

    const diffDays = Math.abs(bMs - pMs) / MS_PER_DAY;

    if (diffDays <= TIME_FULL_DAYS) {
      reasons.push({ key: 'time', weight: 8, label: `Thời gian khớp (≤${TIME_FULL_DAYS} ngày)` });
      return 8;
    }
    if (diffDays <= TIME_NEAR_DAYS) {
      reasons.push({ key: 'time', weight: 4, label: `Thời gian gần (≤${TIME_NEAR_DAYS} ngày)` });
      return 4;
    }
    return 0;
  }
}
