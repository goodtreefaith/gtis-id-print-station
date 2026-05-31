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
  qr: layerStyle(346, 768, 240, 240),
  lastName: layerStyle(66, 583, 507, 63),
  firstName: layerStyle(66, 645, 507, 48),
  grade: layerStyle(66, 695, 507, 70),
  ids: layerStyle(56, 815, 286, 75),
  emergency: layerStyle(76, 400, 490, 165)
};
