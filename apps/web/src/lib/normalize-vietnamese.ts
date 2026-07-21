/**
 * Normalize tiếng Việt cho search: bỏ dấu, lowercase, trim.
 * "Thạch Sanh" -> "thach sanh" -> match "thach".
 */
export function normalizeVi(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
