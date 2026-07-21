import { InfoTooltip } from './info-tooltip';

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  /** Text giải thích nguồn số liệu - render icon (i) cạnh title. */
  infoTooltip?: string;
}

export function ChartCard({ title, children, infoTooltip }: ChartCardProps) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.08)]">
      <h3 className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        {title}
        {infoTooltip && <InfoTooltip text={infoTooltip} />}
      </h3>
      {children}
    </div>
  );
}
