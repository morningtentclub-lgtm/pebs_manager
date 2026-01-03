import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { password } = (await request.json()) as { password?: string };
    if (!password) {
      return NextResponse.json({ error: '비밀번호를 입력해주세요.' }, { status: 400 });
    }

    const accessPassword = process.env.APP_PAYMENTS_PASSWORD;
    if (!accessPassword) {
      return NextResponse.json({ error: 'APP_PAYMENTS_PASSWORD가 설정되어 있지 않습니다.' }, { status: 500 });
    }

    if (password !== accessPassword) {
      return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
