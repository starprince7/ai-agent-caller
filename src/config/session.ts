// Enhanced configuration constants - based on latest agents framework
export const SESSION_CONFIG = {
  TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  MEMORY_LOG_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  PARTICIPANT_JOIN_TIMEOUT_MS: 30000, // 30 seconds
  GREETING_TIMEOUT_MS: 10000, // 10 seconds
  SESSION_RETRY_DELAY_MS: 500, // 500ms delay between retries
  ROOM_INIT_DELAY_MS: 100, // 100ms delay after room connection
} as const;
