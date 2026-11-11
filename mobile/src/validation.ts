export function claimAmount(value: string): number {
  if (!/^\d+$/.test(value.trim())) throw new Error('Enter a whole-rupee amount.');
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount > 100000000) throw new Error('Enter an amount up to ₹10,00,00,000.');
  if (amount <= 0) throw new Error('Enter a positive amount.');
  return amount;
}

export function receiptDetails(file: { name: string; mimeType?: string | null; size?: number | null }) {
  const mimeType = file.mimeType || ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' } as Record<string, string>)[file.name.split('.').pop()?.toLowerCase() || ''];
  if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) throw new Error('Choose a PDF or image receipt.');
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('Receipt must be under 5 MB.');
  return { mimeType };
}

export function periodQuery(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error('Choose a valid year and month.');
  return `year=${year}&month=${month}`;
}

export function bankToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
