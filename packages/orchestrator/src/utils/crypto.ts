import crypto from 'node:crypto';
import os from 'node:os';

const ENCRYPTION_ALGO = 'aes-256-gcm';
const KEY_SALT = 'local-web-qa-studio-aes256-v1';

/**
 * Generates a deterministic SHA-256 machine fingerprint bound to host identity
 * (hostname, platform, architecture, CPU model, and primary non-internal MAC).
 */
export function getMachineFingerprint(): string {
  const networkIfaces = os.networkInterfaces();
  const macs: string[] = [];

  for (const entries of Object.values(networkIfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (!entry.internal && entry.mac && entry.mac !== '00:00:00:00:00:00') {
        macs.push(entry.mac.toLowerCase());
      }
    }
  }

  macs.sort();

  const rawIdentity = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model ?? 'unknown-cpu',
    macs[0] ?? os.userInfo().username,
  ].join('|');

  return crypto.createHash('sha256').update(rawIdentity).digest('hex');
}

function deriveAesKey(): Buffer {
  const fingerprint = getMachineFingerprint();
  return crypto.scryptSync(fingerprint, KEY_SALT, 32);
}

export interface EncryptedPayload {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export function encryptJson<T>(data: T): EncryptedPayload {
  const key = deriveAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, key, iv);
  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

export function decryptJson<T>(payload: EncryptedPayload): T {
  const key = deriveAesKey();
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGO,
    key,
    Buffer.from(payload.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as T;
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function generateRandomState(): string {
  return crypto.randomBytes(24).toString('base64url');
}
