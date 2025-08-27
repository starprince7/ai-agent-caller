import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const PREFS_FILE = path.join(DATA_DIR, 'preferences.json');

export type WorkingHours = {
  // days as array of 0..6 (Sun..Sat) or strings e.g. 'Mon'
  days: Array<number | string>;
  // ISO time strings "HH:mm" in IANA time zone context
  start: string;
  end: string;
  timeZone?: string; // optional IANA tz for interpretation
};

interface PrefRecord {
  userId: string;
  workingHours?: WorkingHours;
}

interface FileShape {
  prefs: PrefRecord[];
}

const ensureFile = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PREFS_FILE)) fs.writeFileSync(PREFS_FILE, JSON.stringify({ prefs: [] }, null, 2));
};

const readAll = (): FileShape => {
  ensureFile();
  const raw = fs.readFileSync(PREFS_FILE, 'utf8');
  try { return JSON.parse(raw) as FileShape; } catch { return { prefs: [] }; }
};

const writeAll = (data: FileShape) => {
  ensureFile();
  fs.writeFileSync(PREFS_FILE, JSON.stringify(data, null, 2));
};

export async function setWorkingHoursPref(userId: string, wh: WorkingHours): Promise<void> {
  const data = readAll();
  const existing = data.prefs.find((p) => p.userId === userId);
  if (existing) existing.workingHours = wh;
  else data.prefs.push({ userId, workingHours: wh });
  writeAll(data);
}

export async function getWorkingHoursPref(userId: string): Promise<WorkingHours | null> {
  const data = readAll();
  return data.prefs.find((p) => p.userId === userId)?.workingHours ?? null;
}
