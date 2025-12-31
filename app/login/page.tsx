'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace('/');
      }
    });
  }, [router]);

  const handleSignIn = async () => {
    if (!password) return;
    setLoading(true);
    setError('');

    const response = await fetch('/api/password-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error || '로그인에 실패했습니다.');
      setLoading(false);
      return;
    }

    const session = data.session;
    if (!session?.access_token || !session?.refresh_token) {
      setError('로그인 세션을 생성하지 못했습니다.');
      setLoading(false);
      return;
    }

    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    router.replace('/');

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-12">
          <Image
            src="/PEBS_logo.png"
            alt="PEBS"
            width={140}
            height={46}
            className="h-12 w-auto"
            priority
          />
        </div>

        {/* Login Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-2">
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 text-[14px] border border-[--border] rounded-lg focus:outline-none focus:border-black transition-colors"
              placeholder="비밀번호 입력"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSignIn();
                }
              }}
              autoFocus
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-[13px] text-red-600">{error}</p>
            </div>
          )}

          <button
            onClick={handleSignIn}
            disabled={loading || !password}
            className="w-full px-4 py-3.5 bg-black text-white text-[14px] font-semibold rounded-lg hover:bg-[--primary-light] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-[--border]">
          <p className="text-[12px] text-center text-gray-500">
            비밀번호는 관리자에게 문의하세요
          </p>
        </div>
      </div>
    </div>
  );
}
