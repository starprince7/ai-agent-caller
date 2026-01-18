// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  voice,
} from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Core modules
import {
  PerformanceTracker,
  ResourceManager,
  SessionManager,
  AgentFactory,
} from './core/index.js';

// System Prompts
import { zoomDentalPrompt } from './system-prompts/zoom-dental.js';

// Tools and Configuration
import { TOOL_CONFIGS } from './tools/index.js';
import { SESSION_CONFIG, GREETING_CONFIG } from './config/session.js';
import { logMemoryUsage } from './utils/memory-info.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    const perf = new PerformanceTracker();

    try {
      logMemoryUsage('before VAD preload');

      // Pre-load VAD model with enhanced error handling
      proc.userData.vad = await silero.VAD.load();
      perf.mark('VAD model loaded');
      console.log('VAD model pre-loaded successfully');

      logMemoryUsage('after VAD preload');

      // Register VAD cleanup
      proc.userData.cleanup = () => {
        try {
          if (proc.userData.vad) {
            proc.userData.vad = null;
            console.log('VAD model reference cleared');
          }
        } catch (error) {
          console.warn('Error cleaning VAD model:', error);
        }
      };

      perf.mark('Prewarm completed');
    } catch (error) {
      console.error('Failed to pre-load VAD model:', error);
      throw error;
    }
  },

  entry: async (ctx: JobContext) => {
    const perf = new PerformanceTracker();

    // Create all dependencies using AgentFactory
    const resourceManager = new ResourceManager();
    const agentFactory = new AgentFactory();
    const { stt, llm } = agentFactory.createDependencies();
    
    // Create TTSService with proper configuration
    const ttsService = agentFactory.createTTSService();

    // Pass all dependencies to SessionManager with greeting configuration
    const sessionManager = new SessionManager({
      resourceManager,
      ttsService,
      stt,
      llm,
      greetingConfig: {
        timeoutMs: GREETING_CONFIG.TIMEOUT_MS,
        maxRetries: GREETING_CONFIG.MAX_RETRIES,
        retryDelayMs: GREETING_CONFIG.RETRY_DELAY_MS,
        fallbackEnabled: GREETING_CONFIG.FALLBACK_ENABLED,
      },
    });
    let sessionTimeoutId: NodeJS.Timeout | null = null;
    let memoryLogIntervalId: NodeJS.Timeout | null = null;

    // Enhanced global cleanup with resource manager
    const setupGlobalCleanupHandlers = () => {
      const gracefulShutdown = async (signal: string) => {
        console.log(`Received ${signal}, initiating graceful shutdown...`);
        await sessionManager.cleanup(`signal: ${signal}`);
        if (sessionTimeoutId) clearTimeout(sessionTimeoutId);
        if (memoryLogIntervalId) clearInterval(memoryLogIntervalId);
        setTimeout(() => process.exit(0), 1000);
      };

      const handleError = async (errorType: string, error: any) => {
        console.error(`${errorType}:`, error);
        await sessionManager.cleanup(errorType);
      };

      process.once('SIGINT', () => gracefulShutdown('SIGINT'));
      process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
      process.once('uncaughtException', (error) => handleError('uncaughtException', error));
      process.once('unhandledRejection', (reason) => handleError('unhandledRejection', reason));
    };

    setupGlobalCleanupHandlers();

    try {
      logMemoryUsage('session start');
      perf.mark('Session entry started');

      // Get pre-loaded VAD model
      const vad = ctx.proc.userData.vad! as silero.VAD;

      // Generate today's date for context
      const today = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      console.log('Session date:', today);

      // Create agent with optimized configuration
      const agent = new voice.Agent({
        vad: vad,
        instructions: zoomDentalPrompt(today),
        allowInterruptions: true,
        tools: TOOL_CONFIGS, // Use pre-configured tools
      });

      perf.mark('Agent created');

      // Create session with retry logic for stream conflicts
      let retryCount = 0;
      const maxRetries = 2;

      while (retryCount <= maxRetries) {
        try {
          await sessionManager.createSession(vad, agent);
          perf.mark('Session created');
          break;
        } catch (error) {
          retryCount++;
          if (retryCount > maxRetries) {
            throw error;
          }
          console.log(`Session creation attempt ${retryCount} failed, retrying...`);
          await new Promise((resolve) =>
            setTimeout(resolve, SESSION_CONFIG.SESSION_RETRY_DELAY_MS),
          );
        }
      }

      // Connect to room with enhanced error handling
      try {
        await ctx.connect();
        console.log(`Agent connected to room: ${ctx.room.name}`);
        perf.mark('Room connected');
      } catch (connectError) {
        console.error('Failed to connect to room:', connectError);
        throw connectError;
      }

      // Brief delay to ensure room is fully initialized
      await new Promise((resolve) => setTimeout(resolve, SESSION_CONFIG.ROOM_INIT_DELAY_MS));

      // Start session with retry logic
      retryCount = 0;
      while (retryCount <= maxRetries) {
        try {
          await sessionManager.startSession(ctx, agent);
          perf.mark('Session started');
          break;
        } catch (error: any) {
          if (error.message === 'SESSION_RETRY_NEEDED' && retryCount < maxRetries) {
            retryCount++;
            console.log(`Session start attempt ${retryCount} failed due to stream conflict, recreating session and retrying...`);
            // Recreate session to avoid partially-initialized session with duplicate stream wiring
            await sessionManager.createSession(vad, agent);
            continue;
          }
          throw error;
        }
      }

      // Set up session monitoring
      sessionTimeoutId = setTimeout(() => {
        console.log('Session timeout reached');
        sessionManager.cleanup('session timeout');
      }, SESSION_CONFIG.TIMEOUT_MS);

      memoryLogIntervalId = setInterval(() => {
        if (sessionManager.isActive()) {
          logMemoryUsage('periodic check');
        }
      }, SESSION_CONFIG.MEMORY_LOG_INTERVAL_MS);

      // Wait for participant with timeout
      console.log('Waiting for participant to join...');

      try {
        const participantPromise = ctx.waitForParticipant();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Participant join timeout')),
            SESSION_CONFIG.PARTICIPANT_JOIN_TIMEOUT_MS,
          ),
        );

        const participant = (await Promise.race([participantPromise, timeoutPromise])) as any;
        console.log(`Participant joined: ${participant.identity}`);
        perf.mark('Participant joined');

        // Generate and deliver greeting
        await sessionManager.generateGreeting();
        perf.mark('Greeting completed');
      } catch (participantError) {
        console.error('Error with participant handling:', participantError);
        // Continue without greeting if participant operations fail
      }

      logMemoryUsage('after initialization');
      console.log('Performance metrics:', perf.getMetrics());

      // Set up connection monitoring (simplified)
      const monitorConnection = () => {
        try {
          if (ctx.room.remoteParticipants.size === 0) {
            console.log('No remote participants detected');
          }
        } catch (error) {
          console.warn('Error monitoring connection:', error);
        }
      };

      const connectionMonitorId = setInterval(monitorConnection, SESSION_CONFIG.CONNECTION_MONITOR_INTERVAL_MS);

      // Register connection monitor cleanup
      resourceManager.register(() => {
        clearInterval(connectionMonitorId);
      });
    } catch (error) {
      console.error('Error in agent entry:', error);

      // Comprehensive cleanup on error
      await sessionManager.cleanup('entry error');
      if (sessionTimeoutId) clearTimeout(sessionTimeoutId);
      if (memoryLogIntervalId) clearInterval(memoryLogIntervalId);

      // Attempt graceful shutdown
      try {
        await ctx.shutdown();
      } catch (shutdownError) {
        console.error('Error during shutdown:', shutdownError);
      }

      throw error;
    }
  },
});

// Enhanced worker cleanup
const workerCleanup = () => {
  console.log('Worker cleanup initiated');
  logMemoryUsage('worker cleanup');
};

// Set up worker-level cleanup handlers
process.on('exit', workerCleanup);
process.on('SIGINT', workerCleanup);
process.on('SIGTERM', workerCleanup);

// Start worker with enhanced configuration
cli.runApp(
  new WorkerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: 'jane',
  }),
);
