'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface SearchLead {
  id: string;
  name: string;
  phone?: string;
}

interface SearchCustomer {
  id: string;
  name: string;
  phone?: string;
}

interface SearchOrder {
  id: string;
  code?: string;
  customerName?: string;
}

interface SearchResults {
  leads: SearchLead[];
  customers: SearchCustomer[];
  orders: SearchOrder[];
}

interface SearchResponse {
  data: SearchResults;
}

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults(null);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get<SearchResponse>(`/search?q=${encodeURIComponent(query.trim())}`);
        setResults(res.data);
        setOpen(true);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const hasResults =
    results &&
    (results.leads.length > 0 || results.customers.length > 0 || results.orders.length > 0);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      {/* Input */}
      <div className="relative flex items-center">
        <Search
          size={16}
          className={cn('absolute left-3 text-slate-400', loading && 'animate-pulse')}
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results && setOpen(true)}
          placeholder="Tìm kiếm leads, khách hàng, đơn hàng..."
          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[320px] rounded-xl border border-slate-200 bg-white shadow-[0_10px_25px_-5px_rgba(14,165,233,0.1)]">
          <div className="max-h-96 overflow-y-auto py-2">
            {!hasResults ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400">
                Không tìm thấy kết quả
              </div>
            ) : (
              <>
                {/* Leads */}
                {results.leads.length > 0 && (
                  <section>
                    <div className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Leads
                    </div>
                    {results.leads.map((lead) => (
                      <Link
                        key={lead.id}
                        href={`/leads/${lead.id}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-50"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-600">
                          L
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-700">{lead.name}</div>
                          {lead.phone && (
                            <div className="truncate text-xs text-slate-400">{lead.phone}</div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </section>
                )}

                {/* Khách hàng */}
                {results.customers.length > 0 && (
                  <section>
                    <div className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Khách hàng
                    </div>
                    {results.customers.map((customer) => (
                      <Link
                        key={customer.id}
                        href={`/customers/${customer.id}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-50"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-600">
                          K
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-700">{customer.name}</div>
                          {customer.phone && (
                            <div className="truncate text-xs text-slate-400">{customer.phone}</div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </section>
                )}

                {/* Đơn hàng */}
                {results.orders.length > 0 && (
                  <section>
                    <div className="px-4 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Đơn hàng
                    </div>
                    {results.orders.map((order) => (
                      <Link
                        key={order.id}
                        href={`/orders/${order.id}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-50"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-semibold text-cyan-600">
                          Đ
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-700">
                            {order.code ?? `#${order.id}`}
                          </div>
                          {order.customerName && (
                            <div className="truncate text-xs text-slate-400">
                              {order.customerName}
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
