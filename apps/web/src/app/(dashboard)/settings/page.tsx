import { redirect } from 'next/navigation';

/** /settings gốc - chuyển hướng sang mục đầu tiên. */
export default function SettingsPage() {
  redirect('/settings/departments');
}
