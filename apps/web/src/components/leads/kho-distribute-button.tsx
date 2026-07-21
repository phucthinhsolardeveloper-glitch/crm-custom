'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LeadPoolDistributeDialog } from '@/components/leads/lead-pool-distribute-dialog';

interface KhoDistributeButtonProps {
  /** 'new' = Kho Mới (POST /distribution/distribute/:deptId), 'zoom' = Kho Zoom (distribute-zoom). */
  poolMode: 'new' | 'zoom';
  /** Tổng lead trong kho hiện tại (hiển thị trong dialog). */
  leadCount: number;
  departments: { id: string; name: string }[];
  /** Refresh danh sách + label counts sau khi chia xong. */
  onDistributed: () => void;
}

/**
 * Nút "AI Chia số" trên toolbar trang kho (/leads/pool, /leads/zoom).
 * Distribute là thao tác scope-kho (BE tự lấy tối đa 100 lead POOL/ZOOM),
 * KHÔNG theo selection - nên đặt ở toolbar thay vì bulk bar.
 */
export function KhoDistributeButton({ poolMode, leadCount, departments, onDistributed }: KhoDistributeButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        className="bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md hover:from-sky-600 hover:to-cyan-600"
      >
        <Sparkles className="h-4 w-4 mr-1" />
        AI Chia số
      </Button>
      <LeadPoolDistributeDialog
        open={open}
        onOpenChange={setOpen}
        poolMode={poolMode}
        leadCount={leadCount}
        departments={departments}
        onDistributed={onDistributed}
      />
    </>
  );
}
