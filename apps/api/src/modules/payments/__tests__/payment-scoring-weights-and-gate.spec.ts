import { describe, expect, it } from 'vitest';
import { PaymentScoringService } from '../payment-scoring.service';

/**
 * Trọng số: content 50, sender 22, amount 20, time 8 (tổng 100).
 * Ngưỡng dùng ở cron: AUTO 90, FUZZY 65.
 * Gate: content=0 VÀ sender=0 -> cap <=50 (không bao giờ chạm FUZZY).
 * Mục tiêu: "trùng tiền suông" KHÔNG được gợi ý; nội dung + tên người CK mới quyết định.
 */
describe('PaymentScoringService - trọng số + gate phân biệt', () => {
  const scoring = new PaymentScoringService();
  const day = '2026-06-20T10:00:00+07:00';

  it('nội dung + tiền + tên + thời gian khớp -> 100 (đủ AUTO >=90)', () => {
    const res = scoring.scorePair(
      { amount: 5_000_000, transferContent: 'CK khoa hoc ABC', transferDate: day, order: { customer: { name: 'Nguyen Van A' } } },
      { amount: 5_000_000, content: 'CK khoa hoc ABC nguyen van a', senderName: 'NGUYEN VAN A', transactionTime: day },
    );
    expect(res).not.toBeNull();
    expect(res!.score).toBe(100);
    expect(res!.score).toBeGreaterThanOrEqual(90);
  });

  it('CHỈ trùng tiền + ngày (không nội dung, không tên) -> bị gate cap, KHÔNG chạm FUZZY 65', () => {
    const res = scoring.scorePair(
      { amount: 5_000_000, transferContent: 'ma don XYZ999', transferDate: day, order: { customer: { name: 'Tran Thi B' } } },
      { amount: 5_000_000, content: 'thanh toan hoa don khac hoan toan', senderName: 'Le Van C', transactionTime: day },
    );
    expect(res).not.toBeNull();
    expect(res!.score).toBeLessThanOrEqual(50);
    expect(res!.score).toBeLessThan(65);
  });

  it('nội dung khớp + tiền + ngày (không tên) -> vùng FUZZY (65..<90), gợi ý chờ duyệt', () => {
    const res = scoring.scorePair(
      { amount: 5_000_000, transferContent: 'CK khoa hoc ABC', transferDate: day, order: { customer: { name: 'Nguyen Van A' } } },
      { amount: 5_000_000, content: 'CK khoa hoc ABC ai do chuyen', senderName: 'NGUOI KHAC', transactionTime: day },
    );
    expect(res).not.toBeNull();
    expect(res!.score).toBeGreaterThanOrEqual(65);
    expect(res!.score).toBeLessThan(90);
  });

  it('tên người CK khớp làm tăng điểm rõ rệt so với không khớp tên', () => {
    const base = { amount: 5_000_000, transferContent: 'CK abc', transferDate: day, order: { customer: { name: 'Nguyen Van A' } } };
    const withName = scoring.scorePair(base, { amount: 5_000_000, content: 'CK abc', senderName: 'Nguyen Van A', transactionTime: day });
    const noName = scoring.scorePair(base, { amount: 5_000_000, content: 'CK abc', senderName: 'Nguoi La', transactionTime: day });
    expect(withName!.score - noName!.score).toBe(22);
  });

  it('tên trong nội dung khớp dù bank chèn mã GD (không bị pha loãng), và thắng bank chỉ trùng tiền', () => {
    const pay = { amount: 13_500_000, transferContent: 'MTKC anh van', transferDate: day, order: { customer: { name: 'Quang Khai' } } };
    // Bank đúng: có "anh van" nhưng lẫn đầy mã GD/ref/ngày.
    const right = scoring.scorePair(pay, {
      amount: 13_500_000,
      content: 'MCKC anh van FT26195771920148 GD 6195IBT1kCKKFXR4 140726',
      senderName: 'HO KINH DOANH NGUYEN XUAN NAM', transactionTime: day,
    });
    // Bank sai: chỉ trùng tiền + ngày, nội dung khác hẳn.
    const wrong = scoring.scorePair(pay, {
      amount: 13_500_000, content: 'MTCK HOPECORP 0866575886 GD 6195MSCBD2GWK828', senderName: 'HOPE CORP', transactionTime: day,
    });
    expect(right!.score).toBeGreaterThan(wrong!.score);
    // "anh van" = 2/2 từ Sale -> content 40; đủ vượt ngưỡng gợi ý 40.
    expect(right!.score).toBeGreaterThanOrEqual(40 + 20);
  });

  it('lệch tiền quá tolerance ±5.000đ -> null (không phải ứng viên)', () => {
    const res = scoring.scorePair(
      { amount: 5_000_000, transferContent: 'CK abc', order: { customer: { name: 'A' } } },
      { amount: 5_010_000, content: 'CK abc', senderName: 'A', transactionTime: day },
    );
    expect(res).toBeNull();
  });
});
