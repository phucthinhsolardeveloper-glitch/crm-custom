'use client';

interface LabelPillProps {
  label: { name: string; color: string; textColor?: string | null };
  size?: 'xs' | 'sm';
}

/**
 * Pill nhỏ hiển thị tên nhãn với màu nền + màu chữ admin đã set.
 * Dùng dưới SĐT trong bảng /leads (size xs) hoặc các chỗ khác cần label compact.
 */
export function LabelPill({ label, size = 'xs' }: LabelPillProps) {
  const sizeClass = size === 'sm'
    ? 'text-xs px-2 py-0.5'
    : 'text-[10px] px-1.5 py-0.5';
  return (
    <span
      className={`inline-block rounded font-medium max-w-[140px] truncate ${sizeClass}`}
      style={{ backgroundColor: label.color, color: label.textColor || '#ffffff' }}
      title={label.name}
    >
      {label.name}
    </span>
  );
}
