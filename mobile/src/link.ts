export function parseLinkQr(value: string): string {
  const match = /^ucbhrms-link:\/\/([A-Za-z0-9_-]{43})$/.exec(value.trim());
  if (!match) throw new Error('This is not an employee app linking QR code. Open My Account in your self-service portal.');
  return match[1];
}
