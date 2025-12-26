'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    if (pathname === '/login') {
      setChecking(false);
      return;
    }

    supabase.auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        if (!data.session) {
          router.replace('/login');
        }
        setChecking(false);
      })
      .catch((error) => {
        if (!active) return;
        console.error('세션 확인 실패:', error);
        router.replace('/login');
        setChecking(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (pathname === '/login') return;
      if (!session) {
        router.replace('/login');
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (pathname === '/login') return children;

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#1D32FB' }}></div>
      </div>
    );
  }

  return children;
}
