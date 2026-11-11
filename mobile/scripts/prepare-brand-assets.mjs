import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import https from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageAsync } from '@expo/image-utils';

const DEFAULT_MAX_BYTES = 128 * 1024;
const UAT_ORIGIN = 'https://172.17.121.200:8443';
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon']);

function request(url, certificatePath, maxBytes) {
  return new Promise((resolveRequest, reject) => {
    Promise.resolve(certificatePath ? readFile(certificatePath) : undefined).then(ca => {
      const req = https.get(url, ca ? { ca } : {}, response => {
        const chunks = [];
        let received = 0;
        response.on('data', chunk => {
          received += chunk.length;
          if (received > maxBytes) return req.destroy(new Error(`Platform favicon exceeds ${maxBytes} bytes.`));
          chunks.push(chunk);
        });
        response.on('end', () => resolveRequest({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          headers: { get: name => response.headers[name.toLowerCase()] || null },
          arrayBuffer: async () => Buffer.concat(chunks),
        }));
      });
      req.on('error', reject);
    }).catch(reject);
  });
}

export async function prepareBrandAssets({
  apiBaseUrl,
  fetchImpl,
  outputPath,
  maxBytes = DEFAULT_MAX_BYTES,
  certificatePath,
}) {
  let origin;
  try { origin = new URL(apiBaseUrl); }
  catch { throw new Error('EXPO_PUBLIC_API_BASE_URL must be a valid HTTPS origin.'); }
  if (origin.protocol !== 'https:') throw new Error('Platform branding requires an HTTPS HRMS origin.');
  const url = new URL('/assets/platform/favicon', origin);
  const response = await (fetchImpl || (requestUrl => request(requestUrl, certificatePath, maxBytes)))(url);
  if (!response.ok) throw new Error(`Platform favicon request failed with HTTP ${response.status}.`);
  const contentLength = Number(response.headers?.get?.('content-length') || 0);
  if (contentLength > maxBytes) throw new Error(`Platform favicon exceeds ${maxBytes} bytes.`);
  const contentType = String(response.headers?.get?.('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!IMAGE_TYPES.has(contentType)) throw new Error('Platform favicon response is not a supported image.');
  const source = Buffer.from(await response.arrayBuffer());
  if (!source.length || source.length > maxBytes) throw new Error(`Platform favicon exceeds ${maxBytes} bytes.`);

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'ucb-hrms-brand-'));
  const input = join(temporaryDirectory, 'platform-source');
  const outputDirectory = dirname(outputPath);
  const normalized = join(outputDirectory, `.platform-icon-${process.pid}-${Date.now()}.png`);
  try {
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(input, source);
    await imageAsync(
      { input, output: normalized, format: 'png' },
      [{ operation: 'resize', width: 1024, height: 1024, fit: 'contain', background: 'transparent' }],
    );
    const png = await readFile(normalized);
    if (png.subarray(1, 4).toString() !== 'PNG') throw new Error('Normalized platform favicon is not a PNG image.');
    await rename(normalized, outputPath);
    return { source: url.origin, sha256: createHash('sha256').update(png).digest('hex') };
  } catch (error) {
    throw new Error(`Platform favicon could not be decoded as an image: ${error instanceof Error ? error.message : 'invalid image'}`);
  } finally {
    await rm(normalized, { force: true });
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || '';
  const certificatePath = apiBaseUrl === UAT_ORIGIN ? join(root, 'certs', 'uat-server.pem') : undefined;
  const outputPath = join(root, 'assets', 'generated', 'platform-icon.png');
  const result = await prepareBrandAssets({ apiBaseUrl, outputPath, certificatePath });
  console.log(`Prepared platform icon from ${result.source} (${result.sha256}).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
