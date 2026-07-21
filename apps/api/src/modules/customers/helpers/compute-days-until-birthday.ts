/**
 * Tính số ngày còn lại đến sinh nhật tiếp theo của KH.
 *
 * - Trả về `null` nếu không có birthday.
 * - Trả về `0` nếu hôm nay là sinh nhật (cùng tháng + cùng ngày).
 * - Sinh nhật năm nay đã qua → tính sang năm sau.
 * - Leap year edge case: KH sinh 29/02 → năm không nhuận sẽ rơi vào 01/03 (Date constructor tự rollover).
 *   Đây là behavior chấp nhận được cho mục đích reminder (sai 1 ngày, không lệch tháng).
 *
 * @param birthday - Ngày sinh (chỉ lấy month + day, year bỏ qua)
 * @param today - Reference date (default = now). Inject để test deterministic.
 */
export function computeDaysUntilBirthday(
  birthday: Date | null | undefined,
  today: Date = new Date(),
): number | null {
  if (!birthday) return null;

  // Reset giờ về 00:00:00 để so sánh chỉ theo ngày
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const month = birthday.getMonth();
  const day = birthday.getDate();

  let nextBirthday = new Date(todayMidnight.getFullYear(), month, day);
  if (nextBirthday < todayMidnight) {
    nextBirthday = new Date(todayMidnight.getFullYear() + 1, month, day);
  }

  const diffMs = nextBirthday.getTime() - todayMidnight.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}
