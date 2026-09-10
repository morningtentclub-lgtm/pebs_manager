// 업로드 전 브라우저에서 이미지를 축소·재인코딩한다.
// Vercel 서버리스 함수의 요청 본문 한도(4.5MB)를 넘기지 않기 위한 것이며,
// EXIF 회전 정보도 픽셀에 반영되므로 OCR 인식률에도 도움이 된다.

const DEFAULT_MAX_DIMENSION = 2400;
const DEFAULT_MAX_BYTES = 3.5 * 1024 * 1024;
// 이 크기 이하는 그대로 올린다 (재인코딩으로 오히려 화질만 손해)
const SKIP_BELOW_BYTES = 1.5 * 1024 * 1024;
const QUALITY_STEPS = [0.85, 0.72, 0.6];

export type CompressResult = {
  file: File;
  compressed: boolean;
  /** 압축하지 않았거나 목표 용량에 못 미친 이유 */
  reason?: 'small' | 'decode-failed' | 'encode-failed' | 'no-gain' | 'still-large';
};

type DecodedImage = ImageBitmap | HTMLImageElement;

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Safari 구버전 등 옵션 미지원 → <img> 경로로 폴백
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('이미지를 디코딩할 수 없습니다.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getSize(source: DecodedImage) {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

function withJpegName(name: string) {
  const base = name.replace(/\.[^.]+$/, '') || 'image';
  return `${base}.jpg`;
}

export async function compressImageFile(
  file: File,
  options: { maxDimension?: number; maxBytes?: number } = {}
): Promise<CompressResult> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

  if (file.size <= SKIP_BELOW_BYTES) {
    return { file, compressed: false, reason: 'small' };
  }

  let source: DecodedImage;
  try {
    source = await decodeImage(file);
  } catch {
    // HEIC 등 브라우저가 못 여는 포맷 — 원본을 그대로 넘긴다
    return { file, compressed: false, reason: 'decode-failed' };
  }

  try {
    const { width, height } = getSize(source);
    if (!width || !height) {
      return { file, compressed: false, reason: 'decode-failed' };
    }

    let scale = Math.min(1, maxDimension / Math.max(width, height));
    let best: Blob | null = null;

    // 품질을 낮춰도 목표 용량을 못 맞추면 해상도를 한 단계 더 줄여 재시도
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));

      const ctx = canvas.getContext('2d');
      if (!ctx) return { file, compressed: false, reason: 'encode-failed' };
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

      for (const quality of QUALITY_STEPS) {
        const blob = await toBlob(canvas, quality);
        if (!blob) continue;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= maxBytes) {
          best = blob;
          break;
        }
      }

      if (best && best.size <= maxBytes) break;
      scale *= 0.7;
    }

    if (!best) {
      return { file, compressed: false, reason: 'encode-failed' };
    }
    if (best.size >= file.size) {
      return { file, compressed: false, reason: 'no-gain' };
    }

    const compressedFile = new File([best], withJpegName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });

    return {
      file: compressedFile,
      compressed: true,
      reason: best.size > maxBytes ? 'still-large' : undefined,
    };
  } finally {
    if (!(source instanceof HTMLImageElement)) source.close();
  }
}
