import { redirect } from 'next/navigation';

/** Redirect legacy "Kho thả nổi" page → unified /leads with preset filter. */
export default function FloatingRedirect() {
  redirect('/leads?status=FLOATING');
}
