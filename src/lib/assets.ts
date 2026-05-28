const cache = new Map<string, string>();

function normalizePublicAssetPath(assetPath: string) {
  return assetPath.replace(/^[/\\]+/, '');
}

export async function assetToDataUrl(url: string) {
  if (cache.has(url)) {
    return cache.get(url)!;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load asset: ${url}`);
  }

  const blob = await response.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  cache.set(url, dataUrl);
  return dataUrl;
}

export async function publicAssetToDataUrl(assetPath: string) {
  const normalizedPath = normalizePublicAssetPath(assetPath);
  const cacheKey = `public:${normalizedPath}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)!;
  }

  if (window.gtPrint?.readAssetDataUrl) {
    const dataUrl = await window.gtPrint.readAssetDataUrl(normalizedPath);
    if (!dataUrl) {
      throw new Error(`Could not load asset: ${normalizedPath}`);
    }
    cache.set(cacheKey, dataUrl);
    return dataUrl;
  }

  const dataUrl = await assetToDataUrl(new URL(normalizedPath, window.location.href).toString());
  cache.set(cacheKey, dataUrl);
  return dataUrl;
}
