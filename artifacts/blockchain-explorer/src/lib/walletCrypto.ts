/**
 * Wallet Cryptography Module — GydsChain
 * Uses Web Crypto API (SubtleCrypto) for real security:
 * - PBKDF2 for key derivation from PIN
 * - AES-GCM for encryption/decryption
 * - SHA-256 for PIN hashing
 * - secp256k1 via viem + @scure/bip32 for real key derivation
 * - BIP-39 via @scure/bip39 for mnemonic generation/validation
 * - PIN rotation (re-encrypt with new PIN)
 *
 * Private keys and seed phrases NEVER leave the device unencrypted.
 *
 * ⚠️  DEV-ONLY NOTICE — localStorage persistence
 * The encrypted wallet data, PIN hash, attempt counter, and lockout
 * timestamp are all stored in browser localStorage (keys: gyds_pin_lock,
 * gyds_pin_attempts, gyds_pin_locked_until).
 * localStorage is scoped to the browser origin and is NOT synced across
 * devices. For a production deployment, consider moving the encrypted
 * blob to the server-side wallets table (already in the DB schema) so
 * users can recover their wallet after clearing browser storage.
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { HDKey } from '@scure/bip32';

const PBKDF2_ITERATIONS = 600_000; // OWASP recommended minimum
const SALT_BYTES = 16;
const IV_BYTES = 12; // AES-GCM standard
const KEY_LENGTH = 256; // AES-256
const PIN_LOCK_KEY = 'gyds_pin_lock';
const PIN_LOCK_ATTEMPTS_KEY = 'gyds_pin_attempts';
const PIN_LOCK_UNTIL_KEY = 'gyds_pin_locked_until';
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// ─── Helpers ──────────────────────────────────────────

function bufToHex(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function concatBuffers(...bufs: Uint8Array[]): Uint8Array {
  const total = bufs.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of bufs) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

// ─── Key Derivation ───────────────────────────────────

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin) as BufferSource,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─── Public API ───────────────────────────────────────

/**
 * Hash a PIN with SHA-256 + random salt.
 * Returns "salt_hex:hash_hex" so we can verify later.
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const enc = new TextEncoder();
  const data = concatBuffers(salt, enc.encode(pin)) as BufferSource;
  const hash = await crypto.subtle.digest('SHA-256', data);
  return `${bufToHex(salt)}:${bufToHex(hash)}`;
}

/**
 * Verify a PIN against a stored hash.
 */
export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  // Support legacy weak hashes (no colon separator)
  if (!stored.includes(':')) {
    return legacyHashPin(pin) === stored;
  }
  const [saltHex, hashHex] = stored.split(':');
  const salt = hexToBuf(saltHex);
  const enc = new TextEncoder();
  const data = concatBuffers(salt, enc.encode(pin)) as BufferSource;
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bufToHex(hash) === hashHex;
}

/**
 * Encrypt a plaintext string (seed phrase / private key) with a PIN.
 * Returns a hex string: salt(16) + iv(12) + ciphertext.
 */
export async function encryptWithPin(plaintext: string, pin: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(pin, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  const packed = concatBuffers(salt, iv, new Uint8Array(ciphertext));
  return bufToHex(packed.buffer as ArrayBuffer);
}

/**
 * Decrypt a hex-encoded ciphertext with a PIN.
 * Returns plaintext on success, null on wrong PIN or corruption.
 */
export async function decryptWithPin(ciphertextHex: string, pin: string): Promise<string | null> {
  try {
    // Try legacy format first (base64 XOR)
    if (!ciphertextHex.match(/^[0-9a-f]+$/i) || ciphertextHex.length < (SALT_BYTES + IV_BYTES) * 2 + 2) {
      return legacyDecryptSeed(ciphertextHex, pin);
    }

    const raw = hexToBuf(ciphertextHex);
    const salt = raw.slice(0, SALT_BYTES);
    const iv = raw.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
    const data = raw.slice(SALT_BYTES + IV_BYTES);
    const key = await deriveKey(pin, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch {
    // Try legacy fallback
    try {
      return legacyDecryptSeed(ciphertextHex, pin);
    } catch {
      return null;
    }
  }
}

/**
 * Rotate a wallet's PIN: decrypt with old PIN, re-encrypt with new PIN.
 * Returns { newEncryptedSeed, newPinHash } on success, null on failure.
 */
export async function rotatePin(
  encryptedSeed: string,
  oldPin: string,
  newPin: string
): Promise<{ newEncryptedSeed: string; newPinHash: string } | null> {
  const seed = await decryptWithPin(encryptedSeed, oldPin);
  if (!seed) return null;
  const newEncryptedSeed = await encryptWithPin(seed, newPin);
  const newPinHash = await hashPin(newPin);
  return { newEncryptedSeed, newPinHash };
}

/**
 * Generate a cryptographically secure EVM wallet.
 * - BIP-39 12-word mnemonic via @scure/bip39 (full 2048-word English list)
 * - BIP-44 HD derivation at m/44'/60'/0'/0/0 via @scure/bip32
 * - secp256k1 address derivation via viem
 *
 * The returned address is mathematically derived from the private key —
 * compatible with MetaMask, Trust Wallet, and any EIP-55 wallet.
 */
export function generateSecureWallet(): {
  privateKey: `0x${string}`;
  address: `0x${string}`;
  seedPhrase: string;
} {
  const seedPhrase = generateMnemonic(wordlist, 128); // 128 bits of entropy → 12 words
  const seed = mnemonicToSeedSync(seedPhrase);
  const hdKey = HDKey.fromMasterSeed(seed);
  const child = hdKey.derive("m/44'/60'/0'/0/0");
  if (!child.privateKey) throw new Error('Failed to derive private key');
  const privateKey = `0x${bufToHex(child.privateKey)}` as `0x${string}`;
  const { address } = privateKeyToAccount(privateKey);
  return { privateKey, address, seedPhrase };
}

/**
 * Derive an EVM wallet from a BIP-39 mnemonic phrase.
 * Returns null if the phrase is invalid.
 */
export function deriveWalletFromMnemonic(mnemonic: string): {
  privateKey: `0x${string}`;
  address: `0x${string}`;
} | null {
  const phrase = mnemonic.trim().replace(/\s+/g, ' ');
  if (!validateMnemonic(phrase, wordlist)) return null;
  const seed = mnemonicToSeedSync(phrase);
  const hdKey = HDKey.fromMasterSeed(seed);
  const child = hdKey.derive("m/44'/60'/0'/0/0");
  if (!child.privateKey) return null;
  const privateKey = `0x${bufToHex(child.privateKey)}` as `0x${string}`;
  const { address } = privateKeyToAccount(privateKey);
  return { privateKey, address };
}

/**
 * Derive an EVM address from a raw private key (0x-prefixed hex, 64 chars).
 * Returns null if the key is malformed.
 */
export function deriveWalletFromPrivateKey(hex: string): {
  privateKey: `0x${string}`;
  address: `0x${string}`;
} | null {
  const key = (hex.trim().startsWith('0x') ? hex.trim() : `0x${hex.trim()}`) as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  const { address } = privateKeyToAccount(key);
  return { privateKey: key, address };
}

/**
 * Validate whether a string is a valid BIP-39 mnemonic.
 */
export function validateSeedPhrase(phrase: string): boolean {
  return validateMnemonic(phrase.trim().replace(/\s+/g, ' '), wordlist);
}

// generatePrivateKey re-exported so callers don't need to import viem directly
export { generatePrivateKey };

// ─── PIN Lock (app-level security) ────────────────────

/**
 * Enable PIN lock for the app. Stores the hashed PIN in localStorage.
 */
export async function enablePinLock(pin: string): Promise<void> {
  const pinHash = await hashPin(pin);
  localStorage.setItem(PIN_LOCK_KEY, pinHash);
  localStorage.removeItem(PIN_LOCK_ATTEMPTS_KEY);
  localStorage.removeItem(PIN_LOCK_UNTIL_KEY);
}

/**
 * Disable PIN lock.
 */
export function disablePinLock(): void {
  localStorage.removeItem(PIN_LOCK_KEY);
  localStorage.removeItem(PIN_LOCK_ATTEMPTS_KEY);
  localStorage.removeItem(PIN_LOCK_UNTIL_KEY);
}

/**
 * Check if PIN lock is enabled.
 */
export function isPinLockEnabled(): boolean {
  return !!localStorage.getItem(PIN_LOCK_KEY);
}

/**
 * Check if currently locked out due to too many attempts.
 */
export function getPinLockStatus(): { locked: boolean; remainingMs: number; attempts: number } {
  const lockedUntil = localStorage.getItem(PIN_LOCK_UNTIL_KEY);
  const attempts = parseInt(localStorage.getItem(PIN_LOCK_ATTEMPTS_KEY) || '0', 10);

  if (lockedUntil) {
    const remaining = parseInt(lockedUntil, 10) - Date.now();
    if (remaining > 0) {
      return { locked: true, remainingMs: remaining, attempts };
    }
    // Lockout expired
    localStorage.removeItem(PIN_LOCK_UNTIL_KEY);
    localStorage.removeItem(PIN_LOCK_ATTEMPTS_KEY);
  }

  return { locked: false, remainingMs: 0, attempts };
}

/**
 * Verify the app PIN lock. Returns true on success.
 * Tracks failed attempts and locks out after MAX_PIN_ATTEMPTS.
 */
export async function verifyPinLock(pin: string): Promise<boolean> {
  const status = getPinLockStatus();
  if (status.locked) return false;

  const storedHash = localStorage.getItem(PIN_LOCK_KEY);
  if (!storedHash) return true; // No lock set

  const valid = await verifyPin(pin, storedHash);
  if (valid) {
    localStorage.removeItem(PIN_LOCK_ATTEMPTS_KEY);
    localStorage.removeItem(PIN_LOCK_UNTIL_KEY);
    return true;
  }

  // Track failed attempt
  const newAttempts = status.attempts + 1;
  localStorage.setItem(PIN_LOCK_ATTEMPTS_KEY, newAttempts.toString());

  if (newAttempts >= MAX_PIN_ATTEMPTS) {
    localStorage.setItem(PIN_LOCK_UNTIL_KEY, (Date.now() + LOCKOUT_DURATION_MS).toString());
  }

  return false;
}

// ─── Legacy compatibility (for existing wallets) ──────

function legacyHashPin(pin: string): string {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    hash = ((hash << 5) - hash) + pin.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(16);
}

function legacyDecryptSeed(encrypted: string, pin: string): string | null {
  try {
    const decoded = atob(encrypted);
    return decoded
      .split('')
      .map((c, i) =>
        String.fromCharCode(c.charCodeAt(0) ^ pin.charCodeAt(i % pin.length))
      )
      .join('');
  } catch {
    return null;
  }
}
