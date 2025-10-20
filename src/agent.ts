// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import {
  type JobContext,
  type JobProcess,
  WorkerOptions,
  cli,
  defineAgent,
  llm,
  voice,
} from '@livekit/agents';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import * as livekit from '@livekit/agents-plugin-livekit';
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerformanceTracker, ResourceManager, SessionManager } from './core/managers/index.js';
import { hiltonDentalPrompt } from './system-prompts/hilton-dental.js';
import { dermaVisualsSpaPrompt } from './system-prompts/spa.js';
import { preciousPrompt } from './system-prompts/precious.js';
import {
  cancel_event,
  create_event,
  find_free_slots,
  get_calendars,
  get_primary_calendar,
  reschedule_event,
  set_working_hours,
} from './tools/calendarAgentTools.js';
import { accept_dental_booking, accept_spa_booking } from './tools/bookingTools.js';
import { send_email } from './tools/emailTool.js';
import { SESSION_CONFIG } from './config/session.js';
import { logMemoryUsage } from './utils/memory-info.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });


// Memory and performance monitoring utilities

// Optimized tool configurations - pre-created to avoid recreation per session
const createToolConfigurations = () => ({
  get_calendars: llm.tool({
    description: get_calendars.description,
    parameters: get_calendars.parameters,
    execute: get_calendars.execute,
  }),
  get_primary_calendar: llm.tool({
    description: get_primary_calendar.description,
    parameters: get_primary_calendar.parameters,
    execute: get_primary_calendar.execute,
  }),
  create_event: llm.tool({
    description: create_event.description,
    parameters: create_event.parameters,
    execute: create_event.execute,
  }),
  cancel_event: llm.tool({
    description: cancel_event.description,
    parameters: cancel_event.parameters,
    execute: cancel_event.execute,
  }),
  reschedule_event: llm.tool({
    description: reschedule_event.description,
    parameters: reschedule_event.parameters,
    execute: reschedule_event.execute,
  }),
  find_free_slots: llm.tool({
    description: find_free_slots.description,
    parameters: find_free_slots.parameters,
    execute: find_free_slots.execute,
  }),
  accept_dental_booking: llm.tool({
    description: accept_dental_booking.description,
    parameters: accept_dental_booking.parameters,
    execute: accept_dental_booking.execute,
  }),
  accept_spa_booking: llm.tool({
    description: accept_spa_booking.description,
    parameters: accept_spa_booking.parameters,
    execute: accept_spa_booking.execute,
  }),
  send_email: llm.tool({
    description: send_email.description,
    parameters: send_email.parameters,
    execute: send_email.execute,
  }),
});

// Singleton tool configurations
const TOOL_CONFIGS = createToolConfigurations();

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
    
    // Create all dependencies for SessionManager
    const resourceManager = new ResourceManager();

    // Create TTS instance
    const tts = new elevenlabs.TTS({
      voice: { id: '2vbhUP8zyKg4dEZaTWGn', name: '', category: '' },
    });
    // const tts = new openai.TTS({voice: 'nova'})

    // Create STT instance
    const stt = new deepgram.STT({
      model: 'nova-3',
      language: 'en-US',
      smartFormat: true,
      punctuate: true,
    });

    // Create LLM instance
    const llm = new openai.LLM({
      model: 'gpt-4o-mini',
      temperature: 0.7,
    });

    // Pass all dependencies to SessionManager
    const sessionManager = new SessionManager({
      resourceManager,
      tts, // TTS implementation
      stt, // STT implementation
      llm, // LLM implementation
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
        instructions: preciousPrompt(today),
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
            console.log(`Session start attempt ${retryCount} failed, retrying...`);
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

      const connectionMonitorId = setInterval(monitorConnection, 10000); // Every 10 seconds

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
