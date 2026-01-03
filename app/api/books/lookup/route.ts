import { NextResponse } from 'next/server';

type LookupRequest = {
  url?: string;
};

const ALADIN_ENDPOINT = 'https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx';

const extractItemId = (rawUrl: string) => {
  let itemId = '';
  let itemIdType: 'ItemId' | 'ISBN13' = 'ItemId';

  try {
    const parsed = new URL(rawUrl);
    const queryItemId = parsed.searchParams.get('ItemId') || parsed.searchParams.get('itemid');
    const isbnParam =
      parsed.searchParams.get('ISBN') ||
      parsed.searchParams.get('isbn') ||
      parsed.searchParams.get('isbn13') ||
      parsed.searchParams.get('ISBN13');

    if (queryItemId) {
      itemId = queryItemId;
      itemIdType = 'ItemId';
    } else if (isbnParam) {
      itemId = isbnParam.replace(/[^0-9]/g, '');
      itemIdType = 'ISBN13';
    } else {
      const isbnMatch = rawUrl.match(/97[89][0-9]{10}/);
      if (isbnMatch) {
        itemId = isbnMatch[0];
        itemIdType = 'ISBN13';
      } else {
        const itemIdMatch = rawUrl.match(/ItemId=([0-9]+)/i);
        if (itemIdMatch) {
          itemId = itemIdMatch[1];
          itemIdType = 'ItemId';
        }
      }
    }
  } catch {
    return null;
  }

  if (!itemId) {
    return null;
  }

  return { itemId, itemIdType };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LookupRequest;
    const url = (body?.url || '').trim();

    if (!url) {
      return NextResponse.json({ error: '알라딘 링크를 입력해주세요.' }, { status: 400 });
    }

    const parsed = extractItemId(url);
    if (!parsed) {
      return NextResponse.json({ error: '알라딘 링크에서 책 정보를 찾지 못했습니다.' }, { status: 400 });
    }

    const ttbKey = process.env.ALADIN_TTB_KEY;
    if (!ttbKey) {
      return NextResponse.json({ error: 'ALADIN_TTB_KEY가 설정되어 있지 않습니다.' }, { status: 500 });
    }

    const endpoint = new URL(ALADIN_ENDPOINT);
    endpoint.searchParams.set('ttbkey', ttbKey);
    endpoint.searchParams.set('itemIdType', parsed.itemIdType);
    endpoint.searchParams.set('ItemId', parsed.itemId);
    endpoint.searchParams.set('Output', 'JS');
    endpoint.searchParams.set('Version', '20131101');

    const response = await fetch(endpoint.toString(), { cache: 'no-store' });
    if (!response.ok) {
      return NextResponse.json({ error: '알라딘 API 호출에 실패했습니다.' }, { status: 502 });
    }

    const data = await response.json();
    const item = Array.isArray(data?.item) ? data.item[0] : null;

    if (!item) {
      return NextResponse.json({ error: '도서 정보를 찾지 못했습니다.' }, { status: 404 });
    }

    return NextResponse.json({
      title: item.title || '',
      author: item.author || '',
      publisher: item.publisher || '',
      price: item.priceSales ?? item.priceStandard ?? null,
      isbn13: item.isbn13 || '',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
