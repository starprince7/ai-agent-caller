import fs from 'fs';
import path from 'path';
import { encrypt, decrypt } from '../utils/crypto.js';
import { getDataDir, ensureDataFile } from '../utils/dataDir.js';

const DATA_DIR = getDataDir();
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

// Log the data directory location for debugging
console.log(`Token store using data directory: ${DATA_DIR}`);

interface TokenRecord {
  userId: string;
  refreshTokenEnc: string; // encrypted
}

interface FileShape {
  tokens: TokenRecord[];
}

const ensureFile = () => {
  ensureDataFile(TOKENS_FILE, JSON.stringify({ tokens: [] }, null, 2));
};

const readAll = (): FileShape => {
  ensureFile();
  const raw = fs.readFileSync(TOKENS_FILE, 'utf8');
  try {
    return JSON.parse(raw) as FileShape;
  } catch {
    return { tokens: [] };
  }
};

const writeAll = (data: FileShape) => {
  ensureFile();
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(data, null, 2));
};

export async function saveRefreshToken(userId: string, refreshToken: string): Promise<void> {
  const data = readAll();
  const refreshTokenEnc = encrypt(refreshToken);
  const existing = data.tokens.find((t) => t.userId === userId);
  if (existing) existing.refreshTokenEnc = refreshTokenEnc;
  else data.tokens.push({ userId, refreshTokenEnc });
  writeAll(data);
}

export async function getRefreshToken(userId: string): Promise<string | null> {
  const data = readAll();
  const rec = data.tokens.find((t) => t.userId === userId);
  if (!rec) return null;
  try {
    return decrypt(rec.refreshTokenEnc);
  } catch {
    return null;
  }
}
