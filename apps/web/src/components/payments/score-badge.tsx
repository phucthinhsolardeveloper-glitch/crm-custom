import { Sparkles, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  score: number | null | undefined;
  className?: string;
}

/** Color-coded match-score chip. >=90 emerald, 65-89 amber, <65 hidden, null shows placeholder. */
export function ScoreBadge({ score, className }: Props) {
  if (score == null) {
    return (
      <span className={cn(
        'px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-medium',
        className,
      )}>
        Chưa có gợi ý
      </span>
    );
  }

  if (score >= 90) {
    return (
      <span className={cn(
        'px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center gap-1',
        className,
      )}>
        <Sparkles className="h-3 w-3" /> {score}% match
      </span>
    );
  }

  if (score >= 65) {
    return (
      <span className={cn(
        'px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center gap-1',
        className,
      )}>
        <HelpCircle className="h-3 w-3" /> {score}%
      </span>
    );
  }

  return null;
}
