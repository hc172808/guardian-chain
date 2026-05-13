/**
 * Biometric Authentication Module — GydsChain
 * Uses Web Authentication API (WebAuthn) for fingerprint/face unlock.
 * Stores credential IDs in localStorage; challenge is generated locally.
 */

const BIOMETRIC_CRED_KEY = 'gyds_biometric_credential';
const BIOMETRIC_ENABLED_KEY = 'gyds_biometric_enabled';

/**
 * Check if WebAuthn is supported and a platform authenticator is available.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/**
 * Check if biometric unlock is enabled (credential registered).
 */
export function isBiometricEnabled(): boolean {
  return localStorage.getItem(BIOMETRIC_ENABLED_KEY) === 'true' &&
    !!localStorage.getItem(BIOMETRIC_CRED_KEY);
}

/**
 * Register a biometric credential (fingerprint/face).
 * Returns true on success.
 */
export async function registerBiometric(userId: string): Promise<boolean> {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userIdBytes = new TextEncoder().encode(userId);

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'ChainCore Wallet', id: window.location.hostname },
        user: {
          id: userIdBytes,
          name: userId,
          displayName: 'ChainCore User',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },   // ES256
          { alg: -257, type: 'public-key' },  // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    }) as PublicKeyCredential | null;

    if (!credential) return false;

    // Store credential ID for later authentication
    const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
    localStorage.setItem(BIOMETRIC_CRED_KEY, credId);
    localStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
    return true;
  } catch {
    return false;
  }
}

/**
 * Authenticate using biometric (fingerprint/face).
 * Returns true if verification succeeds.
 */
export async function authenticateBiometric(): Promise<boolean> {
  try {
    const credIdB64 = localStorage.getItem(BIOMETRIC_CRED_KEY);
    if (!credIdB64) return false;

    const credIdBytes = Uint8Array.from(atob(credIdB64), c => c.charCodeAt(0));
    const challenge = crypto.getRandomValues(new Uint8Array(32));

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{
          id: credIdBytes,
          type: 'public-key',
          transports: ['internal'],
        }],
        userVerification: 'required',
        timeout: 60000,
      },
    }) as PublicKeyCredential | null;

    return !!assertion;
  } catch {
    return false;
  }
}

/**
 * Remove biometric registration.
 */
export function disableBiometric(): void {
  localStorage.removeItem(BIOMETRIC_CRED_KEY);
  localStorage.removeItem(BIOMETRIC_ENABLED_KEY);
}
