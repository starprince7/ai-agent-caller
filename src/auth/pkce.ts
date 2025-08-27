import crypto from 'crypto';

const base64url = (buf: Buffer) =>
  buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

export function generateCodeVerifier(length = 64): string {
  // 43..128 chars
  const bytes = crypto.randomBytes(length);
  return base64url(bytes);
}

export function challengeFromVerifier(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64url(hash);
}
