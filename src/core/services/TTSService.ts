// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import * as openai from '@livekit/agents-plugin-openai';

export type TTSProvider = 'elevenlabs' | 'openai';

// ElevenLabs model options - eleven_v3 is BROKEN (returns audio:null)
// Use eleven_flash_v2_5 or eleven_turbo_v2_5 for reliable audio generation
export type ElevenLabsModel = 
  | 'eleven_flash_v2_5'      // Fast, reliable - RECOMMENDED
  | 'eleven_turbo_v2_5'      // Fast, reliable
  | 'eleven_multilingual_v2' // Multilingual support
  | 'eleven_monolingual_v1'; // Legacy

export interface TTSConfig {
  primaryProvider: TTSProvider;
  fallbackProvider?: TTSProvider;
  elevenlabsVoiceId?: string;
  elevenlabsVoiceName?: string;
  elevenlabsModel?: ElevenLabsModel; // Model selection - IMPORTANT: avoid eleven_v3
  openaiVoice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  enableFallback: boolean;
}

const DEFAULT_TTS_CONFIG: TTSConfig = {
  primaryProvider: 'elevenlabs',
  fallbackProvider: 'openai',
  elevenlabsVoiceId: '2vbhUP8zyKg4dEZaTWGn',
  elevenlabsVoiceName: 'Stella - Warm, Natural & Conversational',
  elevenlabsModel: 'eleven_multilingual_v2',
  openaiVoice: 'nova',
  enableFallback: true,
};

/**
 * TTSService provides TTS with automatic fallback support.
 * If ElevenLabs fails (e.g., returns audio:null), falls back to OpenAI TTS.
 */
export class TTSService {
  private readonly config: TTSConfig;
  private primaryTTS: elevenlabs.TTS | openai.TTS;
  private fallbackTTS: openai.TTS | null = null;
  private useFallback = false;
  private failureCount = 0;
  private readonly maxFailuresBeforeFallback = 2;

  constructor(config: Partial<TTSConfig> = {}) {
    this.config = { ...DEFAULT_TTS_CONFIG, ...config };
    this.primaryTTS = this.createTTS(this.config.primaryProvider);
    
    if (this.config.enableFallback && this.config.fallbackProvider) {
      this.fallbackTTS = this.createTTS(this.config.fallbackProvider) as openai.TTS;
      console.log(`TTS fallback enabled: ${this.config.fallbackProvider}`);
    }
    
    console.log(`TTS initialized with primary provider: ${this.config.primaryProvider}`);
  }

  private createTTS(provider: TTSProvider): elevenlabs.TTS | openai.TTS {
    if (provider === 'elevenlabs') {
      const model = this.config.elevenlabsModel || 'eleven_flash_v2_5';
      console.log(`Creating ElevenLabs TTS with voice ID: ${this.config.elevenlabsVoiceId}, model: ${model}`);
      
      // IMPORTANT: eleven_v3 model is broken and returns audio:null
      // Always use eleven_flash_v2_5 or eleven_turbo_v2_5
      if (model === 'eleven_v3' as any) {
        console.warn('WARNING: eleven_v3 model is known to cause audio:null errors. Using eleven_flash_v2_5 instead.');
      }
      
      return new elevenlabs.TTS({
        model: model,
        voice: {
          id: this.config.elevenlabsVoiceId!,
          name: this.config.elevenlabsVoiceName!,
          category: 'premade',
        },
        enableLogging: true,
        // Additional debugging options
        encoding: 'pcm_16000', // Explicit encoding for better compatibility
        inactivityTimeout: 15000, // 15 second timeout
        streamingLatency: 1, // Low latency mode
      });
    } else {
      console.log(`Creating OpenAI TTS with voice: ${this.config.openaiVoice}`);
      const apiKey = process.env.OPENAI_API_KEY;
      
      if (!apiKey) {
        throw new Error('OpenAI API key not found. Set OPENAI_API_KEY environment variable.');
      }
      
      return new openai.TTS({
        voice: this.config.openaiVoice || 'nova',
      });
    }
  }

  /**
   * Get the active TTS instance (primary or fallback)
   */
  getTTS(): elevenlabs.TTS | openai.TTS {
    if (this.useFallback && this.fallbackTTS) {
      return this.fallbackTTS;
    }
    return this.primaryTTS;
  }

  /**
   * Report a TTS failure - triggers fallback after threshold
   */
  reportFailure(error?: Error): void {
    this.failureCount++;
    console.warn(`TTS failure reported (${this.failureCount}/${this.maxFailuresBeforeFallback}):`, error?.message || 'Unknown error');
    
    if (this.failureCount >= this.maxFailuresBeforeFallback && this.fallbackTTS && !this.useFallback) {
      console.log('Switching to fallback TTS provider due to repeated failures');
      this.useFallback = true;
    }
  }

  /**
   * Report a successful TTS operation
   */
  reportSuccess(): void {
    // Reset failure count on success if we're on primary
    if (!this.useFallback) {
      this.failureCount = 0;
    }
  }

  /**
   * Force switch to fallback TTS
   */
  switchToFallback(): boolean {
    if (this.fallbackTTS) {
      console.log('Manually switching to fallback TTS');
      this.useFallback = true;
      return true;
    }
    console.warn('No fallback TTS configured');
    return false;
  }

  /**
   * Reset to primary TTS
   */
  resetToPrimary(): void {
    console.log('Resetting to primary TTS');
    this.useFallback = false;
    this.failureCount = 0;
  }

  /**
   * Check if currently using fallback
   */
  isUsingFallback(): boolean {
    return this.useFallback;
  }

  /**
   * Get current provider name
   */
  getCurrentProvider(): TTSProvider {
    return this.useFallback ? (this.config.fallbackProvider || 'openai') : this.config.primaryProvider;
  }

  /**
   * Clean up TTS resources
   */
  cleanup(): void {
    try {
      if (this.primaryTTS && typeof (this.primaryTTS as any).removeAllListeners === 'function') {
        (this.primaryTTS as any).removeAllListeners();
      }
      if (this.fallbackTTS && typeof (this.fallbackTTS as any).removeAllListeners === 'function') {
        (this.fallbackTTS as any).removeAllListeners();
      }
      console.log('TTS resources cleaned up');
    } catch (error) {
      console.warn('Error cleaning up TTS:', error);
    }
  }
}
