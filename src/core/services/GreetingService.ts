// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

import { voice } from '@livekit/agents';

export interface GreetingConfig {
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  fallbackEnabled: boolean;
  onTTSFailure?: () => void; // Callback when TTS fails (e.g., to trigger TTS fallback)
  onTTSSuccess?: () => void; // Callback when TTS succeeds
}

const DEFAULT_GREETING_CONFIG: GreetingConfig = {
  timeoutMs: 15000, // 15 seconds - increased from 12s
  maxRetries: 2,
  retryDelayMs: 1000,
  fallbackEnabled: true,
  onTTSFailure: undefined,
  onTTSSuccess: undefined,
};

const DEFAULT_GREETING_INSTRUCTIONS = 'Introduce yourself. Greet the user warmly, and offer your assistance.';
const FALLBACK_GREETING_INSTRUCTIONS = 'Say a brief hello and ask how you can help.';

/**
 * GreetingService handles greeting delivery with:
 * - Guard pattern to prevent race conditions
 * - Retry logic for transient failures
 * - Fallback greeting strategy
 * - Proper timeout handling
 */
export class GreetingService {
  private hasGreetingStarted = false;
  private hasGreetingCompleted = false;
  private readonly config: GreetingConfig;

  constructor(config: Partial<GreetingConfig> = {}) {
    this.config = { ...DEFAULT_GREETING_CONFIG, ...config };
  }

  /**
   * Delivers greeting with guard pattern and fallback strategy
   */
  async deliverGreeting(
    session: voice.AgentSession,
    customInstructions?: string
  ): Promise<{ success: boolean; usedFallback: boolean; error?: Error }> {
    // Guard: Prevent duplicate greeting attempts
    if (this.hasGreetingStarted) {
      console.log('Greeting already initiated, skipping duplicate call');
      return { success: this.hasGreetingCompleted, usedFallback: false };
    }

    this.hasGreetingStarted = true;
    const instructions = customInstructions || DEFAULT_GREETING_INSTRUCTIONS;

    // Try primary greeting with retries
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log(`Greeting attempt ${attempt}/${this.config.maxRetries}`);
        await this.executeGreeting(session, instructions);
        this.hasGreetingCompleted = true;
        console.log('Greeting delivered successfully');
        return { success: true, usedFallback: false };
      } catch (error) {
        console.warn(`Greeting attempt ${attempt} failed:`, error);
        
        if (attempt < this.config.maxRetries) {
          await this.delay(this.config.retryDelayMs);
        }
      }
    }

    // Fallback strategy
    if (this.config.fallbackEnabled) {
      console.log('Primary greeting failed, attempting fallback greeting...');
      try {
        await this.executeFallbackGreeting(session);
        this.hasGreetingCompleted = true;
        console.log('Fallback greeting delivered successfully');
        return { success: true, usedFallback: true };
      } catch (fallbackError) {
        console.error('Fallback greeting also failed:', fallbackError);
        return { 
          success: false, 
          usedFallback: true, 
          error: fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError))
        };
      }
    }

    return { 
      success: false, 
      usedFallback: false, 
      error: new Error('All greeting attempts failed') 
    };
  }

  /**
   * Execute greeting with timeout and TTS failure detection
   */
  private async executeGreeting(
    session: voice.AgentSession,
    instructions: string
  ): Promise<void> {
    console.log('Starting greeting generation with instructions:', instructions.substring(0, 50) + '...');
    
    const handle = session.generateReply({ instructions });
    const startTime = Date.now();

    const greetingPromise = handle.waitForPlayout().then(() => {
      const elapsed = Date.now() - startTime;
      console.log(`Greeting playout completed in ${elapsed}ms`);
      
      // If playout completes too quickly (< 500ms), it likely means no audio was generated
      // ElevenLabs audio:null issue causes immediate completion
      if (elapsed < 500) {
        console.warn(`Greeting completed suspiciously fast (${elapsed}ms) - possible TTS issue (audio:null)`);
        this.config.onTTSFailure?.();
        throw new Error('TTS may have returned empty audio (completed too quickly)');
      }
      
      // Success - notify TTS service
      this.config.onTTSSuccess?.();
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeoutId = setTimeout(() => {
        console.error(`Greeting timeout after ${this.config.timeoutMs}ms - TTS likely failed to generate audio`);
        this.config.onTTSFailure?.();
        reject(new Error(`Greeting timeout after ${this.config.timeoutMs}ms - check TTS provider`));
      }, this.config.timeoutMs);
      
      // Cleanup timeout if greeting completes
      greetingPromise.finally(() => clearTimeout(timeoutId)).catch(() => {});
    });

    await Promise.race([greetingPromise, timeoutPromise]);
  }

  /**
   * Execute simplified fallback greeting with shorter timeout
   */
  private async executeFallbackGreeting(session: voice.AgentSession): Promise<void> {
    console.log('Attempting fallback greeting with simplified instructions');
    
    const handle = session.generateReply({ 
      instructions: FALLBACK_GREETING_INSTRUCTIONS 
    });

    // Use shorter timeout for fallback
    const fallbackTimeoutMs = Math.min(this.config.timeoutMs / 2, 8000);
    const startTime = Date.now();
    
    const greetingPromise = handle.waitForPlayout().then(() => {
      const elapsed = Date.now() - startTime;
      console.log(`Fallback greeting playout completed in ${elapsed}ms`);
      
      if (elapsed < 500) {
        console.warn(`Fallback greeting completed too quickly (${elapsed}ms) - TTS issue persists`);
        this.config.onTTSFailure?.();
        throw new Error('Fallback TTS also returned empty audio');
      }
      
      this.config.onTTSSuccess?.();
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timeoutId = setTimeout(() => {
        console.error(`Fallback greeting timeout after ${fallbackTimeoutMs}ms`);
        this.config.onTTSFailure?.();
        reject(new Error(`Fallback greeting timeout after ${fallbackTimeoutMs}ms`));
      }, fallbackTimeoutMs);
      
      greetingPromise.finally(() => clearTimeout(timeoutId)).catch(() => {});
    });

    await Promise.race([greetingPromise, timeoutPromise]);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset greeting state (for testing or session reset)
   */
  reset(): void {
    this.hasGreetingStarted = false;
    this.hasGreetingCompleted = false;
  }

  isCompleted(): boolean {
    return this.hasGreetingCompleted;
  }

  isStarted(): boolean {
    return this.hasGreetingStarted;
  }
}
