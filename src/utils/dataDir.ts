import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Get a writable data directory for the application.
 * Tries multiple locations in order of preference:
 * 1. Environment variable DATA_DIR (for Docker/containers)
 * 2. Project directory (./data)
 * 3. User home directory (~/.voice-agent/data)
 * 4. System temp directory (/tmp/voice-agent/data)
 */
export function getDataDir(): string {
  // Check for environment variable first (useful for Docker)
  const envDataDir = process.env.DATA_DIR;
  if (envDataDir) {
    try {
      if (!fs.existsSync(envDataDir)) {
        fs.mkdirSync(envDataDir, { recursive: true });
      }
      const testFile = path.join(envDataDir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return envDataDir;
    } catch (error) {
      console.warn(`Failed to use DATA_DIR environment variable (${envDataDir}):`, error);
      // Continue to fallback options
    }
  }

  const candidates = [
    path.join(process.cwd(), 'data'), // Project directory
    path.join(os.homedir(), '.voice-agent', 'data'), // User home directory
    path.join(os.tmpdir(), 'voice-agent', 'data'), // System temp directory
  ];

  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Test write access
      const testFile = path.join(dir, '.write-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return dir;
    } catch (error) {
      // Continue to next candidate
      continue;
    }
  }

  throw new Error('Unable to create or access data directory. Please check permissions.');
}

/**
 * Ensure a file exists in the data directory with proper error handling
 */
export function ensureDataFile(filePath: string, defaultContent: string): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, defaultContent);
    }
  } catch (error: any) {
    console.error('Error ensuring data file:', error.message);
    throw new Error(`Failed to create data directory or file: ${error.message}`);
  }
}
