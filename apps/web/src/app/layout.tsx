import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Inter, Roboto, Be_Vietnam_Pro, Nunito, Lora } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';
import { GlobalFontEffect } from '@/components/layout/global-font-effect';
import { GLOBAL_FONT_STORAGE_KEY } from '@/lib/global-font-storage-key';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-jakarta',
});

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

const roboto = Roboto({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '700'],
  display: 'swap',
  variable: '--font-roboto',
});

const beVietnam = Be_Vietnam_Pro({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-be-vietnam',
});

const nunito = Nunito({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-nunito',
});

const lora = Lora({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-lora',
});

export const metadata: Metadata = {
  title: 'CRM-Custom',
  description: 'Hệ thống quản lý khách hàng nội bộ - Tốc độ & Hiệu suất',
  // PWA: cho phép "cài" web như app + nhận Web Push trên iOS (cần thêm vào màn hình chính)
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    title: 'CRM-Custom',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#0ea5e9',
};

/**
 * FOUC prevention: chạy SỚM trước khi React hydrate.
 * Đọc localStorage `crm_global_font_v1` và set inline `--font-sans` + `--font-weight-base` lên <html>.
 * Lưu ý: map rút gọn ở đây ưu tiên kích thước script nhỏ; hook `useGlobalFontPref` sẽ
 * re-apply sau hydration với fallback chain đầy đủ từ FONT_FAMILY_CSS.
 */
const fontFoucScript = `
(function () {
  try {
    var key = '${GLOBAL_FONT_STORAGE_KEY}';
    var saved = localStorage.getItem(key);
    if (!saved) return;
    var data = JSON.parse(saved);
    var map = {
      'plus-jakarta-sans': "var(--font-jakarta), 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
      'inter': "var(--font-inter), 'Inter', ui-sans-serif, system-ui, sans-serif",
      'roboto': "var(--font-roboto), 'Roboto', ui-sans-serif, system-ui, sans-serif",
      'arial': "Arial, Helvetica, ui-sans-serif, sans-serif",
      'times-new-roman': "'Times New Roman', Times, ui-serif, serif",
      'be-vietnam-pro': "var(--font-be-vietnam), 'Be Vietnam Pro', ui-sans-serif, system-ui, sans-serif",
      'nunito': "var(--font-nunito), 'Nunito', ui-sans-serif, system-ui, sans-serif",
      'lora': "var(--font-lora), 'Lora', Georgia, ui-serif, serif"
    };
    if (data && map[data.font]) {
      document.documentElement.style.setProperty('--font-sans', map[data.font]);
    }
    if (data && (data.weight === 400 || data.weight === 500 || data.weight === 600 || data.weight === 700)) {
      document.documentElement.style.setProperty('--font-weight-base', String(data.weight));
    }
  } catch (_) { /* silent */ }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const fontVarClass = [
    plusJakarta.variable,
    inter.variable,
    roboto.variable,
    beVietnam.variable,
    nunito.variable,
    lora.variable,
  ].join(' ');
  return (
    <html lang="vi" className={fontVarClass}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: fontFoucScript }} />
      </head>
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        <GlobalFontEffect />
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
