import { LoginForm } from './login-form';

// Force dynamic - bypass stale Next.js prerender cache after security fix deploys
// (The cache held HTML referencing chunks that no longer exist after rebuild)
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return <LoginForm />;
}
