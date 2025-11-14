// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import { voice, type JobContext } from '@livekit/agents';
import { ResourceManager } from './ResourceManager.js';

// Define interfaces for external dependencies - include only what's needed
export interface TTS {
  removeAllListeners?: () => void;
  // Other required properties would be defined here
}

export interface STT {
  // Required STT interface properties would be defined here
}

export interface LLM {
  // Required LLM interface properties would be defined here
}

export interface VAD {
  // Required VAD interface properties would be defined here
}

// Session configuration constants
const SESSION_CONFIG = {
  TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  MEMORY_LOG_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  PARTICIPANT_JOIN_TIMEOUT_MS: 30000, // 30 seconds
  GREETING_TIMEOUT_MS: 10000, // 10 seconds
  SESSION_RETRY_DELAY_MS: 500, // 500ms delay between retries
  ROOM_INIT_DELAY_MS: 100, // 100ms delay after room connection
} as const;

// Enhanced session manager with improved error handling
export class SessionManager {
  private session: voice.AgentSession | null = null;
  private tts: TTS;
  private stt: STT;
  private llm: LLM;
  private isSessionStarted = false;
  private resourceManager: ResourceManager;

  constructor({
    resourceManager,
    tts,
    stt,
    llm
  }: {
    resourceManager: ResourceManager;
    tts: TTS;
    stt: STT;
    llm: LLM;
  }) {
    this.resourceManager = resourceManager;
    this.tts = tts;
    this.stt = stt;
    this.llm = llm;
  }

  async createSession(vad: any, agent: voice.Agent): Promise<voice.AgentSession> {
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
      }
    });

    // Create session with enhanced configuration
    this.session = new voice.AgentSession({
      vad, // Use the provided VAD instance
      stt: this.stt as any, // Cast to any to bypass type checking
      tts: this.tts as any, // Cast to any to bypass type checking
      llm: this.llm as any, // Cast to any to bypass type checking
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
        
        // Reset session state and dispose partially initialized session to avoid duplicate wiring
        this.isSessionStarted = false;
        try {
          this.session?.removeAllListeners();
        } catch {}
        this.session = null;
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
        instructions: 'Introduce yourself. Greet the user warmly, and offer your assistance.'
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

  getResourceManager() {
    return this.resourceManager;
  }
}
