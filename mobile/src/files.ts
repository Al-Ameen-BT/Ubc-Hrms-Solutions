import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Api } from './api';
import { receiptData } from './receipt';

export async function pickReceipt() {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return receiptData(asset, new File(asset.uri));
}

export async function sharePrivateFile(api: Api, path: string, token: string, label: string) {
  const { bytes, mimeType } = await api.download(path, token);
  const extension = mimeType.includes('pdf') ? 'pdf' : mimeType.includes('png') ? 'png' : mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'bin';
  const file = new File(Paths.cache, `${label}-${Date.now()}.${extension}`);
  try {
    await file.write(bytes);
    if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
    await Sharing.shareAsync(file.uri, { mimeType });
  } finally {
    try { if (file.exists) file.delete(); } catch { /* cache is disposable */ }
  }
}
