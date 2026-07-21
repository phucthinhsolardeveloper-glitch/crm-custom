'use client';

import { useState, useEffect } from 'react';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/utils';
import { Settings, ChevronUp, ChevronDown, RotateCcw } from 'lucide-react';

interface Lead {
  id: string; name: string; phone: string; status: string;
  source?: { name: string } | null;
  assignedUser?: { name: string } | null;
  customerId?: string | null;
  activityCount?: number;
  label?: { id: string; name: string; color: string; textColor: string } | null;
  createdAt: string;
}

interface LabelInfo { id: string; name: string; color: string }

interface Props {
  leads: Lead[];
  allLabels?: LabelInfo[];
  onLeadClick?: (id: string) => void;
}

const MAX_SELECTABLE_LABELS = 4; // 4 nhãn + 1 cột "Khác" = 5 cột tối đa
const INITIAL_CARDS_PER_COLUMN = 20;
const STORAGE_KEY = 'crm_kanban_label_config';

interface KanbanConfig { selectedIds: string[] }

function loadConfig(): KanbanConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveConfig(config: KanbanConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* */ }
}

/** Kanban board grouped by lead labels with customizable columns. */
export function LeadKanbanViewByLabel({ leads, allLabels, onLeadClick }: Props) {
  const [configOpen, setConfigOpen] = useState(false);
  const [config, setConfig] = useState<KanbanConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  // Load config from localStorage on mount
  useEffect(() => {
    setConfig(loadConfig());
    setConfigLoaded(true);
  }, []);

  // Build label list with lead counts (single-label model: each lead counts once)
  const labelCounts = new Map<string, number>();
  for (const lead of leads) {
    if (!lead.label) continue;
    labelCounts.set(lead.label.id, (labelCounts.get(lead.label.id) || 0) + 1);
  }

  // All available labels - merge from allLabels prop + label seen on leads
  const labelMap = new Map<string, LabelInfo>();
  if (allLabels) {
    for (const l of allLabels) labelMap.set(l.id, l);
  }
  for (const lead of leads) {
    if (lead.label && !labelMap.has(lead.label.id)) labelMap.set(lead.label.id, lead.label);
  }
  const availableLabels = [...labelMap.values()];

  // Determine which labels to show as columns (in order)
  let selectedLabels: LabelInfo[];
  if (config?.selectedIds && config.selectedIds.length > 0) {
    // User-configured: preserve order, filter out deleted labels
    selectedLabels = config.selectedIds
      .map(id => labelMap.get(id))
      .filter((l): l is LabelInfo => !!l);
  } else {
    // Auto mode: top 4 by lead count (+ "Khác" = 5 cột)
    selectedLabels = availableLabels
      .filter(l => labelCounts.has(l.id))
      .sort((a, b) => (labelCounts.get(b.id) || 0) - (labelCounts.get(a.id) || 0))
      .slice(0, MAX_SELECTABLE_LABELS);
  }

  const selectedIds = new Set(selectedLabels.map(l => l.id));

  // Group leads into columns
  const columns: { id: string; name: string; color: string; leads: Lead[] }[] =
    selectedLabels.map(l => ({ id: l.id, name: l.name, color: l.color, leads: [] }));
  const otherColumn: Lead[] = [];

  for (const lead of leads) {
    if (!lead.label) { otherColumn.push(lead); continue; }
    if (selectedIds.has(lead.label.id)) {
      const col = columns.find(c => c.id === lead.label!.id);
      if (col) { col.leads.push(lead); continue; }
    }
    otherColumn.push(lead);
  }

  // 4 nhãn + "Khác" = max 5 cột
  const allColumns = [
    ...columns,
    ...(otherColumn.length > 0 ? [{ id: '_other', name: 'Khác', color: '#9ca3af', leads: otherColumn }] : []),
  ];

  // Config handlers
  function toggleLabel(labelId: string) {
    const current = config?.selectedIds || selectedLabels.map(l => l.id);
    let next: string[];
    if (current.includes(labelId)) {
      next = current.filter(id => id !== labelId);
    } else {
      if (current.length >= MAX_SELECTABLE_LABELS) return;
      next = [...current, labelId];
    }
    const newConfig = { selectedIds: next };
    setConfig(newConfig);
    saveConfig(newConfig);
  }

  function moveLabel(labelId: string, direction: -1 | 1) {
    const current = config?.selectedIds || selectedLabels.map(l => l.id);
    const idx = current.indexOf(labelId);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= current.length) return;
    const next = [...current];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    const newConfig = { selectedIds: next };
    setConfig(newConfig);
    saveConfig(newConfig);
  }

  function resetConfig() {
    setConfig(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  const currentSelectedIds = config?.selectedIds || selectedLabels.map(l => l.id);

  if (!configLoaded) return null;

  return (
    <div className="space-y-3">
      {/* Config toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{allColumns.length} cột · {leads.length} leads</span>
        <button
          onClick={() => setConfigOpen(!configOpen)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            configOpen ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <Settings className="h-3.5 w-3.5" />Tuỳ chỉnh cột
        </button>
      </div>

      {/* Config panel */}
      {configOpen && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-700">Chọn nhãn hiển thị (tối đa {MAX_SELECTABLE_LABELS}, +1 cột Khác)</h4>
            <button onClick={resetConfig} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
              <RotateCcw className="h-3 w-3" />Mặc định
            </button>
          </div>

          {/* Selected labels with reorder */}
          {currentSelectedIds.length > 0 && (
            <div className="space-y-1 mb-3">
              <p className="text-[10px] font-medium text-slate-400 uppercase">Đang hiển thị</p>
              {currentSelectedIds.map((id, idx) => {
                const label = labelMap.get(id);
                if (!label) return null;
                return (
                  <div key={id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                    <span className="text-sm text-slate-700 flex-1">{label.name}</span>
                    <span className="text-[10px] text-slate-400">{labelCounts.get(id) || 0}</span>
                    <button onClick={() => moveLabel(id, -1)} disabled={idx === 0}
                      className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => moveLabel(id, 1)} disabled={idx === currentSelectedIds.length - 1}
                      className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => toggleLabel(id)} className="p-0.5 text-red-400 hover:text-red-600 text-xs font-bold">×</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Available labels to add */}
          {availableLabels.filter(l => !currentSelectedIds.includes(l.id)).length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-slate-400 uppercase">Có thể thêm</p>
              <div className="flex flex-wrap gap-1.5">
                {availableLabels.filter(l => !currentSelectedIds.includes(l.id)).map(label => (
                  <button key={label.id} onClick={() => toggleLabel(label.id)}
                    disabled={currentSelectedIds.length >= MAX_SELECTABLE_LABELS}
                    className="flex items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: label.color }} />
                    {label.name}
                    <span className="text-slate-400">({labelCounts.get(label.id) || 0})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Kanban board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {allColumns.map(col => (
          <KanbanColumn key={col.id} col={col} onLeadClick={onLeadClick} />
        ))}
      </div>
    </div>
  );
}

/** Single kanban column with "Xem thêm" pagination */
function KanbanColumn({ col, onLeadClick }: { col: { id: string; name: string; color: string; leads: Lead[] }; onLeadClick?: (id: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const visibleLeads = showAll ? col.leads : col.leads.slice(0, INITIAL_CARDS_PER_COLUMN);
  const remaining = col.leads.length - INITIAL_CARDS_PER_COLUMN;

  return (
    <div className="flex w-72 flex-shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-50/50">
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.color }} />
        <span className="text-sm font-semibold text-slate-700">{col.name}</span>
        <span className="ml-auto rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">{col.leads.length}</span>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: '70vh' }}>
        {col.leads.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">Trống</p>
        ) : visibleLeads.map(lead => (
          <div key={lead.id} onClick={() => onLeadClick?.(lead.id)}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-all hover:border-sky-200 hover:shadow">
            <div className="flex items-start justify-between">
              <span className="text-sm font-medium text-slate-900">{lead.name}</span>
              <StatusBadge status={lead.status} />
            </div>
            <p className="mt-1 text-xs text-slate-500">{lead.phone}
              {lead.customerId && <span className="ml-1 rounded-full bg-blue-100 px-1 text-[9px] text-blue-700">KH</span>}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">

              <span>{formatDate(lead.createdAt)}</span>
            </div>
            {lead.label && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                <span className="rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ backgroundColor: lead.label.color, color: lead.label.textColor || '#ffffff' }}>{lead.label.name}</span>
              </div>
            )}
          </div>
        ))}

        {remaining > 0 && (
          <button onClick={() => setShowAll(!showAll)}
            className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            {showAll ? 'Thu gọn' : `Xem thêm ${remaining} leads`}
          </button>
        )}
      </div>
    </div>
  );
}
