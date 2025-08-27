type Retryable<T> = () => Promise<T>;

export interface BackoffOptions {
  retries?: number; // max attempts (including first)
  baseMs?: number; // initial backoff
  maxMs?: number;  // cap
  jitter?: boolean;
}

const defaultOpts: Required<BackoffOptions> = {
  retries: 5,
  baseMs: 300,
  maxMs: 8000,
  jitter: true,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withBackoff<T>(fn: Retryable<T>, opts: BackoffOptions = {}): Promise<T> {
  const { retries, baseMs, maxMs, jitter } = { ...defaultOpts, ...opts };
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const status = err?.code || err?.status || err?.response?.status;
      // Retry only on 429 and 5xx
      const retryable = status === 429 || (typeof status === 'number' && status >= 500);
      attempt++;
      if (!retryable || attempt >= retries) break;
      const backoff = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const wait = jitter ? Math.floor(Math.random() * backoff) : backoff;
      await sleep(wait);
    }
  }
  throw lastErr;
}
