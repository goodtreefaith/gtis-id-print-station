import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('gtPrint', {
  listPrinters: () => ipcRenderer.invoke('printers:list'),
  printCard: (html: string, options: { deviceName?: string; silent?: boolean }) =>
    ipcRenderer.invoke('card:print', html, options),
  saveCardPdf: (html: string) => ipcRenderer.invoke('card:savePdf', html),
  fetchImageDataUrl: (url: string) => ipcRenderer.invoke('image:fetchDataUrl', url)
});
