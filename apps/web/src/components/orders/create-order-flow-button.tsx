'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LeadCreateOrderFlow } from '@/components/leads/lead-create-order-flow';
import { Plus } from 'lucide-react';

interface Props {
  customerId?: string;
  leadId?: string;
  leadName?: string;
  defaultProductId?: string;
  defaultCustomerName?: string;
  defaultCustomerPhone?: string;
  onSuccess?: () => void;
}

/**
 * Nút "Tạo đơn hàng" + flow kiểm tra đơn chưa thanh toán đủ.
 * Dùng ở trang chi tiết lead/customer thay cho CreateOrderDialog trực tiếp:
 * khách còn đơn chưa TT đủ -> hỏi thêm thanh toán cho đơn cũ hay tạo đơn mới,
 * đồng nhất hành vi với menu thao tác ở trang danh sách lead.
 */
export function CreateOrderFlowButton({
  customerId, leadId, leadName,
  defaultProductId, defaultCustomerName, defaultCustomerPhone, onSuccess,
}: Props) {
  const [flowOpen, setFlowOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setFlowOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />Tạo đơn hàng
      </Button>
      <LeadCreateOrderFlow
        customerId={customerId}
        leadId={leadId}
        leadName={leadName}
        open={flowOpen}
        onOpenChange={setFlowOpen}
        onSuccess={() => { setFlowOpen(false); onSuccess?.(); }}
        defaultProductId={defaultProductId}
        defaultCustomerName={defaultCustomerName}
        defaultCustomerPhone={defaultCustomerPhone}
      />
    </>
  );
}
