import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'payment-images';
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;

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

// 사본 이미지 업로드 (OCR 없이 저장만)
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: '인증에 실패했습니다.' }, { status: 401 });
    }

    const formData = await request.formData();
    const image = formData.get('image') as File;
    if (!image) {
      return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
    }
    if (!image.type || !image.type.startsWith('image/')) {
      return NextResponse.json({ error: '이미지 파일만 업로드할 수 있습니다.' }, { status: 400 });
    }
    if (image.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: '이미지 용량이 너무 큽니다. 20MB 이하로 업로드해주세요.' }, { status: 413 });
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const fileExt = image.name.split('.').pop();
    const safeExt = fileExt && fileExt.length <= 10 ? fileExt : 'bin';
    const filePath = `uploads/auto_${Date.now()}.${safeExt}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, { contentType: image.type, upsert: false });

    if (uploadError) {
      return NextResponse.json(
        { error: '이미지 업로드에 실패했습니다.', details: uploadError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ imagePath: filePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : '이미지 업로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
