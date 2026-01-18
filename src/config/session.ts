// Enhanced configuration constants - based on latest agents framework
export const SESSION_CONFIG = {
  TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  MEMORY_LOG_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  PARTICIPANT_JOIN_TIMEOUT_MS: 30000, // 30 seconds
  SESSION_RETRY_DELAY_MS: 500, // 500ms delay between retries
  ROOM_INIT_DELAY_MS: 100, // 100ms delay after room connection
  MAX_SESSION_RETRIES: 2,
  CONNECTION_MONITOR_INTERVAL_MS: 10000, // 10 seconds
} as const;

// Greeting configuration - with increased timeouts and retry logic
export const GREETING_CONFIG = {
  TIMEOUT_MS: 15000, // 15 seconds - increased from 10s for better reliability
  MAX_RETRIES: 2,
  RETRY_DELAY_MS: 1000,
  FALLBACK_ENABLED: true,
} as const;

export type SessionConfigType = typeof SESSION_CONFIG;
export type GreetingConfigType = typeof GREETING_CONFIG;
