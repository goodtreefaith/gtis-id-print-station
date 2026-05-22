import type { CSSProperties } from 'react';

const SOURCE_WIDTH = 639;
const SOURCE_HEIGHT = 1011;

export function layerStyle(x: number, y: number, width: number, height?: number): CSSProperties {
  return {
    left: `${(x / SOURCE_WIDTH) * 100}%`,
    top: `${(y / SOURCE_HEIGHT) * 100}%`,
    width: `${(width / SOURCE_WIDTH) * 100}%`,
    ...(height ? { height: `${(height / SOURCE_HEIGHT) * 100}%` } : {})
  };
}

export const cardLayers = {
  photo: layerStyle(72, 250, 280, 420),
  qr: layerStyle(432, 113, 170, 170),
  studentNo: layerStyle(390, 508, 205, 48),
  name: layerStyle(64, 672, 500, 66),
  grade: layerStyle(64, 744, 250, 44),
  ids: layerStyle(64, 792, 330, 58),
  emergency: layerStyle(76, 400, 490, 165)
};
