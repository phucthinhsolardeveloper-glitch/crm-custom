'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';

interface UseFormActionOptions {
  successMessage?: string;
  onSuccess?: (data: unknown) => void;
}

/** Hook for form submit actions: calls API, shows toast, refreshes page. */
export function useFormAction(options: UseFormActionOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function execute<T>(
    method: 'post' | 'patch' | 'put' | 'delete',
    endpoint: string,
    body?: unknown,
  ): Promise<T | null> {
    setIsLoading(true);
    setError(null);
    try {
      const result = method === 'delete'
        ? await api.delete<T>(endpoint)
        : await api[method]<T>(endpoint, body);
      toast.success(options.successMessage || 'Thành công');
      options.onSuccess?.(result);
      router.refresh();
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Có lỗi xảy ra';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }

  return { execute, isLoading, error, setError };
}
