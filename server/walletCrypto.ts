/**
 * Server-side wallet seed encryption using AES-256-GCM.
 * Set WALLET_ENCRYPTION_KEY (32-byte hex, 64 chars) to enable encryption at rest.
 * If not set, seeds are stored as-is (backwards compatible).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const KEY_ENV = 'WALLET_ENCRYPTION_KEY';
const ALGO = 'aes-256-gcm';
const PREFIX = 'enc1:'; // version prefix to detect encrypted values

function getKey(): Buffer | null {
  const hex = process.env[KEY_ENV];
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypt a wallet seed phrase.
 * Returns "enc1:<iv_hex>:<auth_hex>:<ciphertext_hex>" or the original value if no key.
 */
export function encryptSeed(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getKey();
  if (!key) return plaintext;

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a wallet seed phrase.
 * Returns original plaintext or the value as-is if unencrypted/no key.
 */
export function decryptSeed(value: string): string {
  if (!value || !value.startsWith(PREFIX)) return value;
  const key = getKey();
  if (!key) return value;

  try {
    const parts = value.slice(PREFIX.length).split(':');
    if (parts.length !== 3) return value;
    const [ivHex, authHex, ctHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authHex, 'hex');
    const ct = Buffer.from(ctHex, 'hex');
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(ct) + decipher.final('utf8');
  } catch {
    return value;
  }
}

/**
 * Generate a new random encryption key (run once, then save as WALLET_ENCRYPTION_KEY).
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex');
}
