import fs from 'fs';
import path from 'path';
import { encrypt, decrypt } from '../utils/crypto.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

interface TokenRecord {
  userId: string;
  refreshTokenEnc: string; // encrypted
}

interface FileShape {
  tokens: TokenRecord[];
}

const ensureFile = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(TOKENS_FILE)) fs.writeFileSync(TOKENS_FILE, JSON.stringify({ tokens: [] }, null, 2));
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
