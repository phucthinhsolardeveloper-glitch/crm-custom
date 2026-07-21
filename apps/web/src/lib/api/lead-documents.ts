import { api } from '@/lib/api-client';

export interface LeadDocumentRecord {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  description: string | null;
  createdAt: string;
  uploader: { id: string; name: string } | null;
}

/**
 * API client cho tài liệu/hợp đồng đính kèm theo lead.
 * Upload dùng XHR riêng (không phải fetch) để track progress per file.
 */
export const leadDocumentsApi = {
  list: (leadId: string) =>
    api.get<{ data: LeadDocumentRecord[] }>(`/leads/${leadId}/documents`),

  remove: (leadId: string, docId: string) =>
    api.delete<{ data: { success: boolean } }>(`/leads/${leadId}/documents/${docId}`),
};

/**
 * Upload file với progress tracking. Trả về Promise resolve khi xong, reject khi fail.
 * Dùng XHR thay vì fetch để track upload progress qua `xhr.upload.onprogress`.
 *
 * `onProgress` nhận tỉ lệ 0-100 (phần trăm). Endpoint proxy /api/proxy/* dùng
 * cùng cookie auth - browser tự gửi cookie với credentials.
 */
export function uploadLeadDocument(
  leadId: string,
  file: File,
  onProgress?: (pct: number) => void,
  description?: string,
): Promise<LeadDocumentRecord> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    if (description) formData.append('description', description);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/proxy/leads/${leadId}/documents`);
    xhr.withCredentials = true; // cookie auth (same-origin to /api/proxy)

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body.data);
        } else {
          reject(new Error(body.message || `Upload thất bại (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Upload thất bại (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Lỗi mạng khi upload'));
    xhr.onabort = () => reject(new Error('Đã huỷ upload'));

    xhr.send(formData);
  });
}

/**
 * Trigger download file từ backend. Backend trả về stream với Content-Disposition:
 * attachment + filename gốc - browser tự download.
 */
export function downloadLeadDocument(leadId: string, docId: string) {
  // Mở trong tab mới = browser xử lý header Content-Disposition để save file.
  // Cùng-origin với /api/proxy nên cookie tự gửi kèm.
  window.location.href = `/api/proxy/leads/${leadId}/documents/${docId}/download`;
}
