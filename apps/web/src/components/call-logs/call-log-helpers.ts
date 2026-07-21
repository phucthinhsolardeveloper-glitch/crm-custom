/**
 * Helper utilities shared across call-log components.
 * Tach khoi component de unit test va re-use trong row + expanded view.
 */
import { PhoneIncoming, PhoneOutgoing, PhoneMissed } from 'lucide-react';

export const CALL_TYPE_CONFIG = {
  INCOMING: { label: 'Gọi đến', icon: PhoneIncoming, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  OUTGOING: { label: 'Gọi đi', icon: PhoneOutgoing, color: 'text-sky-600', bg: 'bg-sky-50' },
  MISSED: { label: 'Nhỡ', icon: PhoneMissed, color: 'text-rose-500', bg: 'bg-rose-50' },
} as const;

/** 8-color gradient palette for hash-based avatar coloring. */
const AVATAR_GRADIENTS = [
  'from-sky-400 to-cyan-500',
  'from-emerald-400 to-teal-500',
  'from-amber-400 to-orange-500',
  'from-purple-400 to-pink-500',
  'from-rose-400 to-red-500',
  'from-indigo-400 to-blue-500',
  'from-lime-400 to-green-500',
  'from-fuchsia-400 to-purple-500',
];

/** 8-color pastel palette for hash-based tag coloring. */
const TAG_COLORS = [
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
  'bg-orange-100 text-orange-700',
  'bg-teal-100 text-teal-700',
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function hashTagColor(tag: string): string {
  return TAG_COLORS[hashString(tag) % TAG_COLORS.length];
}

/** Get gradient class for avatar based on user name/id - consistent across re-renders. */
export function avatarGradient(seed: string): string {
  return AVATAR_GRADIENTS[hashString(seed) % AVATAR_GRADIENTS.length];
}

/** Extract initials from name. "Nguyễn Văn An" -> "NA". Fallback to "?" for empty. */
export function nameInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  // Vietnamese name: take first + last word initials. "Nguyễn Văn An" -> "N" + "A"
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

import type { CallAnalysisV2 } from '@/types/entities';

/**
 * Parse analysis raw (JSON v2, v1, hoac plain text).
 * Tra ve schema thong nhat: tags + detail luon co (fallback []), cac field v2 optional.
 */
export function parseAnalysis(raw: unknown): CallAnalysisV2 | null {
  if (!raw) return null;
  if (typeof raw === 'object') {
    return normalizeV2(raw as Record<string, unknown>);
  }
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return normalizeV2(parsed);
  } catch {
    return { tags: [], detail: raw };
  }
}

function normalizeV2(obj: Record<string, unknown>): CallAnalysisV2 {
  const score = typeof obj.score === 'number' ? obj.score : null;
  return {
    tags: Array.isArray(obj.tags) ? (obj.tags as string[]) : [],
    detail: typeof obj.detail === 'string' ? obj.detail : '',
    score,
    summary: typeof obj.summary === 'string' ? obj.summary : undefined,
    meta: obj.meta && typeof obj.meta === 'object' ? (obj.meta as CallAnalysisV2['meta']) : undefined,
    customer: obj.customer && typeof obj.customer === 'object' ? (obj.customer as CallAnalysisV2['customer']) : undefined,
    sale: obj.sale && typeof obj.sale === 'object' ? (obj.sale as CallAnalysisV2['sale']) : undefined,
    actions: Array.isArray(obj.actions) ? (obj.actions as CallAnalysisV2['actions']) : undefined,
  };
}

/** Format seconds -> "Xp Ys" (e.g. "4p 32s" or "45s"). */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}p${s > 0 ? ` ${s}s` : ''}` : `${s}s`;
}

/** Map score 0-10 -> color tone + nhan ngan + class Tailwind. */
export function scoreTone(score: number | null | undefined): {
  label: string;
  textColor: string;
  ringColor: string;  // hex cho SVG stroke
  bgColor: string;
} {
  if (score === null || score === undefined) {
    return { label: 'Chưa chấm', textColor: 'text-slate-400', ringColor: '#cbd5e1', bgColor: 'bg-slate-100' };
  }
  if (score >= 9) return { label: 'Xuất sắc', textColor: 'text-emerald-600', ringColor: '#10b981', bgColor: 'bg-emerald-50' };
  if (score >= 7) return { label: 'Tốt', textColor: 'text-sky-600', ringColor: '#0ea5e9', bgColor: 'bg-sky-50' };
  if (score >= 6) return { label: 'Khá', textColor: 'text-amber-600', ringColor: '#f59e0b', bgColor: 'bg-amber-50' };
  if (score >= 4) return { label: 'Yếu', textColor: 'text-orange-600', ringColor: '#f97316', bgColor: 'bg-orange-50' };
  return { label: 'Kém', textColor: 'text-rose-600', ringColor: '#f43f5e', bgColor: 'bg-rose-50' };
}
