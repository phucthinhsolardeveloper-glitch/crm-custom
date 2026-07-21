'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/providers/auth-provider';

interface Props {
  customerId: string;
  shortDescription?: string | null;
  description?: string | null;
  aiRating?: number | null;
}

/** Renders 1-5 star rating using filled/empty unicode stars. */
function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < rating ? '#d4a73a' : '#d1cbc3', fontSize: '1rem', lineHeight: 1 }}>
          {i < rating ? '★' : '☆'}
        </span>
      ))}
      <span className="ml-1 text-xs text-slate-500">{rating}/5</span>
    </span>
  );
}

/** Card showing customer AI analysis: short desc + expandable full desc + analyze button. */
export function CustomerAnalysisCard({ customerId, shortDescription, description, aiRating }: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const hasAnalysis = shortDescription || description;
  // Đã có phân tích thì chỉ MANAGER+ được phân tích lại (backend cũng enforce)
  const canReAnalyze = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      await api.post(`/customers/${customerId}/analyze`, {});
      toast.success('Phân tích hoàn tất');
      router.refresh();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi phân tích');
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-900">Phân tích khách hàng</h3>
          {aiRating != null && <StarRating rating={aiRating} />}
        </div>
        {hasAnalysis && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-slate-400 hover:text-sky-600"
            onClick={handleAnalyze}
            disabled={analyzing || !canReAnalyze}
            title={canReAnalyze ? 'Chạy lại phân tích AI' : 'Đã có phân tích - chỉ Quản lý trở lên mới phân tích lại được'}
          >
            {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>

      {hasAnalysis ? (
        <>
          {shortDescription && (
            <p className="text-sm text-slate-700">{shortDescription}</p>
          )}

          {description && (
            <>
              {expanded && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <h4 className="text-sm font-bold text-slate-800 mb-2">Phân tích chi tiết chân dung khách hàng</h4>
                  <div className="prose prose-sm prose-gray max-w-none text-sm text-slate-600 [&_strong]:text-slate-800 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:my-1 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-semibold [&_h3]:font-medium">
                    <ReactMarkdown>{description}</ReactMarkdown>
                  </div>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 px-2 text-xs text-sky-600 hover:text-sky-700"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <><ChevronUp className="h-3.5 w-3.5 mr-1" />Thu gọn</>
                ) : (
                  <><ChevronDown className="h-3.5 w-3.5 mr-1" />Xem phân tích chi tiết</>
                )}
              </Button>
            </>
          )}

          {!description && shortDescription && (
            <p className="mt-2 text-xs text-slate-400 italic">Chưa có phân tích chi tiết</p>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center py-4 text-center">
          <Sparkles className="h-8 w-8 text-slate-300 mb-2" />
          <p className="text-sm text-slate-400 mb-3">Chưa có phân tích cụ thể</p>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Đang phân tích...</>
            ) : (
              'Phân tích ngay'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
