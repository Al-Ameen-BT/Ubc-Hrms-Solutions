import { receiptDetails } from './validation';

export async function receiptData(asset: { name: string; mimeType?: string | null; size?: number | null }, file: { base64: () => Promise<string>; delete: () => void }) {
  try {
    const { mimeType } = receiptDetails(asset);
    return { name: asset.name, dataUrl: `data:${mimeType};base64,${await file.base64()}` };
  } finally {
    try { file.delete(); } catch { /* cache is disposable */ }
  }
}
