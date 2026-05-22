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
  photo: layerStyle(178, 247, 287, 332),
  qr: layerStyle(375, 804, 171, 171),
  studentNo: layerStyle(375, 775, 171, 26),
  lastName: layerStyle(66, 592, 507, 48),
  firstName: layerStyle(66, 650, 507, 36),
  grade: layerStyle(66, 710, 507, 40),
  ids: layerStyle(74, 828, 270, 58),
  emergency: layerStyle(76, 400, 490, 165)
};
