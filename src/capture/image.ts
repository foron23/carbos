export interface CapturedImage {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
}

const DEFAULT_MAX_EDGE = 1024;

function fitWithin(width: number, height: number, maxEdge: number): { w: number; h: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { w: width, h: height };
  const scale = maxEdge / longest;
  return { w: Math.round(width * scale), h: Math.round(height * scale) };
}

async function loadSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* algunos navegadores no soportan la opcion: caemos al elemento img */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    image.src = url;
  });
}

function sourceSize(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

export async function prepareImage(file: File, maxEdge = DEFAULT_MAX_EDGE): Promise<CapturedImage> {
  const source = await loadSource(file);
  const { width, height } = sourceSize(source);
  const { w, h } = fitWithin(width, height, maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas no disponible');
  context.drawImage(source, 0, 0, w, h);
  if (source instanceof ImageBitmap) source.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return { dataUrl, width: w, height: h, bytes: Math.round((base64.length * 3) / 4) };
}
