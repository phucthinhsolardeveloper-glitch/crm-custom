import { redirect } from 'next/navigation';

/** Redirect legacy "Kho Zoom" URL -> trang kho dedicated /leads/zoom. */
export default function PoolZoomRedirect() {
  redirect('/leads/zoom');
}
