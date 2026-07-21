'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';
import { toast } from 'sonner';
import { Search, Loader2, Check } from 'lucide-react';

interface Props {
  initialSettings: Record<string, string>;
}

interface OpenRouterModel {
  id: string;
  name: string;
  pricing?: { prompt: string; completion: string };
}

/** Settings tab for AI config: API key, model, prompts (SUPER_ADMIN only). */
export function AiPromptSettings({ initialSettings }: Props) {
  // Backend masks ai_api_key as "••••xxxx". Don't prefill input with masked value
  // (would overwrite real key on save). Show mask as placeholder hint instead.
  const initialApiKey = initialSettings.ai_api_key || '';
  const apiKeyIsMasked = initialApiKey.startsWith('••••');
  const [apiKey, setApiKey] = useState(apiKeyIsMasked ? '' : initialApiKey);
  const [model, setModel] = useState(initialSettings.ai_model || 'google/gemini-2.0-flash-exp:free');
  const [callPrompt, setCallPrompt] = useState(initialSettings.ai_call_analysis_prompt || '');
  const [customerPrompt, setCustomerPrompt] = useState(initialSettings.ai_customer_analysis_prompt || '');
  const [saving, setSaving] = useState<string | null>(null);

  // Model search state
  const [modelSearch, setModelSearch] = useState('');
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [showModels, setShowModels] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch models from OpenRouter
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!modelSearch && !showModels) return;
      setLoadingModels(true);
      try {
        const res = await fetch('https://openrouter.ai/api/v1/models');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        let filtered: OpenRouterModel[] = data.data || [];
        if (modelSearch) {
          const q = modelSearch.toLowerCase();
          filtered = filtered.filter((m: OpenRouterModel) =>
            m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)
          );
        }
        // Sort: free models first, then by name
        filtered.sort((a, b) => {
          const aFree = a.pricing?.prompt === '0' ? 0 : 1;
          const bFree = b.pricing?.prompt === '0' ? 0 : 1;
          if (aFree !== bFree) return aFree - bFree;
          return a.name.localeCompare(b.name);
        });
        if (!cancelled) setModels(filtered.slice(0, 30));
      } catch {
        if (!cancelled) setModels([]);
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [modelSearch, showModels]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowModels(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function save(key: string, value: string, label: string) {
    setSaving(key);
    try {
      await api.put(`/system-settings/${key}`, { value });
      toast.success(`Đã lưu ${label}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi lưu');
    } finally {
      setSaving(null);
    }
  }

  function selectModel(m: OpenRouterModel) {
    setModel(m.id);
    setShowModels(false);
    setModelSearch('');
    save('ai_model', m.id, 'model');
  }

  return (
    <div className="space-y-6 mt-4">
      {/* API Key */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h3 className="font-semibold text-slate-900">API Key (OpenRouter)</h3>
        <p className="text-xs text-slate-500">
          Lấy API key tại openrouter.ai/keys. Key được lưu trong database, không lưu trong env.
        </p>
        <div className="flex gap-2">
          <Input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={apiKeyIsMasked ? 'Key đã được thiết lập - để trống nếu không đổi' : 'sk-or-v1-...'}
            className="flex-1"
          />
          <Button
            size="sm"
            disabled={saving === 'ai_api_key' || !apiKey.trim()}
            onClick={() => save('ai_api_key', apiKey, 'API key')}
          >
            {saving === 'ai_api_key' ? 'Đang lưu...' : 'Lưu'}
          </Button>
        </div>
      </div>

      {/* Model selector */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h3 className="font-semibold text-slate-900">Model AI</h3>
        <p className="text-xs text-slate-500">
          Model hiện tại: <span className="font-mono text-sky-600">{model}</span>
        </p>
        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={modelSearch}
              onChange={e => { setModelSearch(e.target.value); setShowModels(true); }}
              onFocus={() => setShowModels(true)}
              placeholder="Tìm model... (VD: gemini, claude, llama)"
              className="pl-9"
            />
          </div>
          {showModels && (
            <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {loadingModels ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  <span className="ml-2 text-xs text-slate-400">Đang tải...</span>
                </div>
              ) : models.length > 0 ? (
                models.map(m => {
                  const isFree = m.pricing?.prompt === '0';
                  const isSelected = m.id === model;
                  return (
                    <button
                      key={m.id}
                      onClick={() => selectModel(m)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 ${isSelected ? 'bg-sky-50' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-700 truncate">{m.name}</span>
                          {isFree && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">Free</span>}
                          {isSelected && <Check className="h-3.5 w-3.5 text-sky-600 shrink-0" />}
                        </div>
                        <span className="text-xs text-slate-400 font-mono truncate block">{m.id}</span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-3 text-xs text-slate-400 text-center">Không tìm thấy model</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Call analysis prompt */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h3 className="font-semibold text-slate-900">Prompt phân tích cuộc gọi</h3>
        <p className="text-xs text-slate-500">
          Gửi đến AI khi cuộc gọi dài hơn 1 phút. Nội dung cuộc gọi đính kèm tự động.
        </p>
        <Textarea
          value={callPrompt}
          onChange={e => setCallPrompt(e.target.value)}
          rows={4}
          placeholder="VD: Hãy tóm tắt nội dung cuộc gọi, nhu cầu khách hàng, và hành động tiếp theo..."
        />
        <Button
          size="sm"
          disabled={saving === 'ai_call_analysis_prompt'}
          onClick={() => save('ai_call_analysis_prompt', callPrompt, 'prompt cuộc gọi')}
        >
          {saving === 'ai_call_analysis_prompt' ? 'Đang lưu...' : 'Lưu'}
        </Button>
      </div>

      {/* Customer analysis prompt */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h3 className="font-semibold text-slate-900">Prompt phân tích khách hàng</h3>
        <p className="text-xs text-slate-500">
          Gửi khi phân tích khách hàng (cuộc gọi &gt; 2 phút hoặc bấm nút phân tích).
          Dữ liệu ghi chú, thanh toán, phân tích cuộc gọi đính kèm tự động.
          Kết quả trả về gồm &quot;short&quot; (tóm tắt) + &quot;detail&quot; (chi tiết) - độ dài tùy bạn mô tả trong prompt.
        </p>
        <Textarea
          value={customerPrompt}
          onChange={e => setCustomerPrompt(e.target.value)}
          rows={4}
          placeholder="VD: Đánh giá mức độ tiềm năng, hành vi mua, rủi ro mất KH, đề xuất hành động..."
        />
        <Button
          size="sm"
          disabled={saving === 'ai_customer_analysis_prompt'}
          onClick={() => save('ai_customer_analysis_prompt', customerPrompt, 'prompt khách hàng')}
        >
          {saving === 'ai_customer_analysis_prompt' ? 'Đang lưu...' : 'Lưu'}
        </Button>
      </div>

    </div>
  );
}
