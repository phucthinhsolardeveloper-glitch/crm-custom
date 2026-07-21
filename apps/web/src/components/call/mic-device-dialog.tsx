'use client';

import { Headphones, MicOff, Loader2 } from 'lucide-react';

/**
 * Ly do popup thiet bi mic xuat hien:
 * - 'not-found': khong tim thay micro (chua cam tai nghe) -> NotFoundError
 * - 'blocked':   trinh duyet chan quyen mic -> NotAllowedError / permission denied
 * - 'retrying':  dang kiem tra lai sau khi bam "Thu lai" / "Kiem tra ket noi"
 */
export type MicPromptReason = 'not-found' | 'blocked' | 'retrying';

interface MicDeviceDialogProps {
  reason: MicPromptReason;
  onRetry: () => void;
  onDismiss: () => void;
}

// Nội dung hiển thị cho người dùng - PHẢI có dấu tiếng Việt đầy đủ.
const CONTENT: Record<
  MicPromptReason,
  {
    icon: React.ReactNode;
    iconWrap: string;
    title: string;
    desc: string;
    hint?: React.ReactNode;
    primary?: string;
    live?: boolean;
  }
> = {
  'not-found': {
    icon: <Headphones className="h-9 w-9 text-amber-600" />,
    iconWrap: 'bg-gradient-to-br from-amber-100 to-amber-200',
    title: 'Chưa kết nối mic',
    desc: 'Để gọi điện qua tổng đài, máy của bạn cần có tai nghe hoặc micro đang hoạt động.',
    hint: (
      <>
        <b className="text-sky-700">Cách xử lý:</b>
        <br />
        1. Cắm tai nghe có micro vào máy.
        <br />
        2. Nhấn nút <b className="text-sky-700">Kiểm tra kết nối</b> bên dưới.
      </>
    ),
    primary: 'Kiểm tra kết nối',
    live: true,
  },
  blocked: {
    icon: <MicOff className="h-9 w-9 text-red-600" />,
    iconWrap: 'bg-gradient-to-br from-red-100 to-red-200',
    title: 'Micro đang bị chặn',
    desc: 'Trình duyệt đã chặn quyền truy cập micro của trang này.',
    hint: (
      <>
        <b className="text-sky-700">Cách xử lý:</b>
        <br />
        Nhấn <b className="text-sky-700">Cấp quyền lại</b>, trình duyệt sẽ hiện hộp xin quyền - chọn{' '}
        <b className="text-sky-700">Cho phép (Allow)</b>. Nếu không thấy hộp xin quyền, hãy bấm biểu
        tượng ổ khóa trên thanh địa chỉ để bật lại micro.
      </>
    ),
    primary: 'Cấp quyền lại',
  },
  retrying: {
    icon: <Loader2 className="h-9 w-9 animate-spin text-sky-700" />,
    iconWrap: 'bg-gradient-to-br from-sky-100 to-sky-200',
    title: 'Đang kiểm tra kết nối...',
    desc: 'Đang kiểm tra micro và đăng nhập tổng đài. Vui lòng chờ một chút.',
  },
};

/**
 * Popup do ung dung tu dung (KHONG phai popup trinh duyet) khi tong dai khong
 * truy cap duoc micro. Co nut "Kiem tra ket noi" tai cho - khong bat reload trang.
 */
export function MicDeviceDialog({ reason, onRetry, onDismiss }: MicDeviceDialogProps) {
  const c = CONTENT[reason];
  const isRetrying = reason === 'retrying';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-7 text-center shadow-[0_20px_60px_rgba(14,165,233,0.28)] animate-in fade-in zoom-in-95 duration-200">
        <div className={`mx-auto mb-5 flex h-[76px] w-[76px] items-center justify-center rounded-full ${c.iconWrap}`}>
          {c.icon}
        </div>

        <h2 className="mb-2.5 bg-gradient-to-r from-sky-500 to-cyan-500 bg-clip-text text-xl font-extrabold text-transparent">
          {c.title}
        </h2>
        <p className="mb-2 text-sm leading-relaxed text-slate-600">{c.desc}</p>

        {c.hint ? (
          <div className="my-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-3 text-left text-[12.5px] leading-relaxed text-slate-500">
            {c.hint}
          </div>
        ) : (
          <div className="h-4" />
        )}

        {!isRetrying && c.primary && (
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onDismiss}
              className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-200"
            >
              Để sau
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(14,165,233,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_26px_rgba(14,165,233,0.45)]"
            >
              {c.primary}
            </button>
          </div>
        )}

        {c.live && (
          <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            Tự động nhận diện ngay khi bạn cắm tai nghe
          </div>
        )}
      </div>
    </div>
  );
}
