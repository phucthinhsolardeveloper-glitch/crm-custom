interface Props {
  progress: number;
  label?: string;
  error?: boolean;
}

export function ImportProgressBar({ progress, label, error }: Props) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex justify-between text-xs text-slate-600">
          <span>{label}</span>
          <span className="font-medium">{pct}%</span>
        </div>
      )}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`absolute h-full rounded-full transition-[width] duration-100 ease-linear ${
            error ? 'bg-red-500' : 'bg-gradient-to-r from-sky-400 to-cyan-400'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
