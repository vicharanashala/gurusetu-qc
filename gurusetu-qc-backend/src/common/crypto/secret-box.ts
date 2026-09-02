import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * AES-256-GCM envelope for provider API keys.
 *
 * Keys live in Mongo, so they must not be readable by anyone who can dump the
 * collection. The wrapping key comes from ENCRYPTION_KEY in the environment and
 * never touches the database — losing it means every stored key must be
 * re-entered, which is the intended failure mode.
 *
 * Format: v1:<iv-b64>:<authTag-b64>:<ciphertext-b64>
 */
const PREFIX = 'v1';

const deriveKey = (secret: string): Buffer =>
  // ENCRYPTION_KEY is operator-supplied and may be any length; SHA-256 gives us
  // the exact 32 bytes AES-256 requires without imposing a format on operators.
  createHash('sha256').update(secret, 'utf8').digest();

export const encryptSecret = (plaintext: string, secret: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
};

export const decryptSecret = (envelope: string, secret: string): string => {
  const parts = envelope.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('Malformed secret envelope');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(secret),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};

/**
 * What the UI is allowed to see. Never return a decrypted key over HTTP — the
 * admin pasted it once and only ever needs to confirm *which* key is stored.
 */
export const maskSecret = (plaintext: string): string => {
  if (!plaintext) return '';
  if (plaintext.length <= 8) return '••••';
  return `${plaintext.slice(0, 3)}••••${plaintext.slice(-4)}`;
};
