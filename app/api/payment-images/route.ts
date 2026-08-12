import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'payment-images';
const ALLOWED_FOLDERS = ['uploads', 'id_cards', 'bankbooks'];

let supabaseServer: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase 환경 변수가 설정되지 않았습니다.');
  }
  if (!supabaseServer) {
    supabaseServer = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabaseServer;
}

function isValidPath(path: unknown): path is string {
  if (typeof path !== 'string' || !path || path.includes('..')) return false;
  return ALLOWED_FOLDERS.some((folder) => path.startsWith(`${folder}/`));
}

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return supabase;
}

// 서명 URL 발급 (비공개 버킷 이미지 열람용)
export async function POST(request: NextRequest) {
  try {
    const supabase = await authenticate(request);
    if (!supabase) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (!isValidPath(body?.path)) {
      return NextResponse.json({ error: '올바르지 않은 이미지 경로입니다.' }, { status: 400 });
    }

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(body.path, 60 * 60);

    if (error || !data?.signedUrl) {
      return NextResponse.json(
        { error: '이미지 URL 생성에 실패했습니다.', details: error?.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : '이미지 처리 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// 스토리지 이미지 삭제
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await authenticate(request);
    if (!supabase) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const paths = Array.isArray(body?.paths) ? body.paths.filter(isValidPath) : [];
    if (paths.length === 0) {
      return NextResponse.json({ error: '삭제할 이미지 경로가 없습니다.' }, { status: 400 });
    }

    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) {
      return NextResponse.json(
        { error: '이미지 삭제에 실패했습니다.', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ removed: paths });
  } catch (error) {
    const message = error instanceof Error ? error.message : '이미지 처리 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
