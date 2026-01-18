// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0

import { llm, voice } from '@livekit/agents';
import * as deepgram from '@livekit/agents-plugin-deepgram';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import { TTSService } from '../services/TTSService.js';

export interface AgentDependencies {
  stt: deepgram.STT;
  llm: openai.LLM;
}

export interface VoiceConfig {
  id: string;
  name: string;
  category: string;
}

export interface AgentConfig {
  voice?: VoiceConfig;
  sttModel?: string;
  llmModel?: string;
  llmTemperature?: number;
}

const DEFAULT_VOICE_CONFIG: VoiceConfig = {
  id: '2vbhUP8zyKg4dEZaTWGn',
  name: 'Stella - Warm, Natural & Conversational',
  category: 'premade',
};

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  voice: DEFAULT_VOICE_CONFIG,
  sttModel: 'nova-3',
  llmModel: 'gpt-4o-mini',
  llmTemperature: 0.7,
};

/**
 * Factory for creating agent dependencies (TTS, STT, LLM)
 */
export class AgentFactory {
  private readonly config: AgentConfig;

  constructor(config: Partial<AgentConfig> = {}) {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config };
  }

  /**
   * Create all agent dependencies (excluding TTS - use TTSService instead)
   */
  createDependencies(): AgentDependencies {
    return {
      stt: this.createSTT(),
      llm: this.createLLM(),
    };
  }

  /**
   * Create TTSService with proper model configuration and fallback
   */
  createTTSService(): TTSService {
    const apiKey = process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      console.warn('ElevenLabs API key not found. Set ELEVEN_API_KEY or ELEVENLABS_API_KEY environment variable.');
    }

    // Temporarily use OpenAI as primary due to ElevenLabs account flagged
    return new TTSService({
      primaryProvider: 'openai', // Changed from 'elevenlabs' 
      fallbackProvider: 'elevenlabs',
      elevenlabsVoiceId: this.config.voice?.id || DEFAULT_VOICE_CONFIG.id,
      elevenlabsVoiceName: this.config.voice?.name || DEFAULT_VOICE_CONFIG.name,
      elevenlabsModel: 'eleven_flash_v2_5',
      openaiVoice: 'nova',
      enableFallback: true,
    });
  }

  /**
   * @deprecated Use createTTSService() instead for proper fallback support
   * Create TTS instance with proper model and API key
   */
  createTTS(): elevenlabs.TTS {
    const apiKey = process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY;
    
    if (!apiKey) {
      throw new Error('ElevenLabs API key not found. Set ELEVEN_API_KEY or ELEVENLABS_API_KEY environment variable.');
    }

    return new elevenlabs.TTS({
      model: 'eleven_flash_v2_5', // Use working model, not eleven_v3
      voice: this.config.voice || DEFAULT_VOICE_CONFIG,
      enableLogging: true,
    });
  }

  /**
   * Create STT instance
   */
  createSTT(): deepgram.STT {
    return new deepgram.STT({
      model: (this.config.sttModel || 'nova-3') as 'nova-3',
      language: 'en-US',
      smartFormat: true,
      punctuate: true,
    });
  }

  /**
   * Create LLM instance
   */
  createLLM(): openai.LLM {
    return new openai.LLM({
      model: this.config.llmModel || 'gpt-4o-mini',
      temperature: this.config.llmTemperature ?? 0.7,
    });
  }

  /**
   * Create voice agent with provided configuration
   */
  createVoiceAgent(
    vad: silero.VAD,
    instructions: string,
    tools: llm.ToolContext
  ): voice.Agent {
    return new voice.Agent({
      vad,
      instructions,
      allowInterruptions: true,
      tools,
    });
  }
}
