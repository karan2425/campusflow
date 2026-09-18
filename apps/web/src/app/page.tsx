'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Spinner } from '@/components/ui/Primitives';

/** Entry redirect: signed-in users land on the dashboard, others on login. */
export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/dashboard' : '/login');
  }, [user, loading, router]);

  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-sm text-ink-500">
      <Spinner size={18} /> Starting CampusFlow…
    </div>
  );
}
