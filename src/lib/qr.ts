import QRCode from 'qrcode';

export async function makeAdmissionQr(admissionNo: string) {
  return QRCode.toDataURL(admissionNo, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 10,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });
}
