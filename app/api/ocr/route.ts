import { NextRequest, NextResponse } from 'next/server';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIME_PREFIX = 'image/';
const ALLOWED_OCR_TYPES = new Set(['id_card', 'bankbook', 'auto']);
let supabaseServer: ReturnType<typeof createClient> | null = null;

let visionClient: ImageAnnotatorClient | null = null;
let visionKeyPath: string | null = null;

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

function getVisionClient() {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (credentialsJson) {
    let parsed: { project_id?: string; client_email?: string; private_key?: string } | null = null;
    try {
      parsed = JSON.parse(credentialsJson);
    } catch (error) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON 형식이 올바르지 않습니다.');
    }

    if (!parsed?.client_email || !parsed?.private_key) {
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON에 필수 키가 없습니다.');
    }

    if (!visionClient || visionKeyPath !== 'env') {
      visionClient = new ImageAnnotatorClient({
        credentials: {
          client_email: parsed.client_email,
          private_key: parsed.private_key,
        },
        projectId: parsed.project_id,
      });
      visionKeyPath = 'env';
    }

    return visionClient;
  }

  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFile) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS 환경 변수가 설정되지 않았습니다.');
  }

  const resolvedKeyFile = path.isAbsolute(keyFile)
    ? keyFile
    : path.join(process.cwd(), keyFile);

  if (!fs.existsSync(resolvedKeyFile)) {
    throw new Error(`Google Cloud 키 파일을 찾을 수 없습니다: ${resolvedKeyFile}`);
  }

  if (!visionClient || visionKeyPath !== resolvedKeyFile) {
    visionClient = new ImageAnnotatorClient({ keyFilename: resolvedKeyFile });
    visionKeyPath = resolvedKeyFile;
  }

  return visionClient;
}

// 은행명 매핑 (다양한 표기 → 표준 이름)
const BANK_NAMES: { [key: string]: string } = {
  '국민': '국민은행',
  'KB': '국민은행',
  '신한': '신한은행',
  '우리': '우리은행',
  '하나': '하나은행',
  'NH': '농협은행',
  '농협': '농협은행',
  '기업': '기업은행',
  'IBK': '기업은행',
  '카카오뱅크': '카카오뱅크',
  '토스뱅크': '토스뱅크',
  '케이뱅크': '케이뱅크',
  'SC': 'SC제일은행',
  '제일': 'SC제일은행',
  '씨티': '씨티은행',
  'KDB': '산업은행',
  '산업': '산업은행',
  '수협': '수협은행',
  '새마을': '새마을금고',
  '우체국': '우체국',
  '신협': '신협',
  '저축은행': '저축은행',
};

// 주민등록번호 패턴 추출 (YYMMDD-NNNNNNN)
function extractResidentNumber(text: string): string | null {
  // 주민등록번호 패턴: 6자리-7자리 또는 6자리 7자리 (공백 포함)
  const patterns = [
    /(\d{6})\s*-\s*(\d{7})/g,
    /(\d{6})\s+(\d{7})/g,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const cleaned = match[0].replace(/\s/g, '');
      return cleaned.replace(/(\d{6})(\d{7})/, '$1-$2');
    }
  }

  return null;
}

// 계좌번호 패턴 추출
function extractAccountNumber(text: string): string | null {
  // 계좌번호는 보통 10-14자리 숫자 (하이픈 포함 가능)
  const patterns = [
    /\d{3,4}-\d{2,6}-\d{4,8}/g,  // 123-456-78901234
    /\d{10,14}/g,                 // 12345678901234
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      // 가장 긴 매칭 반환 (계좌번호일 가능성이 높음)
      return matches.sort((a, b) => b.length - a.length)[0];
    }
  }

  return null;
}

// 은행명 추출
function extractBankName(text: string): string | null {
  const upperText = text.toUpperCase();

  for (const [keyword, bankName] of Object.entries(BANK_NAMES)) {
    if (upperText.includes(keyword.toUpperCase())) {
      return bankName;
    }
  }

  return null;
}

// 사업자등록번호 패턴 추출 (000-00-00000)
function extractBusinessRegistrationNumber(text: string): string | null {
  const businessHint = /사업자\s*등록\s*증|사업자등록증|사업자\s*등록\s*번호|사업자등록번호/;
  if (!businessHint.test(text)) return null;

  const labelIndex = text.search(/등록\s*번호|등록번호/);
  if (labelIndex >= 0) {
    const snippet = text.slice(labelIndex, labelIndex + 120);
    const numberMatch = snippet.match(/(\d{3})\s*-\s*(\d{2})\s*-\s*(\d{5})/);
    if (numberMatch) {
      return `${numberMatch[1]}-${numberMatch[2]}-${numberMatch[3]}`;
    }

    const compactMatch = snippet.match(/(\d{10})/);
    if (compactMatch) {
      return compactMatch[1].replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3');
    }
  }

  const fallbackMatch = text.match(/(\d{3})\s*-\s*(\d{2})\s*-\s*(\d{5})/);
  if (fallbackMatch) {
    return `${fallbackMatch[1]}-${fallbackMatch[2]}-${fallbackMatch[3]}`;
  }

  const fallbackCompact = text.match(/\b(\d{10})\b/);
  if (fallbackCompact) {
    return fallbackCompact[1].replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3');
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get('image') as File;
    const type = formData.get('type') as string;

    if (!ALLOWED_OCR_TYPES.has(type)) {
      return NextResponse.json({ error: '지원하지 않는 요청입니다.' }, { status: 400 });
    }

    if (!image) {
      return NextResponse.json({ error: '이미지가 없습니다.' }, { status: 400 });
    }

    if (!image.type || !image.type.startsWith(ALLOWED_MIME_PREFIX)) {
      return NextResponse.json({ error: '이미지 파일만 업로드할 수 있습니다.' }, { status: 400 });
    }

    if (image.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json({ error: '이미지 용량이 너무 큽니다. 20MB 이하로 업로드해주세요.' }, { status: 413 });
    }

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

    // 1. 이미지를 Buffer로 변환
    const arrayBuffer = await image.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Supabase Storage에 이미지 업로드
    const fileExt = image.name.split('.').pop();
    const safeExt = fileExt && fileExt.length <= 10 ? fileExt : 'bin';
    const fileName = `${type}_${Date.now()}.${safeExt}`;
    const folderName = type === 'auto' ? 'uploads' : `${type}s`;
    const filePath = `${folderName}/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('payment-images')
      .upload(filePath, buffer, {
        contentType: image.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('이미지 업로드 실패:', uploadError);
      return NextResponse.json(
        {
          error: '이미지 업로드에 실패했습니다.',
          details: uploadError.message,
        },
        { status: 500 }
      );
    }

    // 3. 업로드된 이미지의 Signed URL 생성 (짧은 만료)
    const { data: signedData, error: signedError } = await supabase.storage
      .from('payment-images')
      .createSignedUrl(filePath, 60 * 10);
    const imageUrl = signedData?.signedUrl || null;
    if (signedError) {
      console.warn('Signed URL 생성 실패:', signedError.message);
    }

    // 4. Google Cloud Vision API로 텍스트 추출
    const vision = getVisionClient();
    const [result] = await vision.textDetection(buffer);
    const detections = result.textAnnotations;

    if (!detections || detections.length === 0) {
      console.log('텍스트를 찾을 수 없습니다.');
      return NextResponse.json({
        imageUrl,
        imagePath: filePath,
        error: '이미지에서 텍스트를 찾을 수 없습니다.',
      });
    }

    // 전체 텍스트 (첫 번째 annotation이 전체 텍스트)
    const fullText = detections[0].description || '';

    // 5. 타입에 따라 정보 추출
    const extractedData: any = { imageUrl, imagePath: filePath };

    if (type === 'id_card') {
      // 신분증에서 주민등록번호 추출
      const residentNumber = extractResidentNumber(fullText);
      if (residentNumber) {
        extractedData.residentNumber = residentNumber;
      }
    } else if (type === 'bankbook') {
      // 통장에서 은행명과 계좌번호 추출
      const bankName = extractBankName(fullText);
      const accountNumber = extractAccountNumber(fullText);

      if (bankName) {
        extractedData.bankName = bankName;
      }

      if (accountNumber) {
        extractedData.accountNumber = accountNumber.replace(/-/g, ''); // 하이픈 제거
      }
    } else {
      const residentNumber = extractResidentNumber(fullText);
      const bankName = extractBankName(fullText);
      const businessRegistrationNumber = extractBusinessRegistrationNumber(fullText);
      let accountNumber = extractAccountNumber(fullText);
      const businessContext = /사업자\s*등록\s*증|사업자등록증|등록\s*번호|등록번호/.test(fullText);

      if (businessRegistrationNumber && accountNumber) {
        const businessDigits = businessRegistrationNumber.replace(/[^0-9]/g, '');
        const accountDigits = accountNumber.replace(/[^0-9]/g, '');
        if (businessDigits && accountDigits && businessDigits === accountDigits) {
          accountNumber = null;
        }
      }
      if (businessContext && !bankName) {
        accountNumber = null;
      }

      if (residentNumber) {
        extractedData.residentNumber = residentNumber;
      }
      if (bankName) {
        extractedData.bankName = bankName;
      }
      if (accountNumber) {
        extractedData.accountNumber = accountNumber.replace(/-/g, '');
      }
      if (businessRegistrationNumber) {
        extractedData.businessRegistrationNumber = businessRegistrationNumber;
      }
    }

    return NextResponse.json(extractedData);
  } catch (error) {
    console.error('OCR 처리 중 오류:', error);
    const message =
      error instanceof Error
        ? error.message
        : 'OCR 처리에 실패했습니다. 수동으로 입력해주세요.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
