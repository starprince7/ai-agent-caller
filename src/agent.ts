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
  llm 
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
import {
  get_calendars,
  get_primary_calendar,
  set_working_hours,
  create_event,
  cancel_event,
  reschedule_event,
  find_free_slots,
} from './tools/calendarAgentTools.js';
import { accept_dental_booking } from './tools/dentalTool.js';
import { hiltonDentalPrompt } from './system-prompts/hilton-dental.js';
import { dermaVisualsSpaPrompt } from './system-prompts/spa.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

// Enhanced configuration constants - based on latest agents framework
const SESSION_CONFIG = {
  TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  MEMORY_LOG_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  PARTICIPANT_JOIN_TIMEOUT_MS: 30000, // 30 seconds
  GREETING_TIMEOUT_MS: 10000, // 10 seconds
  SESSION_RETRY_DELAY_MS: 500, // 500ms delay between retries
  ROOM_INIT_DELAY_MS: 100, // 100ms delay after room connection
} as const;

// Memory and performance monitoring utilities
const logMemoryUsage = (context: string = '') => {
  const usage = process.memoryUsage();
  const formatMB = (bytes: number) => Math.round(bytes / 1024 / 1024) + 'MB';
  
  console.log(`Memory usage ${context}:`, {
    rss: formatMB(usage.rss),
    heapUsed: formatMB(usage.heapUsed),
    heapTotal: formatMB(usage.heapTotal),
    external: formatMB(usage.external),
    timestamp: new Date().toISOString()
  });
};

// Performance metrics tracking
class PerformanceTracker {
  private startTime: number;
  private milestones: Map<string, number> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  mark(milestone: string) {
    this.milestones.set(milestone, Date.now() - this.startTime);
    console.log(`Performance: ${milestone} took ${this.milestones.get(milestone)}ms`);
  }

  getMetrics() {
    return Object.fromEntries(this.milestones);
  }
}

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
  })
});

// Singleton tool configurations
const TOOL_CONFIGS = createToolConfigurations();

// Enhanced resource cleanup manager
class ResourceManager {
  private resources: Array<() => Promise<void> | void> = [];
  private isCleaningUp = false;

  register(cleanupFn: () => Promise<void> | void) {
    this.resources.push(cleanupFn);
  }

  async cleanup(reason: string = 'unknown') {
    if (this.isCleaningUp) {
      console.log('Cleanup already in progress, skipping...');
      return;
    }

    this.isCleaningUp = true;
    console.log(`Starting resource cleanup: ${reason}`);
    
    const cleanupPromises = this.resources.map(async (cleanupFn, index) => {
      try {
        await cleanupFn();
      } catch (error) {
        console.warn(`Cleanup function ${index} failed:`, error);
      }
    });

    await Promise.allSettled(cleanupPromises);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      logMemoryUsage('after GC');
    }

    console.log('Resource cleanup completed');
    this.isCleaningUp = false;
  }

  isActive() {
    return !this.isCleaningUp;
  }
}

// Enhanced session manager with improved error handling
class SessionManager {
  private session: voice.AgentSession | null = null;
  private tts: any = null;
  private isSessionStarted = false;
  private resourceManager = new ResourceManager();

  async createSession(vad: silero.VAD, agent: voice.Agent): Promise<voice.AgentSession> {
    // Create TTS with improved error handling
    this.tts = new elevenlabs.TTS({
      voice: { id: "2vbhUP8zyKg4dEZaTWGn", name: "", category: "" }
    });

    // Register TTS cleanup
    this.resourceManager.register(async () => {
      if (this.tts) {
        try {
          if (typeof this.tts.removeAllListeners === 'function') {
            this.tts.removeAllListeners();
          }
          console.log('TTS cleaned up');
        } catch (error) {
          console.warn('Error cleaning up TTS:', error);
        }
        this.tts = null;
      }
    });

    // Create session with enhanced configuration
    this.session = new voice.AgentSession({
      vad,
      stt: new deepgram.STT({
        // Enhanced STT configuration based on latest improvements
        model: 'nova-3',
        language: 'en-US',
        smartFormat: true,
        punctuate: true,
      }),
      tts: this.tts,
      llm: new openai.LLM({ 
        model: 'gpt-4o-mini', // Updated to latest stable model
        temperature: 0.7,
      }),
    });

    // Register session cleanup
    this.resourceManager.register(async () => {
      if (this.session) {
        try {
          this.session.removeAllListeners();
          console.log('Session listeners cleaned up');
        } catch (error) {
          console.warn('Error cleaning up session:', error);
        }
        this.session = null;
      }
    });

    // Set up enhanced error handling
    this.session.on(voice.AgentSessionEventTypes.Close, () => {
      console.log('Session closed event received');
      this.resourceManager.cleanup('session close');
    });

    this.session.on(voice.AgentSessionEventTypes.Error, (error: any) => {
      console.error('Session error:', error);
      this.resourceManager.cleanup('session error');
    });

    return this.session;
  }

  async startSession(ctx: JobContext, agent: voice.Agent): Promise<void> {
    if (this.isSessionStarted || !this.session) {
      console.log('Session already started or not initialized');
      return;
    }

    try {
      await this.session.start({
        room: ctx.room,
        agent,
        inputOptions: {
          // noiseCancellation: BackgroundVoiceCancellation(),
        },
      });
      
      this.isSessionStarted = true;
      console.log('Agent session started successfully');
    } catch (error: any) {
      // Enhanced error handling for specific stream conflicts
      if (error.message?.includes('Stream source already set')) {
        console.log('Stream source conflict detected, implementing recovery strategy...');
        
        // Wait for conflict to resolve
        await new Promise(resolve => setTimeout(resolve, SESSION_CONFIG.SESSION_RETRY_DELAY_MS));
        
        // Reset session state and retry
        this.isSessionStarted = false;
        throw new Error('SESSION_RETRY_NEEDED');
      }
      
      throw error;
    }
  }

  async generateGreeting(): Promise<void> {
    if (!this.session || !this.isSessionStarted) {
      console.error('Session not available for greeting');
      return;
    }

    try {
      const handle = this.session.generateReply({
        instructions: 'Introduce yourself. Greet the user warmly, and offer your assistance with questions about services, appointments, or directions.'
      });

      // Wait for greeting with timeout
      const greetingPromise = handle.waitForPlayout();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Greeting timeout')), SESSION_CONFIG.GREETING_TIMEOUT_MS)
      );

      await Promise.race([greetingPromise, timeoutPromise]);
      console.log('Greeting delivered successfully');
    } catch (error) {
      console.error('Error during greeting:', error);
      // Don't throw - continue execution even if greeting fails
    }
  }

  async cleanup(reason: string) {
    await this.resourceManager.cleanup(reason);
  }

  getSession() {
    return this.session;
  }

  isActive() {
    return this.resourceManager.isActive();
  }
}

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
    const sessionManager = new SessionManager();
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
      const today = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      console.log('Session date:', today);

      // Create agent with optimized configuration
      const agent = new voice.Agent({
        vad: vad,
        instructions: dermaVisualsSpaPrompt(today),
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
          await new Promise(resolve => setTimeout(resolve, SESSION_CONFIG.SESSION_RETRY_DELAY_MS));
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
      await new Promise(resolve => setTimeout(resolve, SESSION_CONFIG.ROOM_INIT_DELAY_MS));

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
          setTimeout(() => reject(new Error('Participant join timeout')), 
          SESSION_CONFIG.PARTICIPANT_JOIN_TIMEOUT_MS)
        );
        
        const participant = await Promise.race([participantPromise, timeoutPromise]) as any;
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
      sessionManager['resourceManager'].register(() => {
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
cli.runApp(new WorkerOptions({
  agent: fileURLToPath(import.meta.url),
  agentName: 'jane'
}));