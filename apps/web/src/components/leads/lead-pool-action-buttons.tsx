'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';

interface PoolActionButtonsProps {
  leadId: string;
  leadName: string;
  /** 'claim' = user claim về kho cá nhân, 'assign' = manager phân cho nhân viên */
  mode: 'claim' | 'assign' | 'both';
  users?: { id: string; name: string }[];
}

/** Inline action buttons for lead pool tables - Claim and/or Assign. */
export function LeadPoolActionButtons({ leadId, leadName, mode, users = [] }: PoolActionButtonsProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const isManager = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';
  const showClaim = mode === 'claim' || mode === 'both';
  const showAssign = (mode === 'assign' || mode === 'both') && isManager;

  async function handleClaim() {
    setClaiming(true);
    try {
      await api.post(`/leads/${leadId}/claim`);
      toast.success(`Đã nhận lead "${leadName}"`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi khi nhận lead');
    } finally {
      setClaiming(false);
    }
  }

  async function handleAssign() {
    if (!selectedUserId) return;
    setAssigning(true);
    try {
      await api.post(`/leads/${leadId}/assign`, { userId: selectedUserId });
      toast.success(`Đã phân lead "${leadName}"`);
      setAssignOpen(false);
      setSelectedUserId('');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lỗi khi phân lead');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="flex gap-1">
      {showClaim && (
        <Button size="sm" variant="outline" onClick={handleClaim} disabled={claiming} className="h-7 px-2 text-xs">
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          {claiming ? '...' : 'Nhận'}
        </Button>
      )}

      {showAssign && (
        <>
          <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)} className="h-7 px-2 text-xs">
            <Users className="h-3.5 w-3.5 mr-1" />Phân
          </Button>

          <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Phân lead: {leadName}</DialogTitle>
              </DialogHeader>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger><SelectValue placeholder="Chọn nhân viên" /></SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignOpen(false)}>Hủy</Button>
                <Button onClick={handleAssign} disabled={!selectedUserId || assigning}>
                  {assigning ? 'Đang phân...' : 'Phân lead'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
