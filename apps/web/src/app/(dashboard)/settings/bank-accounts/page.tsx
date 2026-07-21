import { serverFetch, getCurrentUser } from '@/lib/auth';
import { BankAccountSettings } from '@/components/settings/bank-account-settings';
import type { SettingsItem } from '@/types/entities';

/** Settings - Tài khoản ngân hàng nhận thanh toán. */
export default async function BankAccountsSettingsPage() {
  const user = await getCurrentUser();
  const canEdit = user?.role === 'SUPER_ADMIN';

  // /all trả về cả TK DEACTIVE để quản lý (chỉ SUPER_ADMIN); user thường fallback list rỗng.
  let bankAccounts: SettingsItem[] = [];
  try {
    const endpoint = canEdit ? '/bank-accounts/all' : '/bank-accounts';
    bankAccounts = await serverFetch<{ data: SettingsItem[] }>(endpoint).then(r => r.data).catch(() => []);
  } catch { /* empty ok */ }

  return <BankAccountSettings data={bankAccounts} canEdit={canEdit} />;
}
