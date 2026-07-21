'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Camera, Upload, Trash2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { uploadCustomerAvatar, deleteCustomerAvatar } from '@/lib/api/customer-avatar';
import { cn } from '@/lib/utils';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024;

interface Props {
  customerId: string;
  customerName: string;
  currentUrl: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AvatarUploadModal({ customerId, customerName, currentUrl, open, onOpenChange }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!ALLOWED_MIME.includes(f.type)) {
      toast.error('Chỉ chấp nhận JPG, PNG hoặc WebP');
      return;
    }
    if (f.size > MAX_SIZE) {
      toast.error('Ảnh vượt quá 5MB');
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }, []);

  const reset = () => {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const handleSave = async () => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadCustomerAvatar(customerId, file);
      toast.success('Cập nhật ảnh đại diện thành công');
      reset();
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi upload');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm(`Xoá ảnh đại diện của ${customerName}?`)) return;
    setUploading(true);
    try {
      await deleteCustomerAvatar(customerId);
      toast.success('Đã xoá ảnh đại diện');
      reset();
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi xoá ảnh');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cập nhật ảnh đại diện</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview area */}
          <div className="flex justify-center">
            <div className="relative w-32 h-32 rounded-full overflow-hidden ring-4 ring-sky-100 shadow-md">
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : currentUrl ? (
                <img src={currentUrl} alt={customerName} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-3xl font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)' }}
                >
                  {customerName.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className={cn(
              'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
              file ? 'border-sky-400 bg-sky-50/50' : 'border-slate-300 hover:border-sky-400 hover:bg-sky-50/30',
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2 text-sm text-slate-700">
                <Camera className="w-4 h-4 text-sky-500" />
                <span className="font-medium">{file.name}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); reset(); }}
                  className="text-slate-400 hover:text-red-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-6 h-6 mx-auto text-slate-400 mb-2" />
                <p className="text-sm text-slate-600 font-medium">Chọn ảnh hoặc kéo thả vào đây</p>
                <p className="text-xs text-slate-400 mt-1">JPG, PNG, WebP - tối đa 5MB</p>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 pt-2">
            {currentUrl && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Xoá ảnh
              </button>
            )}
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={() => { reset(); onOpenChange(false); }}
                disabled={uploading}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50"
              >
                Huỷ
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!file || uploading}
                className="px-4 py-2 text-sm font-medium text-white bg-sky-500 hover:bg-sky-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
