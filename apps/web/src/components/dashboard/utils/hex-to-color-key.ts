// Map hex màu (từ Label.color trong DB) → BarColor key của COLOR_MAP
// để table cell hiển thị bar đúng tông với badge của label.
// Fallback 'sky' nếu không match.

import type { BarColor } from '../widgets/bar-cell-table';

const HEX_TO_KEY: Record<string, BarColor> = {
  // Sky
  '#0ea5e9': 'sky', '#0284c7': 'sky', '#38bdf8': 'sky',
  // Teal
  '#14b8a6': 'teal', '#0d9488': 'teal',
  // Amber/yellow
  '#f59e0b': 'amber', '#eab308': 'amber', '#facc15': 'amber',
  // Emerald/green
  '#10b981': 'emerald', '#059669': 'emerald', '#22c55e': 'emerald',
  // Rose/red
  '#ef4444': 'rose', '#dc2626': 'rose', '#f43f5e': 'rose', '#e11d48': 'rose',
  // Violet/purple
  '#8b5cf6': 'violet', '#a855f7': 'violet', '#7c3aed': 'violet',
  // Blue
  '#3b82f6': 'blue', '#2563eb': 'blue', '#1d4ed8': 'blue',
  // Cyan
  '#06b6d4': 'cyan', '#0891b2': 'cyan',
  // Slate / gray
  '#64748b': 'slate', '#6b7280': 'slate', '#94a3b8': 'slate',
};

export function hexToColorKey(hex: string | null | undefined): BarColor {
  if (!hex) return 'sky';
  const norm = hex.toLowerCase().trim();
  return HEX_TO_KEY[norm] || 'sky';
}
