#!/usr/bin/env node

/**
 * Isolated ElevenLabs TTS Test Script
 * Tests TTS providers in isolation and captures detailed API data
 */

import dotenv from 'dotenv';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';
import * as openai from '@livekit/agents-plugin-openai';
import { writeFileSync } from 'node:fs';
import { initializeLogger } from '@livekit/agents';

dotenv.config({ path: '.env.local' });

// Initialize LiveKit logger
initializeLogger({
  pretty: true,
  level: 'info'
});

// Test configuration
const TEST_CONFIG = {
  text: "Hello, this is a test of the ElevenLabs TTS system.",
  elevenlabsVoiceId: '2vbhUP8zyKg4dEZaTWGn',
  elevenlabsVoiceName: 'Stella - Warm, Natural & Conversational',
  models: [
    'eleven_flash_v2_5',    // Recommended working model
    'eleven_turbo_v2_5',    // Alternative working model
    'eleven_multilingual_v2', // Multilingual support
    // 'eleven_v3'          // BROKEN - causes audio:null
  ]
};

/**
 * Enhanced logging wrapper for TTS instances
 */
class TTSLogger {
  constructor(name, ttsInstance) {
    this.name = name;
    this.tts = ttsInstance;
    this.logs = [];
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      provider: this.name,
      message,
      data
    };
    
    this.logs.push(logEntry);
    console.log(`[${timestamp}] [${level.toUpperCase()}] [${this.name}] ${message}`);
    
    if (data) {
      console.log('  Data:', JSON.stringify(data, null, 2));
    }
  }

  async testSynthesize(text, options = {}) {
    this.log('info', `Starting TTS synthesis test`, { text, options });
    
    try {
      const startTime = Date.now();
      
      // Create synthesis request
      const synthesizeRequest = this.tts.synthesize(text, options);
      this.log('info', 'TTS synthesis request created');
      
      // Collect audio chunks and metadata
      const audioChunks = [];
      let chunkCount = 0;
      let totalBytes = 0;
      
      for await (const event of synthesizeRequest) {
        chunkCount++;
        
        if (event.type === 'audio') {
          const audioData = event.frame.data;
          audioChunks.push(audioData);
          totalBytes += audioData.length;
          
          this.log('debug', `Audio chunk ${chunkCount}`, {
            chunkSize: audioData.length,
            totalBytes,
            sampleRate: event.frame.sampleRate,
            channels: event.frame.channels
          });
        } else if (event.type === 'started') {
          this.log('info', 'TTS synthesis started');
        } else if (event.type === 'finished') {
          this.log('info', 'TTS synthesis finished');
        } else {
          this.log('debug', `TTS event: ${event.type}`, event);
        }
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Final results
      const result = {
        success: true,
        duration,
        chunkCount,
        totalBytes,
        audioGenerated: totalBytes > 0,
        avgChunkSize: totalBytes / chunkCount || 0
      };
      
      this.log('success', 'TTS synthesis completed', result);
      
      // Save audio if generated
      if (totalBytes > 0) {
        const audioBuffer = Buffer.concat(audioChunks);
        const filename = `test-audio-${this.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.raw`;
        writeFileSync(filename, audioBuffer);
        this.log('info', `Audio saved to ${filename}`);
        result.audioFile = filename;
      } else {
        this.log('error', 'NO AUDIO GENERATED - This indicates audio:null issue!');
      }
      
      return result;
      
    } catch (error) {
      const errorResult = {
        success: false,
        error: error.message,
        stack: error.stack,
        duration: Date.now() - Date.now()
      };
      
      this.log('error', 'TTS synthesis failed', errorResult);
      return errorResult;
    }
  }

  exportLogs() {
    const filename = `tts-logs-${this.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.json`;
    writeFileSync(filename, JSON.stringify(this.logs, null, 2));
    console.log(`Logs exported to ${filename}`);
    return filename;
  }
}

/**
 * Test ElevenLabs TTS with different models
 */
async function testElevenLabsTTS() {
  console.log('\n=== Testing ElevenLabs TTS ===');
  
  const apiKey = process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('❌ ElevenLabs API key not found. Set ELEVEN_API_KEY or ELEVENLABS_API_KEY');
    return;
  }
  
  console.log('✅ API Key found:', apiKey.substring(0, 8) + '...');
  
  const results = [];
  
  for (const model of TEST_CONFIG.models) {
    console.log(`\n--- Testing model: ${model} ---`);
    
    try {
      // Create TTS instance with specific model
      const tts = new elevenlabs.TTS({
        model: model,
        voice: {
          id: TEST_CONFIG.elevenlabsVoiceId,
          name: TEST_CONFIG.elevenlabsVoiceName,
          category: 'premade',
        },
        enableLogging: true,
        // Additional debugging options
        encoding: 'pcm_16000', // Explicit encoding
        inactivityTimeout: 10000, // 10 second timeout
      });
      
      const logger = new TTSLogger(`ElevenLabs-${model}`, tts);
      const result = await logger.testSynthesize(TEST_CONFIG.text);
      
      result.model = model;
      result.logFile = logger.exportLogs();
      results.push(result);
      
    } catch (error) {
      console.error(`❌ Failed to create TTS instance for ${model}:`, error.message);
      results.push({
        model,
        success: false,
        error: error.message,
        creationFailed: true
      });
    }
  }
  
  return results;
}

/**
 * Test OpenAI TTS as fallback
 */
async function testOpenAITTS() {
  console.log('\n=== Testing OpenAI TTS (Fallback) ===');
  
  try {
    const tts = new openai.TTS({
      voice: 'nova',
    });
    
    const logger = new TTSLogger('OpenAI-TTS', tts);
    const result = await logger.testSynthesize(TEST_CONFIG.text);
    
    result.logFile = logger.exportLogs();
    return result;
    
  } catch (error) {
    console.error('❌ OpenAI TTS test failed:', error.message);
    return {
      success: false,
      error: error.message,
      provider: 'OpenAI'
    };
  }
}

/**
 * Main test runner
 */
async function runTTSTests() {
  console.log('🧪 Starting TTS Isolation Tests...\n');
  console.log('Configuration:', TEST_CONFIG);
  
  const testResults = {
    timestamp: new Date().toISOString(),
    config: TEST_CONFIG,
    elevenlabs: [],
    openai: null
  };
  
  // Test ElevenLabs models
  testResults.elevenlabs = await testElevenLabsTTS();
  
  // Test OpenAI fallback
  testResults.openai = await testOpenAITTS();
  
  // Generate summary report
  console.log('\n=== TEST SUMMARY ===');
  
  console.log('\nElevenLabs Results:');
  testResults.elevenlabs.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const audio = result.audioGenerated ? '🔊' : '🔇';
    console.log(`  ${status} ${audio} ${result.model}: ${result.success ? 'SUCCESS' : result.error}`);
    
    if (result.success) {
      console.log(`    Duration: ${result.duration}ms, Chunks: ${result.chunkCount}, Bytes: ${result.totalBytes}`);
    }
  });
  
  console.log('\nOpenAI Results:');
  const openaiStatus = testResults.openai?.success ? '✅' : '❌';
  const openaiAudio = testResults.openai?.audioGenerated ? '🔊' : '🔇';
  console.log(`  ${openaiStatus} ${openaiAudio} OpenAI TTS: ${testResults.openai?.success ? 'SUCCESS' : testResults.openai?.error}`);
  
  // Save complete test results
  const reportFile = `tts-test-report-${Date.now()}.json`;
  writeFileSync(reportFile, JSON.stringify(testResults, null, 2));
  console.log(`\n📄 Complete test report saved to: ${reportFile}`);
  
  // Recommendations
  console.log('\n=== RECOMMENDATIONS ===');
  const workingModels = testResults.elevenlabs.filter(r => r.success && r.audioGenerated);
  
  if (workingModels.length > 0) {
    console.log('✅ Working ElevenLabs models:');
    workingModels.forEach(model => {
      console.log(`  - ${model.model} (${model.duration}ms, ${model.totalBytes} bytes)`);
    });
  } else {
    console.log('❌ No working ElevenLabs models found!');
  }
  
  if (testResults.openai?.success) {
    console.log('✅ OpenAI TTS fallback is working');
  } else {
    console.log('❌ OpenAI TTS fallback failed');
  }
}

// Run tests
runTTSTests().catch(console.error);
