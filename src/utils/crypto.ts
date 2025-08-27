import crypto from 'crypto';

// AES-256-GCM encryption/decryption helper
// ENCRYPTION_KEY should be a 32-byte key provided as base64 in env
const getKey = (): Buffer => {
  const b64 = process.env.ENCRYPTION_KEY;
  if (!b64) throw new Error('ENCRYPTION_KEY is required');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
  return key;
};

export const encrypt = (plaintext: string): string => {
  const key = getKey();
  const iv = crypto.randomBytes(12); // GCM 96-bit IV
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
};

export const decrypt = (payloadB64: string): string => {
  const key = getKey();
  const payload = Buffer.from(payloadB64, 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const data = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  return plaintext;
};
