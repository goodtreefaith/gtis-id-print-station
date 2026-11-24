// Image helpers shared by the photo editor and print preparation.
// Moved unchanged from App.tsx so the crop output (860 × 996 JPEG) stays identical.

export const PHOTO_OUTPUT_WIDTH = 860;
export const PHOTO_OUTPUT_HEIGHT = 996;
export const PHOTO_EDITOR_FRAME_WIDTH = 320;
export const PHOTO_EDITOR_FRAME_HEIGHT = 370;

export async function renderCroppedPhoto(
  source: string,
  zoom: number,
  offsetX: number,
  offsetY: number,
  brightness: number
) {
  const image = await loadImage(source);
  const outputWidth = PHOTO_OUTPUT_WIDTH;
  const outputHeight = PHOTO_OUTPUT_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    return source;
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.filter = `brightness(${brightness}%)`;

  const baseScale = Math.max(outputWidth / image.width, outputHeight / image.height);
  const scale = baseScale * zoom;
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (outputWidth - width) / 2 + offsetX * (outputWidth / PHOTO_EDITOR_FRAME_WIDTH);
  const y = (outputHeight - height) / 2 + offsetY * (outputHeight / PHOTO_EDITOR_FRAME_HEIGHT);

  context.drawImage(image, x, y, width, height);
  return canvas.toDataURL('image/jpeg', 0.94);
}

export function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

export async function imageSourceToDataUrl(source: string, portalBaseUrl: string) {
  if (source.startsWith('data:')) {
    return source;
  }

  const url = resolveImageSource(source, portalBaseUrl);
  if (window.gtPrint?.fetchImageDataUrl) {
    try {
      return await window.gtPrint.fetchImageDataUrl(url);
    } catch {
      throw new Error('Could not download image through the desktop app.');
    }
  }

  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Could not fetch image.');
  }
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) {
    throw new Error('Fetched file is not an image.');
  }
  return fileToDataUrl(blob);
}

function resolveImageSource(source: string, portalBaseUrl: string) {
  if (/^https?:\/\//i.test(source)) {
    return source;
  }

  const base = portalBaseUrl.trim() || window.location.href;
  return new URL(source, base).toString();
}

export function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load captured photo.'));
    image.src = source;
  });
}
