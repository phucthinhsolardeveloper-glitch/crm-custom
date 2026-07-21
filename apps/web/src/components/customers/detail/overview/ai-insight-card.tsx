'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Loader2, RefreshCw, FileSearch, Star, Info } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { toast } from 'sonner';
import { useAuth } from '@/providers/auth-provider';

interface Props {
  customerId: string;
  shortDescription: string | null | undefined;
  description: string | null | undefined;
  aiRating: number | null | undefined;
}

// AI Insight card - hero của overview tab.
// - Có data: quote + confidence bar + 2 buttons (Phân tích lại + Xem chi tiết).
// - Không có data: CTA "Phân tích AI ngay".
// - Detail dialog hiển thị full `description` (phân tích đầy đủ, không bị truncate).
export function AiInsightCard({ customerId, shortDescription, description, aiRating }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [analyzing, setAnalyzing] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const insightText = shortDescription || description;
  const hasData = Boolean(insightText?.trim());
  // Đã có phân tích thì chỉ MANAGER+ được phân tích lại (backend cũng enforce)
  const canReAnalyze = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';

  async function runAnalyze() {
    setAnalyzing(true);
    try {
      await api.post(`/customers/${customerId}/analyze`);
      toast.success('Phân tích AI hoàn tất');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể phân tích';
      toast.error(message);
    } finally {
      setAnalyzing(false);
    }
  }

  if (analyzing) {
    return (
      <Wrapper>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-violet-500 mb-2" />
          <p className="text-sm text-slate-600 font-semibold">Đang phân tích...</p>
          <p className="text-xs text-slate-500 mt-1">Có thể mất 10-30 giây</p>
        </div>
      </Wrapper>
    );
  }

  if (!hasData) {
    return (
      <Wrapper>
        <div className="flex flex-col items-center justify-center text-center py-6">
          <div className="text-3xl mb-2">🤖</div>
          <div className="font-bold text-slate-800 mb-1">Chưa có phân tích AI</div>
          <div className="text-xs text-slate-500 mb-3 px-2">
            AI phân tích lịch sử mua hàng + hoạt động + ghi chú để đưa ra insight
          </div>
          <Button size="sm" onClick={runAnalyze} className="bg-violet-600 hover:bg-violet-700 text-white">
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Phân tích AI ngay
          </Button>
        </div>
      </Wrapper>
    );
  }

  const starRating = aiRating != null ? Math.max(0, Math.min(5, Math.round(aiRating))) : 0;
  return (
    <Wrapper>
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-sm font-bold text-violet-900 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4" /> AI Insight
        </h5>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-violet-700 hover:bg-violet-100"
            onClick={() => setDetailOpen(true)}
            disabled={!description?.trim()}
            title={description?.trim() ? 'Xem phân tích đầy đủ' : 'Chưa có phân tích chi tiết'}
          >
            <FileSearch className="h-3.5 w-3.5 mr-1" /> Chi tiết
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            onClick={runAnalyze}
            disabled={!canReAnalyze}
            title={canReAnalyze ? 'Chạy lại phân tích AI' : 'Đã có phân tích - chỉ Quản lý trở lên mới phân tích lại được'}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Phân tích lại
          </Button>
        </div>
      </div>
      <p
        className="text-sm text-slate-700 italic leading-relaxed line-clamp-3"
        title={insightText ?? ''}
      >
        "{insightText}"
      </p>
      {aiRating != null && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-violet-700 flex items-center gap-1 relative group cursor-help">
            Tiềm năng mua hàng
            <Info className="h-3 w-3 text-violet-400" />
            {/* Tooltip CSS-only, hiện khi hover label */}
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-0 mb-2 w-64 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-medium leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 z-10"
            >
              AI chấm điểm khả năng khách tiếp tục mua hoặc upsell dựa trên lịch
              sử đơn, hoạt động và ghi chú. 5 sao = rất cao, 1 sao = thấp.
            </span>
          </span>
          <Stars filled={starRating} total={5} />
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-900">
              <Sparkles className="h-5 w-5" /> Phân tích AI chi tiết
            </DialogTitle>
            {shortDescription?.trim() && (
              <DialogDescription className="italic">"{shortDescription}"</DialogDescription>
            )}
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-2">
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {description?.trim() || '(Chưa có phân tích chi tiết)'}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </Wrapper>
  );
}

function Stars({ filled, total }: { filled: number; total: number }) {
  return (
    <span
      className="flex items-center gap-0.5"
      aria-label={`Tiềm năng mua hàng ${filled} trên ${total} sao`}
    >
      {Array.from({ length: total }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < filled ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
        />
      ))}
    </span>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border border-violet-200 p-4 shadow-sm h-full"
      style={{ background: 'linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%)' }}
    >
      {children}
    </div>
  );
}
