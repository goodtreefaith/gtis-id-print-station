import { publicAssetToDataUrl } from './assets';

export const ID_CARD_FONT_FACE = 'GTIS Avenir Bold';
export const ID_CARD_FONT_STACK =
  `"${ID_CARD_FONT_FACE}", "Avenir Next", Avenir, Arial, sans-serif`;

const OPTIONAL_FONT_FILES = [
  { path: 'fonts/Avenir-Bold.woff2', format: 'woff2' },
  { path: 'fonts/Avenir-Bold.otf', format: 'opentype' },
  { path: 'fonts/Avenir-Bold.ttf', format: 'truetype' }
];

let fontDataPromise: Promise<{ dataUrl: string; format: string } | null> | null = null;
let browserFontPromise: Promise<boolean> | null = null;

async function loadOptionalFontData() {
  for (const file of OPTIONAL_FONT_FILES) {
    try {
      return {
        dataUrl: await publicAssetToDataUrl(file.path),
        format: file.format
      };
    } catch {
      continue;
    }
  }

  return null;
}

function getOptionalFontData() {
  fontDataPromise ||= loadOptionalFontData();
  return fontDataPromise;
}

export async function loadOptionalIdCardFont() {
  if (!('fonts' in document) || typeof FontFace === 'undefined') {
    return false;
  }

  browserFontPromise ||= getOptionalFontData().then(async (font) => {
    if (!font) {
      return false;
    }

    const face = new FontFace(ID_CARD_FONT_FACE, `url(${font.dataUrl}) format("${font.format}")`, {
      style: 'normal',
      weight: '700'
    });
    await face.load();
    document.fonts.add(face);
    return true;
  });

  return browserFontPromise;
}

export async function optionalIdCardFontFaceCss() {
  const font = await getOptionalFontData();
  if (!font) {
    return '';
  }

  return `@font-face { font-family: "${ID_CARD_FONT_FACE}"; src: url("${font.dataUrl}") format("${font.format}"); font-style: normal; font-weight: 700; }`;
}
