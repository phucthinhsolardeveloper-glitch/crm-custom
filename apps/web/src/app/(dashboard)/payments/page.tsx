import { redirect } from 'next/navigation';

/** /payments -> mặc định mở tab Đối soát. */
export default function PaymentsPage() {
  redirect('/payments/doi-soat');
}
