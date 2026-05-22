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
  name: layerStyle(64, 682, 500, 64),
  grade: layerStyle(64, 744, 250, 44),
  ids: layerStyle(64, 795, 330, 62),
  emergency: layerStyle(88, 420, 465, 135)
};
