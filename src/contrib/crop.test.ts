import { describe, expect, it } from 'vitest';
import { cropRect, cropToJpeg, type CropBox } from './crop';

function box(x: number, y: number, w: number, h: number): CropBox {
  return { x, y, w, h };
}

describe('cropRect margen por defecto', () => {
  it('expande una caja centrada con margen 0.1', () => {
    expect(cropRect(box(0.25, 0.25, 0.5, 0.5), 100, 100)).toEqual({
      sx: 20,
      sy: 20,
      sw: 60,
      sh: 60,
    });
  });

  it('el margen por defecto equivale a 0.1 explicito', () => {
    const caja = box(0.2, 0.3, 0.4, 0.4);
    expect(cropRect(caja, 200, 150)).toEqual(cropRect(caja, 200, 150, 0.1));
  });

  it('el margen por defecto equivale a 0.1 en caja descentrada', () => {
    const caja = box(0.5, 0.5, 0.5, 0.5);
    expect(cropRect(caja, 100, 100)).toEqual(cropRect(caja, 100, 100, 0.1));
  });
});

describe('cropRect margen cero', () => {
  it('no expande la caja', () => {
    expect(cropRect(box(0.25, 0.25, 0.5, 0.5), 100, 100, 0)).toEqual({
      sx: 25,
      sy: 25,
      sw: 50,
      sh: 50,
    });
  });

  it('respeta la caja completa', () => {
    expect(cropRect(box(0, 0, 1, 1), 100, 100, 0)).toEqual({
      sx: 0,
      sy: 0,
      sw: 100,
      sh: 100,
    });
  });
});

describe('cropRect margen explicito', () => {
  it('aplica 0.2 a una caja centrada', () => {
    expect(cropRect(box(0.25, 0.25, 0.5, 0.5), 100, 100, 0.2)).toEqual({
      sx: 15,
      sy: 15,
      sw: 70,
      sh: 70,
    });
  });

  it('escala con las dimensiones de la imagen', () => {
    expect(cropRect(box(0.25, 0.25, 0.5, 0.5), 400, 200, 0.1)).toEqual({
      sx: 80,
      sy: 40,
      sw: 240,
      sh: 120,
    });
  });
});

describe('cropRect clamp en bordes', () => {
  it('recorta por arriba e izquierda', () => {
    expect(cropRect(box(0, 0, 0.5, 0.5), 100, 100, 0.1)).toEqual({
      sx: 0,
      sy: 0,
      sw: 55,
      sh: 55,
    });
  });

  it('recorta por abajo y derecha', () => {
    expect(cropRect(box(0.5, 0.5, 0.5, 0.5), 100, 100, 0.1)).toEqual({
      sx: 45,
      sy: 45,
      sw: 55,
      sh: 55,
    });
  });

  it('la caja completa con margen queda en [0,width]x[0,height]', () => {
    const rect = cropRect(box(0, 0, 1, 1), 100, 100, 0.1);
    expect(rect).toEqual({ sx: 0, sy: 0, sw: 100, sh: 100 });
    expect(rect.sx + rect.sw).toBeLessThanOrEqual(100);
    expect(rect.sy + rect.sh).toBeLessThanOrEqual(100);
  });

  it('valores negativos se recortan a cero', () => {
    expect(cropRect(box(-0.25, -0.25, 0.5, 0.5), 100, 100, 0)).toEqual({
      sx: 0,
      sy: 0,
      sw: 25,
      sh: 25,
    });
  });
});

describe('cropRect cajas degeneradas', () => {
  it('caja de ancho y alto cero produce al menos un pixel', () => {
    const rect = cropRect(box(0.5, 0.5, 0, 0), 100, 100);
    expect(rect).toEqual({ sx: 50, sy: 50, sw: 1, sh: 1 });
  });

  it('caja cero con margen cero produce al menos un pixel', () => {
    const rect = cropRect(box(0.5, 0.5, 0, 0), 100, 100, 0);
    expect(rect.sw).toBeGreaterThanOrEqual(1);
    expect(rect.sh).toBeGreaterThanOrEqual(1);
  });

  it('ancho y alto negativos se sanean a al menos un pixel', () => {
    const rect = cropRect(box(0.5, 0.5, -0.2, -0.2), 100, 100, 0.1);
    expect(rect.sw).toBeGreaterThanOrEqual(1);
    expect(rect.sh).toBeGreaterThanOrEqual(1);
  });
});

describe('cropRect valores fuera de rango', () => {
  it('caja totalmente a la derecha queda dentro de los limites', () => {
    const rect = cropRect(box(1.2, 1.2, 0.5, 0.5), 100, 100, 0.1);
    expect(rect).toEqual({ sx: 99, sy: 99, sw: 1, sh: 1 });
    expect(rect.sx + rect.sw).toBeLessThanOrEqual(100);
    expect(rect.sy + rect.sh).toBeLessThanOrEqual(100);
  });

  it('valores muy negativos quedan dentro de los limites', () => {
    const rect = cropRect(box(-5, -5, 0.5, 0.5), 100, 100, 0);
    expect(rect.sx).toBeGreaterThanOrEqual(0);
    expect(rect.sy).toBeGreaterThanOrEqual(0);
    expect(rect.sx + rect.sw).toBeLessThanOrEqual(100);
    expect(rect.sy + rect.sh).toBeLessThanOrEqual(100);
  });

  it('dimensiones fraccionarias se redondean a enteros', () => {
    const rect = cropRect(box(0.333, 0.333, 0.333, 0.333), 100, 100, 0.1);
    expect(Number.isInteger(rect.sx)).toBe(true);
    expect(Number.isInteger(rect.sy)).toBe(true);
    expect(Number.isInteger(rect.sw)).toBe(true);
    expect(Number.isInteger(rect.sh)).toBe(true);
  });
});

describe('cropRect invariantes', () => {
  it('siempre devuelve anchos y altos positivos', () => {
    const cajas = [
      box(0, 0, 0, 0),
      box(1, 1, 0, 0),
      box(-1, -1, 2, 2),
      box(0.5, 0.5, 0, 0.5),
      box(0.5, 0.5, 0.5, 0),
      box(2, 2, 2, 2),
    ];
    for (const caja of cajas) {
      const rect = cropRect(caja, 100, 100);
      expect(rect.sw).toBeGreaterThanOrEqual(1);
      expect(rect.sh).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('cropToJpeg export', () => {
  it('es una funcion exportada', () => {
    expect(typeof cropToJpeg).toBe('function');
  });
});

/**
 * cropToJpeg solo puede ejecutarse en el navegador; aqui se stubea el minimo
 * de DOM para demostrar la propiedad exigida por la spec 15 (criterio 4): el
 * recorte sale de un canvas reencodado (image/jpeg), NO copia los bytes de
 * origen, por lo que no puede arrastrar EXIF/GPS.
 */
describe('cropToJpeg reencoda en canvas (sin metadatos por construccion)', () => {
  it('devuelve el JPEG de toBlob, no los bytes de origen, con la region correcta', async () => {
    const toBlobBytes = new Uint8Array([1, 2, 3, 4, 5]);
    const drawCalls: number[][] = [];
    const seen: { type: string | undefined; quality: number | undefined } = {
      type: undefined,
      quality: undefined,
    };

    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (...args: unknown[]) => {
          drawCalls.push(args.slice(1).map((value) => Number(value)));
        },
      }),
      toBlob: (cb: (blob: Blob | null) => void, type?: string, quality?: number) => {
        seen.type = type;
        seen.quality = quality;
        cb(new Blob([toBlobBytes], { type: type ?? 'image/jpeg' }));
      },
    };

    const originalImage = Reflect.get(globalThis, 'Image');
    const originalDocument = Reflect.get(globalThis, 'document');
    Reflect.set(globalThis, 'Image', FakeImage);
    Reflect.set(globalThis, 'document', { createElement: () => canvas });
    try {
      const sourceMarker = 'EXIF-GPS-SOURCE';
      const dataUrl = `data:image/jpeg;base64,${Buffer.from(sourceMarker).toString('base64')}`;
      const blob = await cropToJpeg({ dataUrl, width: 100, height: 80 }, box(0.25, 0.25, 0.5, 0.5));
      const out = new Uint8Array(await blob.arrayBuffer());

      expect(blob.type).toBe('image/jpeg');
      expect(seen.type).toBe('image/jpeg');
      expect(seen.quality).toBe(0.8);
      expect([...out]).toEqual([...toBlobBytes]);
      expect(Buffer.from(out).toString()).not.toContain(sourceMarker);
      expect(drawCalls[0]?.slice(0, 4)).toEqual([20, 16, 60, 48]);
    } finally {
      Reflect.set(globalThis, 'Image', originalImage);
      Reflect.set(globalThis, 'document', originalDocument);
    }
  });
});
