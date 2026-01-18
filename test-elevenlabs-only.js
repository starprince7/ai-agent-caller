#!/usr/bin/env node

/**
 * Test ElevenLabs TTS Only
 * Focuses on testing ElevenLabs without fallback to isolate the audio:null issue
 */

import dotenv from 'dotenv';
import { initializeLogger } from '@livekit/agents';
import * as elevenlabs from '@livekit/agents-plugin-elevenlabs';

dotenv.config({ path: '.env.local' });

// Initialize logger
initializeLogger({
  pretty: true,
  level: 'info'
});

async function testElevenLabsOnly() {
  console.log('🧪 Testing ElevenLabs TTS Only...\n');
  
  const apiKey = process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    console.error('❌ ElevenLabs API key required. Set ELEVEN_API_KEY or ELEVENLABS_API_KEY');
    return;
  }
  
  console.log('✅ API Key found:', apiKey.substring(0, 8) + '...');
  
  const models = [
    'eleven_flash_v2_5',      // Should work
    'eleven_turbo_v2_5',      // Should work
    'eleven_multilingual_v2', // Should work
  ];
  
  for (const model of models) {
    console.log(`\n--- Testing Model: ${model} ---`);
    
    try {
      // Create TTS with exact production config
      const tts = new elevenlabs.TTS({
        model: model,
        voice: {
          id: '2vbhUP8zyKg4dEZaTWGn',
          name: 'Stella - Warm, Natural & Conversational',
          category: 'premade',
        },
        enableLogging: true,
        encoding: 'pcm_16000',
        inactivityTimeout: 15000,
        streamingLatency: 1,
      });
      
      console.log('✅ TTS instance created');
      
      // Test synthesis
      const testText = "Hello, this is a test of ElevenLabs TTS.";
      console.log('🔊 Starting synthesis...');
      
      const synthesizeRequest = tts.synthesize(testText);
      
      let audioGenerated = false;
      let chunkCount = 0;
      let totalBytes = 0;
      let startTime = Date.now();
      
      for await (const event of synthesizeRequest) {
        const elapsed = Date.now() - startTime;
        
        if (event.type === 'audio') {
          audioGenerated = true;
          chunkCount++;
          totalBytes += event.frame.data.length;
          console.log(`🔊 [${elapsed}ms] Audio chunk ${chunkCount}: ${event.frame.data.length} bytes`);
        } else if (event.type === 'started') {
          console.log(`🎬 [${elapsed}ms] TTS synthesis started`);
        } else if (event.type === 'finished') {
          console.log(`🏁 [${elapsed}ms] TTS synthesis finished`);
        } else {
          console.log(`📝 [${elapsed}ms] Event: ${event.type}`, event);
        }
      }
      
      const duration = Date.now() - startTime;
      
      console.log(`\n📊 Results for ${model}:`);
      console.log(`  Duration: ${duration}ms`);
      console.log(`  Audio generated: ${audioGenerated ? '✅ YES' : '❌ NO'}`);
      console.log(`  Chunks: ${chunkCount}`);
      console.log(`  Total bytes: ${totalBytes}`);
      
      if (!audioGenerated) {
        console.log(`  ❌ AUDIO:NULL DETECTED for ${model}!`);
      } else {
        console.log(`  ✅ ${model} working correctly`);
      }
      
      // Check for suspiciously fast completion (indicates audio:null)
      if (duration < 500 && !audioGenerated) {
        console.log(`  ⚠️  Fast completion without audio - classic audio:null symptom`);
      }
      
    } catch (error) {
      console.error(`❌ ${model} failed:`, error.message);
      
      // Check for specific error patterns
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        console.log('  🚨 API Key issue detected');
      } else if (error.message.includes('unusual activity')) {
        console.log('  🚨 Account flagged for unusual activity');
      }
    }
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n=== SUMMARY ===');
  console.log('If you see "AUDIO:NULL DETECTED" above, that confirms the issue.');
  console.log('If you see "401 Unauthorized" or "unusual activity", your API key is flagged.');
  console.log('Working models should show "✅ YES" for audio generation.');
}

testElevenLabsOnly().catch(console.error);
