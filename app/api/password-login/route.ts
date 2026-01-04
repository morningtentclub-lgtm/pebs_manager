import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeKoreanInput } from '@/lib/koreanKeyboard';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const sharedPassword = process.env.APP_SHARED_PASSWORD;
const appUserEmail = process.env.SUPABASE_APP_USER_EMAIL;
const appUserPassword = process.env.SUPABASE_APP_USER_PASSWORD;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const password = body?.password as string | undefined;
    const normalizedPassword = password ? normalizeKoreanInput(password) : '';

    if (!sharedPassword || !appUserEmail || !appUserPassword || !supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: '서버 설정이 완료되지 않았습니다.' },
        { status: 500 }
      );
    }

    if (!password || normalizedPassword !== sharedPassword) {
      return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email: appUserEmail,
      password: appUserPassword,
    });

    if (error || !data.session) {
      return NextResponse.json({ error: '로그인에 실패했습니다.' }, { status: 401 });
    }

    return NextResponse.json({ session: data.session });
  } catch (error) {
    return NextResponse.json(
      { error: '로그인 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
