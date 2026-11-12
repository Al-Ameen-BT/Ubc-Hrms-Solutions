'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const dotenv = require('dotenv');

function provisionPushSecrets(filename) {
  if (!filename) throw new Error('An existing runtime env file path is required.');
  const fd = fs.openSync(filename, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error('Runtime env must be a regular file.');
    const original = fs.readFileSync(fd, 'utf8');
    const env = dotenv.parse(original);
    const additions = [];
    const publicKey = env.VAPID_PUBLIC_KEY;
    const privateKey = env.VAPID_PRIVATE_KEY;
    if (Boolean(publicKey) !== Boolean(privateKey)) throw new Error('Incomplete VAPID key pair; restore the missing key before continuing.');
    if (publicKey) {
      const pair = crypto.createECDH('prime256v1');
      pair.setPrivateKey(Buffer.from(privateKey, 'base64url'));
      if (pair.getPublicKey().toString('base64url') !== publicKey) throw new Error('VAPID keys do not match. Existing keys were preserved.');
    } else {
      const pair = crypto.createECDH('prime256v1');
      pair.generateKeys();
      additions.push(`VAPID_PUBLIC_KEY=${pair.getPublicKey().toString('base64url')}`, `VAPID_PRIVATE_KEY=${pair.getPrivateKey().toString('base64url')}`);
    }
    if (env.PUSH_CREDENTIALS_KEY && !/^[a-f0-9]{64}$/i.test(env.PUSH_CREDENTIALS_KEY)) throw new Error('PUSH_CREDENTIALS_KEY must contain 64 hexadecimal characters.');
    if (!env.PUSH_CREDENTIALS_KEY) additions.push(`PUSH_CREDENTIALS_KEY=${crypto.randomBytes(32).toString('hex')}`);
    fs.fchmodSync(fd, 0o600);
    if (additions.length) {
      fs.writeSync(fd, `${original.endsWith('\n') ? '' : '\n'}${additions.join('\n')}\n`, fs.fstatSync(fd).size, 'utf8');
      fs.fsyncSync(fd);
    }
    return additions.length;
  } finally { fs.closeSync(fd); }
}

if (require.main === module) {
  try { console.log(`Push secret provisioning complete (${provisionPushSecrets(process.argv[2])} missing values added).`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { provisionPushSecrets };
