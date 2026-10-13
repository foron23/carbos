export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_MARGIN = 0.1;
const DEFAULT_QUALITY = 0.8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('crop: imagen no cargada'));
    image.src = dataUrl;
  });
}

export function cropRect(
  box: CropBox,
  width: number,
  height: number,
  margin = DEFAULT_MARGIN,
): { sx: number; sy: number; sw: number; sh: number } {
  const px = box.x * width;
  const py = box.y * height;
  const pw = box.w * width;
  const ph = box.h * height;

  const dx = pw * margin;
  const dy = ph * margin;

  const left = px - dx;
  const top = py - dy;
  const right = left + pw + dx * 2;
  const bottom = top + ph + dy * 2;

  const clampedLeft = clamp(left, 0, width);
  const clampedTop = clamp(top, 0, height);
  const clampedRight = clamp(right, 0, width);
  const clampedBottom = clamp(bottom, 0, height);

  let sx = Math.round(clampedLeft);
  let sy = Math.round(clampedTop);
  let sw = Math.round(clampedRight - clampedLeft);
  let sh = Math.round(clampedBottom - clampedTop);

  sw = Math.max(1, sw);
  sh = Math.max(1, sh);

  if (sx + sw > width) sx = Math.max(0, width - sw);
  if (sy + sh > height) sy = Math.max(0, height - sh);

  return { sx, sy, sw, sh };
}

export async function cropToJpeg(
  image: { dataUrl: string; width: number; height: number },
  box: CropBox,
  opts?: { margin?: number; quality?: number },
): Promise<Blob> {
  const margin = opts?.margin ?? DEFAULT_MARGIN;
  const quality = opts?.quality ?? DEFAULT_QUALITY;
  const { sx, sy, sw, sh } = cropRect(box, image.width, image.height, margin);

  const source = await loadImage(image.dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('crop: canvas sin contexto 2d');
  context.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('crop: toBlob sin resultado'));
      },
      'image/jpeg',
      quality,
    );
  });
}
