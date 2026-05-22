const CARD_PREVIEW_WIDTH_PX = 315;
const CARD_PRINT_WIDTH_MM = 53.98;
const EMERGENCY_TEXT_WIDTH_PX = 222;

function normalizedLength(value: string) {
  return value.trim().replace(/\s+/g, ' ').length || 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fittedSingleLinePx(
  value: string,
  options: { min: number; max: number; width: number; averageGlyphWidth: number }
) {
  const size = options.width / (normalizedLength(value) * options.averageGlyphWidth);
  return clamp(size, options.min, options.max);
}

function fittedMultilinePx(
  value: string,
  options: { min: number; max: number; width: number; lines: number; averageGlyphWidth: number }
) {
  const size = (options.width * options.lines) / (normalizedLength(value) * options.averageGlyphWidth);
  return clamp(size, options.min, options.max);
}

export function emergencyNameFontPx(name: string) {
  return fittedSingleLinePx(name, {
    min: 10,
    max: 17,
    width: EMERGENCY_TEXT_WIDTH_PX,
    averageGlyphWidth: 0.59
  });
}

export function emergencyAddressFontPx(address: string) {
  return fittedMultilinePx(address, {
    min: 8.2,
    max: 13.2,
    width: EMERGENCY_TEXT_WIDTH_PX,
    lines: 2,
    averageGlyphWidth: 0.53
  });
}

export function emergencyPhoneFontPx(phone: string) {
  return fittedSingleLinePx(phone, {
    min: 15,
    max: 21,
    width: EMERGENCY_TEXT_WIDTH_PX,
    averageGlyphWidth: 0.58
  });
}

export function previewPxToPrintMm(px: number) {
  return `${((px / CARD_PREVIEW_WIDTH_PX) * CARD_PRINT_WIDTH_MM).toFixed(2)}mm`;
}
