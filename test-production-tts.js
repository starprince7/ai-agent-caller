#!/usr/bin/env node

/**
 * Test Production TTS Setup
 * Tests the exact same configuration used in production
 */

import dotenv from 'dotenv';
import { initializeLogger } from '@livekit/agents';
import { AgentFactory } from './dist/core/factories/AgentFactory.js';

dotenv.config({ path: '.env.local' });

// Initialize logger
initializeLogger({
  pretty: true,
  level: 'info'
});

async function testProductionTTS() {
  console.log('🧪 Testing Production TTS Configuration...\n');
  
  // Check API keys
  const elevenKey = process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;
  
  console.log('API Key Status:');
  console.log(`  ElevenLabs: ${elevenKey ? '✅ Found' : '❌ Missing'}`);
  console.log(`  OpenAI: ${openaiKey ? '✅ Found' : '❌ Missing'}`);
  
  if (!elevenKey) {
    console.error('\n❌ ElevenLabs API key required. Set ELEVEN_API_KEY or ELEVENLABS_API_KEY');
    return;
  }
  
  try {
    // Create factory exactly as in production
    const agentFactory = new AgentFactory();
    
    console.log('\n🏭 Creating TTSService via AgentFactory...');
    const ttsService = agentFactory.createTTSService();
    
    console.log('✅ TTSService created successfully');
    console.log('Current provider:', ttsService.getCurrentProvider());
    
    // Get active TTS instance
    const activeTTS = ttsService.getTTS();
    console.log('✅ Active TTS instance obtained');
    
    // Test synthesis
    console.log('\n🔊 Testing TTS synthesis...');
    const testText = "Hello, this is a production TTS test.";
    
    try {
      const synthesizeRequest = activeTTS.synthesize(testText);
      console.log('✅ Synthesis request created');
      
      let audioGenerated = false;
      let chunkCount = 0;
      let totalBytes = 0;
      
      for await (const event of synthesizeRequest) {
        if (event.type === 'audio') {
          audioGenerated = true;
          chunkCount++;
          totalBytes += event.frame.data.length;
          console.log(`🔊 Audio chunk ${chunkCount}: ${event.frame.data.length} bytes`);
        } else if (event.type === 'started') {
          console.log('🎬 TTS synthesis started');
        } else if (event.type === 'finished') {
          console.log('🏁 TTS synthesis finished');
        }
      }
      
      console.log(`\n📊 Results:`);
      console.log(`  Audio generated: ${audioGenerated ? '✅ YES' : '❌ NO'}`);
      console.log(`  Chunks: ${chunkCount}`);
      console.log(`  Total bytes: ${totalBytes}`);
      
      if (!audioGenerated) {
        console.log('\n❌ NO AUDIO GENERATED - This indicates the audio:null issue!');
        console.log('🔄 Testing fallback to OpenAI...');
        
        // Test fallback
        ttsService.reportFailure('Test failure - no audio generated');
        const fallbackTTS = ttsService.getTTS();
        console.log('Current provider after failure:', ttsService.getCurrentProvider());
        
        if (ttsService.getCurrentProvider() === 'openai') {
          console.log('✅ Successfully switched to OpenAI fallback');
          
          // Test OpenAI synthesis
          try {
            const openaiRequest = fallbackTTS.synthesize(testText);
            let openaiAudio = false;
            let openaiChunks = 0;
            
            for await (const event of openaiRequest) {
              if (event.type === 'audio') {
                openaiAudio = true;
                openaiChunks++;
                console.log(`🔊 OpenAI chunk ${openaiChunks}: ${event.frame.data.length} bytes`);
              }
            }
            
            console.log(`OpenAI fallback result: ${openaiAudio ? '✅ SUCCESS' : '❌ FAILED'}`);
          } catch (openaiError) {
            console.error('❌ OpenAI fallback failed:', openaiError.message);
          }
        }
      } else {
        console.log('✅ ElevenLabs TTS working correctly!');
      }
      
    } catch (synthError) {
      console.error('❌ TTS synthesis failed:', synthError.message);
      console.log('🔄 This should trigger fallback in production...');
    }
    
  } catch (error) {
    console.error('❌ Failed to create TTS setup:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run test
testProductionTTS().catch(console.error);
