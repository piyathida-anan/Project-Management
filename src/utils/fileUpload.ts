import { FIELD_LIMITS, type AllowedAttachmentMime } from '../types/budget';

const ALLOWED_MIMES: AllowedAttachmentMime[] = [
  'application/pdf',
  'image/jpeg',
  'image/png',
];

export interface ProcessedAttachment {
  name: string;
  mimeType: AllowedAttachmentMime;
  dataUrl: string;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('ไม่สามารถอ่านไฟล์ได้'));
      }
    };
    reader.onerror = () => reject(new Error('เกิดข้อผิดพลาดในการอ่านไฟล์'));
    reader.readAsDataURL(file);
  });
}

function compressImageDataUrl(
  dataUrl: string,
  targetMime: 'image/jpeg' | 'image/png'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1600;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('ไม่สามารถประมวลผลรูปภาพได้'));
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const output = canvas.toDataURL(
        targetMime === 'image/png' ? 'image/jpeg' : targetMime,
        0.82
      );
      resolve(output);
    };
    img.onerror = () => reject(new Error('ไฟล์รูปภาพไม่ถูกต้อง'));
    img.src = dataUrl;
  });
}

export async function processWithdrawalAttachment(
  file: File
): Promise<ProcessedAttachment> {
  const mime = file.type as AllowedAttachmentMime;
  if (!ALLOWED_MIMES.includes(mime)) {
    throw new Error('รองรับเฉพาะไฟล์ PDF, JPG หรือ PNG เท่านั้น');
  }

  if (file.size > FIELD_LIMITS.MAX_FILE_BYTES) {
    throw new Error('ขนาดไฟล์ต้องไม่เกิน 5 MB ต่อไฟล์');
  }

  let dataUrl = await readFileAsDataUrl(file);
  let finalMime: AllowedAttachmentMime = mime;

  if (
    (mime === 'image/jpeg' || mime === 'image/png') &&
    dataUrl.length > 6_200_000
  ) {
    dataUrl = await compressImageDataUrl(dataUrl, mime);
    if (dataUrl.startsWith('data:image/jpeg')) {
      finalMime = 'image/jpeg';
    }
  }

  if (dataUrl.length > FIELD_LIMITS.ATTACHMENT_DATA_MAX) {
    throw new Error('ขนาดไฟล์ต้องไม่เกิน 5 MB ต่อไฟล์');
  }

  const safeName =
    file.name.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9._ -]/g, '_').slice(0, 255) ||
    'document';

  return {
    name: safeName,
    mimeType: finalMime,
    dataUrl,
  };
}

export function dataUrlToSafeBlobUrl(
  dataUrl: string,
  expectedMime: AllowedAttachmentMime
): string | null {
  if (!dataUrl.startsWith(`data:${expectedMime};base64,`)) {
    // Also allow jpeg fallback if stored properly
    if (
      !dataUrl.startsWith('data:application/pdf;base64,') &&
      !dataUrl.startsWith('data:image/jpeg;base64,') &&
      !dataUrl.startsWith('data:image/png;base64,')
    ) {
      return null;
    }
  }

  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx < 0) return null;
  const header = dataUrl.slice(5, commaIdx);
  const mimeType = header.split(';')[0] || expectedMime;
  const base64 = dataUrl.slice(commaIdx + 1);

  try {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
