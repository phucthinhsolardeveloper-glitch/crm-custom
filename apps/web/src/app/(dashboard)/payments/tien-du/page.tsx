'use client';

import React from 'react';
import { useAuth } from '@/providers/auth-provider';
import { ReconSurplusList } from '@/components/payments/recon-surplus-list';

/** Tiền dư: giao dịch ngân hàng không phải bán hàng. Chỉ SUPER_ADMIN bỏ đánh dấu. */
export default function SurplusPage() {
  const { user } = useAuth();
  return <ReconSurplusList canApprove={user?.role === 'SUPER_ADMIN'} />;
}
