import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeKoreanInput } from '@/lib/koreanKeyboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabaseServer: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase 환경 변수가 설정되지 않았습니다.');
  }

  if (!supabaseServer) {
    const key = supabaseServiceRoleKey || supabaseAnonKey;
    supabaseServer = createClient(supabaseUrl, key, {
      auth: { persistSession: false },
    });
  }

  return supabaseServer;
}

export async function POST(request: Request) {
  try {
    const { password } = (await request.json()) as { password?: string };
    if (!password) {
      return NextResponse.json({ error: '비밀번호를 입력해주세요.' }, { status: 400 });
    }
    const normalizedPassword = normalizeKoreanInput(password);

    if (!supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY가 설정되어 있지 않습니다.' },
        { status: 500 }
      );
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'payments_access_password')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: '지급 내역 비밀번호를 불러오지 못했습니다.' }, { status: 500 });
    }

    const accessPassword = data?.value;
    if (!accessPassword) {
      return NextResponse.json({ error: '지급 내역 비밀번호가 설정되어 있지 않습니다.' }, { status: 500 });
    }

    if (normalizedPassword !== accessPassword) {
      return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
