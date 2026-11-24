// Dev-only fixture: a fake `window.gtPrint` bridge for the screenshot harness.
// Injected by capture.mjs with Playwright's addInitScript. Never bundled.
// Nothing here talks to a printer or a portal: `portal.request` answers from the
// in-memory synthetic students below. Every value is made up.
//
// A preset can be set before this script runs: window.__stubPreset = { mode, portalUrl, uploadFail, ... }.
// `mode` mirrors how the desktop app was started: 'live', or 'sample' (GTIS_IDPRINT_SAMPLE=1).
(() => {
  const preset = window.__stubPreset || {};
  const control = (window.__stub = {
    printFail: false,
    printDelayMs: 1800,
    uploadFail: false,
    uploadDelayMs: 1500,
    noPrinters: false,
    printCalls: 0,
    jobs: [],
    archiveJobs: [],
    searchFail: false,
    canEdit: true,
    mode: 'sample',
    portalUrl: 'https://portal.gtis.edu.ph',
    ...preset
  });

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const blankPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const avatar = (initials, bg) =>
    'data:image/svg+xml;charset=UTF-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 560"><rect width="420" height="560" fill="${bg}"/><circle cx="210" cy="174" r="86" fill="#f7d6bd"/><path d="M105 560c10-138 200-138 210 0z" fill="#064f2b"/><circle cx="178" cy="170" r="8" fill="#222"/><circle cx="242" cy="170" r="8" fill="#222"/><path d="M172 228c22 19 54 19 76 0" fill="none" stroke="#8a4b35" stroke-width="8" stroke-linecap="round"/><text x="210" y="432" font-family="Arial" font-size="52" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text></svg>`
    );

  // Synthetic "portal" students (same fictional people as src/data/mockStudents.ts).
  const db = [
    {
      id: 'p-901', admission_no: '2026001', firstname: 'Jetto Morris', middlename: 'R.', lastname: 'Bamba',
      class: 'Grade 12', section: 'Faith', photo_url: avatar('JB', '#ead6bf'),
      guardian_name: 'Maria Bamba', guardian_relation: 'Mother', guardian_address: '1 Bagtas, Tanza, Cavite',
      guardian_phone: '0917-111-2026', lrn: '123456789101', esc: '12345678910'
    },
    {
      id: 'p-902', admission_no: '2026002', firstname: 'Arielle', middlename: '', lastname: 'Santos',
      class: 'Grade 8', section: 'Hope', photo_url: '', guardian_name: 'Ramon Santos', guardian_relation: 'Father',
      guardian_address: '', guardian_phone: '', lrn: '987654321012', esc: ''
    },
    {
      id: 'p-903', admission_no: '2026003', firstname: 'Nathaniel Christopher', middlename: 'Dela Cruz', lastname: 'Villanueva',
      class: 'Grade 5', section: 'Love', photo_url: avatar('NV', '#c9d7c4'),
      guardian_name: 'Maria Isabella Dela Cruz Villanueva-Santos', guardian_relation: 'Legal Guardian',
      guardian_address: 'Block 4 Lot 12, Grand Riverside Subdivision, Tanza, Cavite', guardian_phone: '0998-555-0144', lrn: '', esc: ''
    }
  ];

  const ok = (payload) => ({ ok: true, status: 200, payload: { status: true, ...payload } });
  const fail = (status, message) => ({ ok: false, status, payload: { status: false, message } });

  async function portalRequest(req) {
    await wait(200);
    const path = String(req.path || '');
    if (control.mode !== 'live') return fail(0, 'Sample mode: no portal.');
    if (path === '/idprintapi/login') {
      if (req.body && req.body.password === 'wrong') return fail(401, 'That email or password didn’t work. Check them and try again.');
      return ok({
        operator_token: 'fixture-operator-session',
        operator: { name: 'Sample Registrar', email: 'registrar@example.invalid', permissions: { can_view: true, can_edit: control.canEdit } },
        expires_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString()
      });
    }
    if (path.startsWith('/idprintapi/students?') && control.searchFail) {
      return fail(500, 'The portal did not answer.');
    }
    if (path.startsWith('/idprintapi/students?')) {
      const params = new URLSearchParams(path.split('?')[1]);
      const q = (params.get('q') || '').toLowerCase();
      const hits = db.filter((s) => !q || [s.admission_no, s.firstname, s.middlename, s.lastname, s.guardian_name].join(' ').toLowerCase().includes(q));
      return ok({ students: hits, page: 1, has_more: false });
    }
    const match = path.match(/^\/idprintapi\/students\/([^/]+)\/(guardian|name|id-details|ids|photo|id-card-documents)$/);
    if (match) {
      const student = db.find((s) => s.id === decodeURIComponent(match[1]));
      if (!student) return fail(404, 'Student was not found.');
      const body = req.body || {};
      if (match[2] === 'id-card-documents') {
        await wait(control.uploadDelayMs);
        if (control.uploadFail) return fail(504, 'The portal took too long to answer.');
        return ok({ documents: [{ name: 'front.png' }, { name: 'back.png' }] });
      }
      if (match[2] === 'guardian') {
        Object.assign(student, {
          guardian_name: body.guardian_name, guardian_relation: body.guardian_relation,
          guardian_address: body.guardian_address, guardian_phone: body.guardian_phone
        });
      } else if (match[2] === 'photo') {
        student.photo_url = body.photo_data_url;
      } else {
        Object.assign(student, body);
      }
      return ok({ student });
    }
    return fail(404, `No fixture for ${path}`);
  }

  window.gtPrint = {
    async listPrinters() {
      if (control.noPrinters) return [];
      return [
        { name: 'SMART-51D Card Printer', displayName: 'SMART-51D Card Printer', isDefault: false },
        { name: 'Office Laser (sample)', displayName: 'Office Laser (sample)', isDefault: true }
      ];
    },
    async printCard(html, options) {
      control.printCalls += 1;
      const title = (String(html).match(/<title>([^<]*)<\/title>/) || [])[1] || '';
      control.jobs.push({ title, html: String(html) });
      await wait(control.printDelayMs);
      if (control.printFail) {
        return { ok: false, error: 'device offline', failureReason: 'offline' };
      }
      return { ok: true, mode: options && options.silent ? 'silent' : 'dialog', printerName: options && options.deviceName };
    },
    async saveCardPdf() {
      await wait(400);
      return { ok: true, filePath: 'Documents/ID Cards/sample-2026001.pdf' };
    },
    async captureCardPngs(html) {
      control.archiveJobs.push(String(html));
      await wait(300);
      return { front: blankPng, back: blankPng, dpi: 600 };
    },
    async fetchImageDataUrl(url) {
      const response = await fetch(url);
      const blob = await response.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
    },
    portal: {
      async info() {
        return { portalUrl: control.portalUrl, mode: control.mode };
      },
      request: portalRequest
    }
  };
})();
