'use client';

import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type SignOutButtonProps = {
  className?: string;
};

export default function SignOutButton({ className }: SignOutButtonProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  return (
    <button
      onClick={handleSignOut}
      className={className}
      type="button"
    >
      로그아웃
    </button>
  );
}
