import { describe, expect, it } from 'vitest';
import { decodeYolov8, detect, iou, nms } from './detector';
import type { Candidate } from './detector';

const options = { scoreThreshold: 0.5, iouThreshold: 0.5 };

function yolo(anchors: number, boxes: [number, number, number, number][], scores: number[]) {
  const numClasses = 1;
  const channels = 4 + numClasses;
  const data = new Float32Array(channels * anchors);
  const write = (channel: number, anchor: number, value: number) => {
    data[channel * anchors + anchor] = value;
  };
  boxes.forEach((box, anchor) => {
    write(0, anchor, box[0]);
    write(1, anchor, box[1]);
    write(2, anchor, box[2]);
    write(3, anchor, box[3]);
    write(4, anchor, scores[anchor] ?? 0);
  });
  return data;
}

describe('iou', () => {
  it('es 1 para cajas identicas', () => {
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(1);
  });

  it('es 0 para cajas disjuntas', () => {
    expect(iou({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 20, w: 10, h: 10 })).toBe(0);
  });
});

describe('decodeYolov8', () => {
  it('convierte centro/alto/ancho en esquina y filtra por umbral', () => {
    const data = yolo(
      2,
      [
        [100, 100, 40, 40],
        [200, 100, 40, 40],
      ],
      [0.9, 0.2],
    );
    const candidates = decodeYolov8(data, 2, 1, 0.5);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.box).toEqual({ x: 80, y: 80, w: 40, h: 40 });
    expect(candidates[0]?.classIndex).toBe(0);
  });

  it('devuelve vacio con datos insuficientes', () => {
    expect(decodeYolov8(new Float32Array(3), 1, 1, 0)).toEqual([]);
  });
});

describe('nms', () => {
  it('elimina solapes quedandose con la puntuacion mayor', () => {
    const candidates: Candidate[] = [
      { box: { x: 0, y: 0, w: 10, h: 10 }, score: 0.6, classIndex: 0 },
      { box: { x: 1, y: 1, w: 10, h: 10 }, score: 0.9, classIndex: 0 },
      { box: { x: 50, y: 50, w: 10, h: 10 }, score: 0.7, classIndex: 0 },
    ];
    const kept = nms(candidates, options);
    expect(kept).toHaveLength(2);
    expect(kept[0]?.score).toBe(0.9);
    expect(kept[1]?.score).toBe(0.7);
  });
});

describe('detect', () => {
  it('encadena decode y NMS', () => {
    const data = yolo(
      2,
      [
        [100, 100, 40, 40],
        [101, 101, 40, 40],
      ],
      [0.8, 0.7],
    );
    expect(detect(data, 2, 1, options)).toHaveLength(1);
  });
});
