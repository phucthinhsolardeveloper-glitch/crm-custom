// Tô sáng đoạn text trùng khớp giữa 2 chuỗi (dùng cho đối soát nội dung CK).
// Pure function - so khớp theo "từ" đã bỏ dấu tiếng Việt + lowercase, nhưng giữ
// nguyên chữ gốc để hiển thị. Trả về các segment liên tiếp {text, matched}.

import { stripVietnameseDiacritics } from './text-similarity';

export interface HighlightSegment {
  text: string;
  matched: boolean;
}

// Từ ngắn dưới ngưỡng này không tô (tránh nhiễu do "ck", "tt", số lẻ...).
const MIN_MATCH_LEN = 3;

function normalizeWord(word: string): string {
  return stripVietnameseDiacritics(word).toLowerCase();
}

/** Tập "từ" chuẩn hoá của chuỗi tham chiếu, chỉ giữ từ đủ dài. */
function buildReferenceSet(reference: string): Set<string> {
  const set = new Set<string>();
  for (const raw of reference.split(/[^\p{L}\p{N}]+/u)) {
    const norm = normalizeWord(raw);
    if (norm.length >= MIN_MATCH_LEN) set.add(norm);
  }
  return set;
}

/**
 * Chia `source` thành các đoạn, đánh dấu đoạn nào là "từ" cũng xuất hiện trong
 * `reference`. Segment cùng trạng thái liền nhau được gộp để render ít span hơn.
 */
export function highlightMatches(source: string | null | undefined, reference: string | null | undefined): HighlightSegment[] {
  if (!source) return [];
  if (!reference) return [{ text: source, matched: false }];

  const refSet = buildReferenceSet(reference);
  // Tách xen kẽ: cụm ký tự chữ/số VÀ cụm ngăn cách (khoảng trắng, dấu câu).
  const parts = source.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) ?? [];

  const segments: HighlightSegment[] = [];
  for (const part of parts) {
    const norm = normalizeWord(part);
    const isWord = /[\p{L}\p{N}]/u.test(part);
    const matched = isWord && norm.length >= MIN_MATCH_LEN && refSet.has(norm);

    const last = segments[segments.length - 1];
    if (last && last.matched === matched) {
      last.text += part; // gộp với segment trước cùng trạng thái
    } else {
      segments.push({ text: part, matched });
    }
  }
  return segments;
}
