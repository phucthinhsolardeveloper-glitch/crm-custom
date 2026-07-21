'use client';

interface BlockSectionLabelProps {
  index: number;
  title: string;
  /** Câu hỏi business mà block trả lời - hiển thị nhạt cạnh title. */
  question?: string;
}

/** Label đầu mỗi analytics block: số thứ tự + tiêu đề + câu hỏi. */
export function BlockSectionLabel({ index, title, question }: BlockSectionLabelProps) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className="flex h-6 w-6 shrink-0 translate-y-0.5 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-500 text-xs font-bold text-white">
        {index}
      </span>
      <h2 className="text-base font-bold text-slate-900">{title}</h2>
      {question && <span className="text-sm text-slate-400">{question}</span>}
    </div>
  );
}
