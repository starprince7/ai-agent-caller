#!/usr/bin/env node

/**
 * Direct ElevenLabs API Test - Bypasses LiveKit to test raw API responses
 * This will show exactly what ElevenLabs returns, including audio:null issues
 */

import dotenv from 'dotenv';
import { writeFileSync } from 'node:fs';
import WebSocket from 'ws';

dotenv.config({ path: '.env.local' });

const API_KEY = process.env.ELEVEN_API_KEY || process.env.ELEVENLABS_API_KEY;
const VOICE_ID = '2vbhUP8zyKg4dEZaTWGn'; // Stella voice
const TEST_TEXT = "Hello, this is a test of the ElevenLabs TTS system.";

// Models to test
const MODELS_TO_TEST = [
  'eleven_flash_v2_5',      // Should work
  'eleven_turbo_v2_5',      // Should work  
  'eleven_multilingual_v2', // Should work
  'eleven_v3'               // BROKEN - will show audio:null
];

/**
 * Test ElevenLabs WebSocket streaming API directly
 */
async function testElevenLabsWebSocket(model) {
  console.log(`\n🔌 Testing WebSocket API with model: ${model}`);
  
  return new Promise((resolve) => {
    const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream-input?model_id=${model}`;
    
    const ws = new WebSocket(wsUrl, {
      headers: {
        'xi-api-key': API_KEY
      }
    });
    
    const results = {
      model,
      method: 'WebSocket',
      connected: false,
      messages: [],
      audioChunks: 0,
      totalAudioBytes: 0,
      errors: [],
      startTime: Date.now()
    };
    
    ws.on('open', () => {
      console.log(`✅ WebSocket connected for ${model}`);
      results.connected = true;
      
      // Send configuration
      const config = {
        text: TEST_TEXT,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8
        },
        xi_api_key: API_KEY
      };
      
      console.log('📤 Sending config:', JSON.stringify(config, null, 2));
      ws.send(JSON.stringify(config));
      
      // Send EOS (End of Stream)
      setTimeout(() => {
        console.log('📤 Sending EOS');
        ws.send(JSON.stringify({ text: "" }));
      }, 100);
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        results.messages.push({
          timestamp: Date.now() - results.startTime,
          ...message
        });
        
        console.log('📥 Received message:', JSON.stringify(message, null, 2));
        
        if (message.audio) {
          if (message.audio === null) {
            console.log('❌ AUDIO IS NULL - This is the bug!');
          } else {
            results.audioChunks++;
            // Audio is base64 encoded
            const audioBuffer = Buffer.from(message.audio, 'base64');
            results.totalAudioBytes += audioBuffer.length;
            console.log(`🔊 Audio chunk ${results.audioChunks}: ${audioBuffer.length} bytes`);
          }
        }
        
        if (message.isFinal) {
          console.log('🏁 Received final message');
          ws.close();
        }
        
      } catch (error) {
        console.error('❌ Error parsing message:', error);
        results.errors.push(`Parse error: ${error.message}`);
      }
    });
    
    ws.on('error', (error) => {
      console.error(`❌ WebSocket error for ${model}:`, error);
      results.errors.push(`WebSocket error: ${error.message}`);
    });
    
    ws.on('close', (code, reason) => {
      results.endTime = Date.now();
      results.duration = results.endTime - results.startTime;
      
      console.log(`🔌 WebSocket closed for ${model}. Code: ${code}, Reason: ${reason}`);
      console.log(`📊 Results: ${results.audioChunks} audio chunks, ${results.totalAudioBytes} total bytes`);
      
      resolve(results);
    });
    
    // Timeout after 30 seconds
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        console.log(`⏰ Timeout for ${model}, closing connection`);
        ws.close();
      }
    }, 30000);
  });
}

/**
 * Test ElevenLabs HTTP streaming API directly
 */
async function testElevenLabsHTTP(model) {
  console.log(`\n🌐 Testing HTTP API with model: ${model}`);
  
  const results = {
    model,
    method: 'HTTP',
    response: null,
    audioBytes: 0,
    errors: [],
    startTime: Date.now()
  };
  
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: TEST_TEXT,
        model_id: model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8
        }
      })
    });
    
    results.response = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    };
    
    console.log('📥 HTTP Response:', results.response);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      console.error('Error body:', errorText);
      results.errors.push(`HTTP ${response.status}: ${errorText}`);
    } else {
      // Read response as stream
      const reader = response.body.getReader();
      let chunkCount = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunkCount++;
        results.audioBytes += value.length;
        console.log(`🔊 HTTP chunk ${chunkCount}: ${value.length} bytes`);
      }
      
      console.log(`📊 Total HTTP audio: ${results.audioBytes} bytes`);
    }
    
  } catch (error) {
    console.error(`❌ HTTP request failed for ${model}:`, error);
    results.errors.push(`HTTP error: ${error.message}`);
  }
  
  results.endTime = Date.now();
  results.duration = results.endTime - results.startTime;
  
  return results;
}

/**
 * Main test runner
 */
async function runDirectAPITests() {
  console.log('🧪 Starting Direct ElevenLabs API Tests...\n');
  
  if (!API_KEY) {
    console.error('❌ ElevenLabs API key not found. Set ELEVEN_API_KEY or ELEVENLABS_API_KEY');
    return;
  }
  
  console.log('✅ API Key found:', API_KEY.substring(0, 8) + '...');
  console.log('🎤 Voice ID:', VOICE_ID);
  console.log('📝 Test text:', TEST_TEXT);
  
  const allResults = {
    timestamp: new Date().toISOString(),
    config: {
      voiceId: VOICE_ID,
      testText: TEST_TEXT,
      models: MODELS_TO_TEST
    },
    websocketResults: [],
    httpResults: []
  };
  
  // Test each model with both WebSocket and HTTP
  for (const model of MODELS_TO_TEST) {
    console.log(`\n=== Testing Model: ${model} ===`);
    
    // Test WebSocket API
    try {
      const wsResult = await testElevenLabsWebSocket(model);
      allResults.websocketResults.push(wsResult);
    } catch (error) {
      console.error(`❌ WebSocket test failed for ${model}:`, error);
      allResults.websocketResults.push({
        model,
        method: 'WebSocket',
        error: error.message,
        failed: true
      });
    }
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test HTTP API
    try {
      const httpResult = await testElevenLabsHTTP(model);
      allResults.httpResults.push(httpResult);
    } catch (error) {
      console.error(`❌ HTTP test failed for ${model}:`, error);
      allResults.httpResults.push({
        model,
        method: 'HTTP',
        error: error.message,
        failed: true
      });
    }
    
    // Wait between models
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Generate report
  console.log('\n=== DIRECT API TEST RESULTS ===');
  
  console.log('\n📊 WebSocket Results:');
  allResults.websocketResults.forEach(result => {
    const status = result.errors.length === 0 && result.audioChunks > 0 ? '✅' : '❌';
    const audio = result.totalAudioBytes > 0 ? '🔊' : '🔇';
    console.log(`  ${status} ${audio} ${result.model}: ${result.audioChunks} chunks, ${result.totalAudioBytes} bytes`);
    
    if (result.errors.length > 0) {
      result.errors.forEach(error => console.log(`    ❌ ${error}`));
    }
    
    // Check for audio:null messages
    const nullAudioMessages = result.messages?.filter(m => m.audio === null) || [];
    if (nullAudioMessages.length > 0) {
      console.log(`    ⚠️  Found ${nullAudioMessages.length} messages with audio:null`);
    }
  });
  
  console.log('\n📊 HTTP Results:');
  allResults.httpResults.forEach(result => {
    const status = result.errors.length === 0 && result.audioBytes > 0 ? '✅' : '❌';
    const audio = result.audioBytes > 0 ? '🔊' : '🔇';
    console.log(`  ${status} ${audio} ${result.model}: ${result.audioBytes} bytes`);
    
    if (result.errors.length > 0) {
      result.errors.forEach(error => console.log(`    ❌ ${error}`));
    }
  });
  
  // Save detailed results
  const reportFile = `elevenlabs-direct-test-${Date.now()}.json`;
  writeFileSync(reportFile, JSON.stringify(allResults, null, 2));
  console.log(`\n📄 Detailed results saved to: ${reportFile}`);
  
  // Identify working models
  const workingWSModels = allResults.websocketResults.filter(r => r.totalAudioBytes > 0);
  const workingHTTPModels = allResults.httpResults.filter(r => r.audioBytes > 0);
  
  console.log('\n=== RECOMMENDATIONS ===');
  if (workingWSModels.length > 0) {
    console.log('✅ Working WebSocket models:');
    workingWSModels.forEach(m => console.log(`  - ${m.model}`));
  }
  
  if (workingHTTPModels.length > 0) {
    console.log('✅ Working HTTP models:');
    workingHTTPModels.forEach(m => console.log(`  - ${m.model}`));
  }
  
  // Check for the specific audio:null issue
  const modelsWithNullAudio = allResults.websocketResults.filter(r => 
    r.messages?.some(m => m.audio === null)
  );
  
  if (modelsWithNullAudio.length > 0) {
    console.log('\n❌ Models returning audio:null (BROKEN):');
    modelsWithNullAudio.forEach(m => console.log(`  - ${m.model}`));
  }
}

// Run the tests
runDirectAPITests().catch(console.error);
