import { redirect } from 'next/navigation';

/** Redirect legacy "Kho Mới" URL -> trang kho dedicated /leads/pool. */
export default function PoolNewRedirect() {
  redirect('/leads/pool');
}
