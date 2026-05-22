const cache = new Map<string, string>();

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
