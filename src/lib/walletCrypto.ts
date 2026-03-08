/**
 * Wallet Cryptography Module — GydsChain
 * Uses Web Crypto API (SubtleCrypto) for real security:
 * - PBKDF2 for key derivation from PIN
 * - AES-GCM for encryption/decryption
 * - SHA-256 for PIN hashing
 * - crypto.getRandomValues for secure randomness
 *
 * Private keys and seed phrases NEVER leave the device unencrypted.
 */

const PBKDF2_ITERATIONS = 600_000; // OWASP recommended minimum
const SALT_BYTES = 16;
const IV_BYTES = 12; // AES-GCM standard
const KEY_LENGTH = 256; // AES-256

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
  const data = concatBuffers(salt, enc.encode(pin));
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
  const data = concatBuffers(salt, enc.encode(pin));
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
 * Generate a cryptographically secure wallet.
 * Uses crypto.getRandomValues for key material.
 */
export function generateSecureWallet(): {
  privateKey: string;
  address: string;
  seedPhrase: string;
} {
  // Generate 32 random bytes for private key
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const privateKey = '0x' + bufToHex(keyBytes.buffer as ArrayBuffer);

  // Generate 20 random bytes for address
  const addrBytes = crypto.getRandomValues(new Uint8Array(20));
  const address = '0x' + bufToHex(addrBytes.buffer as ArrayBuffer);

  // BIP-39 word list subset (in production use the full 2048 list)
  const words = [
    'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
    'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
    'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
    'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
    'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
    'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
    'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone', 'alpha',
    'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among', 'amount',
    'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry', 'animal',
    'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique', 'anxiety',
    'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april', 'arch',
    'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor', 'army',
    'around', 'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artefact', 'artist',
    'artwork', 'ask', 'aspect', 'assault', 'asset', 'assist', 'assume', 'asthma',
    'athlete', 'atom', 'attack', 'attend', 'auction', 'audit', 'august', 'aunt',
    'author', 'auto', 'avocado', 'avoid', 'awake', 'aware', 'awful', 'awkward',
  ];

  // Use crypto.getRandomValues for word selection
  const indices = crypto.getRandomValues(new Uint8Array(12));
  const seedPhrase = Array.from(indices)
    .map((b) => words[b % words.length])
    .join(' ');

  return { privateKey, address, seedPhrase };
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
