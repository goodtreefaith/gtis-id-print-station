// Keep the shared renderer in sample mode and block its browser print fallback.
Object.defineProperty(window, 'gtPrint', {
  value: Object.freeze({
    previewOnly: true,
    listPrinters: async () => [],
    printCard: async () => ({ ok: false, error: 'Printing is unavailable in the Rust sample.' }),
    saveCardPdf: async () => ({ ok: false, error: 'PDF export is unavailable in the Rust sample.' }),
  }),
});
