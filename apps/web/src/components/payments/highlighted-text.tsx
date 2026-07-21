'use client';

import { highlightMatches } from '@crm/utils';
import { cn } from '@/lib/utils';

// Tô sáng đoạn text (theo từ) của `text` cũng xuất hiện trong `reference`.
// Dùng để nhìn ngay chỗ nội dung CK Sale nhập khớp với nội dung sao kê NH.
export function HighlightedText({
  text,
  reference,
  className,
}: {
  text?: string | null;
  reference?: string | null;
  className?: string;
}) {
  if (!text) return <span className="text-slate-400">-</span>;
  const segments = highlightMatches(text, reference);
  return (
    <span className={cn('break-all', className)}>
      {segments.map((seg, i) =>
        seg.matched ? (
          <mark key={i} className="rounded bg-emerald-200/70 px-0.5 text-emerald-900 font-semibold">
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
}
