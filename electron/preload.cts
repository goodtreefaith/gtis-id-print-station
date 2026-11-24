import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('gtPrint', {
  listPrinters: () => ipcRenderer.invoke('printers:list'),
  printCard: (html: string, options: { deviceName?: string; silent?: boolean }) =>
    ipcRenderer.invoke('card:print', html, options),
  saveCardPdf: (html: string) => ipcRenderer.invoke('card:savePdf', html),
  // Pass the upright archive document from renderArchiveHtml, not the print HTML.
  captureCardPngs: (html: string) => ipcRenderer.invoke('card:capturePngs', html),
  fetchImageDataUrl: (url: string) => ipcRenderer.invoke('image:fetchDataUrl', url),
  readAssetDataUrl: (assetPath: string) => ipcRenderer.invoke('asset:readDataUrl', assetPath),
  // The device token stays in the main process. Only status comes back.
  device: {
    status: () => ipcRenderer.invoke('device:status'),
    configure: (input: { portalUrl: string; token: string }) =>
      ipcRenderer.invoke('device:configure', { portalUrl: input?.portalUrl, token: input?.token }),
    clear: () => ipcRenderer.invoke('device:clear')
  },
  portal: {
    request: (req: { method: 'GET' | 'POST'; path: string; body?: unknown; operatorToken?: string }) =>
      ipcRenderer.invoke('portal:request', {
        method: req?.method,
        path: req?.path,
        body: req?.body,
        operatorToken: req?.operatorToken
      })
  }
});
