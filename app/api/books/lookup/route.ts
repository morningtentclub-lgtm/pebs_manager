import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LookupRequest = {
  url?: string;
};

// 알라딘 OpenAPI(ttb)는 2026-10-30 종료되어 더 이상 호출할 수 없다.
// 대신 상품 페이지의 Open Graph 메타태그와 저자/출판사 영역을 읽는다.
const ALLOWED_HOSTS = new Set([
  'aladin.co.kr',
  'www.aladin.co.kr',
  'm.aladin.co.kr',
  'aladin.kr',
]);

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function isAladinHost(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    return ALLOWED_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#34': '"',
};

function decodeEntities(value: string) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, name: string) => {
    if (ENTITIES[name]) return ENTITIES[name];
    if (name.startsWith('#x') || name.startsWith('#X')) {
      return String.fromCodePoint(parseInt(name.slice(2), 16));
    }
    if (name.startsWith('#')) {
      return String.fromCodePoint(parseInt(name.slice(1), 10));
    }
    return match;
  });
}

function stripTags(html: string) {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function metaContent(html: string, property: string) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`,
    'i'
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
    'i'
  );
  const m = html.match(re) || html.match(alt);
  return m ? decodeEntities(m[1]).trim() : '';
}

/** JSON-LD 의 Book.name 이 가장 깔끔한 제목이다 */
function titleFromJsonLd(html: string) {
  const blocks = html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1].trim());
      if (parsed && parsed['@type'] === 'Book' && typeof parsed.name === 'string') {
        return parsed.name.trim();
      }
    } catch {
      // 파싱 실패한 블록은 건너뛴다
    }
  }
  return '';
}

/**
 * 저자·출판사는 같은 <li class="Ere_sub2_title"> 안에 들어 있다.
 *   <a ...AuthorSearch...>오션 브엉</a> (지은이), <a ...>김목인</a> (옮긴이)
 *   <a ...PublisherSearch...>인플루엔셜(주)</a> 2025-12-30
 * 출판사 링크를 기준으로 앞쪽을 저자, 링크 안쪽을 출판사로 본다.
 */
function authorAndPublisher(html: string) {
  const li = html.match(/<li[^>]*class=["'][^"']*Ere_sub2_title[^"']*["'][^>]*>([\s\S]*?)<\/li>/i);
  if (!li) return { author: '', publisher: '' };

  const inner = li[1];
  const pubMatch = inner.match(
    /<a[^>]*PublisherSearch=[^>]*>([\s\S]*?)<\/a>/i
  );
  const publisher = pubMatch ? stripTags(pubMatch[1]) : '';

  const authorPart = pubMatch ? inner.slice(0, inner.indexOf(pubMatch[0])) : inner;
  const author = stripTags(authorPart)
    .replace(/\s*,\s*/g, ', ') // "(지은이),김목인" → "(지은이), 김목인"
    .replace(/[,\s]+$/, '')
    .trim();

  return { author, publisher };
}

function parsePrice(value: string) {
  const digits = value.replace(/[^0-9]/g, '');
  return digits ? Number(digits) : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LookupRequest;
    const url = (body?.url || '').trim();

    if (!url) {
      return NextResponse.json({ error: '알라딘 링크를 입력해주세요.' }, { status: 400 });
    }
    if (!isAladinHost(url)) {
      return NextResponse.json(
        { error: '알라딘 상품 링크만 조회할 수 있습니다.' },
        { status: 400 }
      );
    }

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'follow',
        cache: 'no-store',
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'ko-KR,ko;q=0.9',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      return NextResponse.json(
        { error: '알라딘 페이지를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.' },
        { status: 502 }
      );
    }

    // 단축링크(aladin.kr)는 리다이렉트되므로 최종 주소도 다시 확인한다
    if (response.url && !isAladinHost(response.url)) {
      return NextResponse.json(
        { error: '알라딘 상품 링크만 조회할 수 있습니다.' },
        { status: 400 }
      );
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: `알라딘 페이지를 불러오지 못했습니다. (status ${response.status})` },
        { status: 502 }
      );
    }

    const html = await response.text();

    // 상품 페이지만 통과시킨다. 목록·홈 페이지는 og:type 이 website 다.
    const ogType = metaContent(html, 'og:type');
    const isbn13 = metaContent(html, 'og:barcode').replace(/[^0-9]/g, '');
    const ogTitle = metaContent(html, 'og:title');
    const title = titleFromJsonLd(html) || ogTitle.split('|')[0].trim();
    const { author, publisher } = authorAndPublisher(html);
    const price = parsePrice(metaContent(html, 'og:price'));

    const looksLikeProduct = ogType.startsWith('books') || Boolean(isbn13);
    if (!title || !looksLikeProduct) {
      return NextResponse.json(
        {
          error:
            '페이지에서 도서 정보를 찾지 못했습니다. 상품 페이지 링크가 맞는지 확인하거나 직접 입력해주세요.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      title,
      author: author || metaContent(html, 'og:author'),
      publisher,
      price,
      isbn13,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
