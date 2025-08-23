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
  pipeline,
} from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Pre-load the Voice Activity Detection model for better performance
    // This runs once when the worker starts, before any jobs
    // Loading AI models is slow, so we do it upfront to make calls start faster
    proc.userData.vad = await silero.VAD.load();
  },

  entry: async (ctx: JobContext) => {
    // Get the pre-loaded VAD model from prewarm
    const vad = ctx.proc.userData.vad! as silero.VAD;

    // Configure the AI agent's personality and behavior
    const initialContext = new llm.ChatContext().append({
      role: llm.ChatRole.SYSTEM,
      text:
        'You are a professional AI voice assistant. Your interface with users will be voice only. ' +
        'Keep responses concise and conversational. Avoid using special characters, abbreviations, ' +
        'or formatting that would be hard to pronounce. Speak naturally as if having a phone conversation.',
    });

    // Connect to the LiveKit room
    await ctx.connect();
    console.log(`Agent connected to room: ${ctx.room.name}`);

    // Wait for a participant to join (works for both inbound and outbound calls)
    console.log('Waiting for participant to join...');
    const participant = await ctx.waitForParticipant();
    console.log(`Participant joined: ${participant.identity}`);

    // Define functions/tools the AI can use during conversations
    const fncCtx: llm.FunctionContext = {
      get_weather: {
        description: 'Get current weather information for any location',
        parameters: z.object({
          location: z.string().describe('The city, state, or country to get weather for'),
        }),
        execute: async ({ location }) => {
          console.log(`Fetching weather for: ${location}`);
          try {
            const response = await fetch(`https://wttr.in/${location}?format=%C+%t+%h+%w`);
            if (!response.ok) {
              throw new Error(`Weather API returned status: ${response.status}`);
            }
            const weather = await response.text().then(text => text.trim());
            return `Current weather in ${location}: ${weather}`;
          } catch (error) {
            console.error(`Failed to fetch weather for ${location}:`, error);
            return `I'm sorry, I couldn't get the weather information for ${location} right now. Please try again later.`;
          }
        },
      },

      // Add more functions here as needed
      get_time: {
        description: 'Get the current time',
        parameters: z.object({}),
        execute: async () => {
          const now = new Date();
          const timeString = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
          });
          return `The current time is ${timeString}`;
        },
      },
    };

    // Create the voice pipeline agent using ONLY OpenAI models
    const agent = new pipeline.VoicePipelineAgent(
      vad, // Voice Activity Detection (when to listen vs speak)
      new openai.STT({ // Speech-to-Text using OpenAI Whisper
        model: 'whisper-1',
      }),
      new openai.LLM({ // Language Model using OpenAI GPT
        model: 'gpt-4o-mini', // Use gpt-4, gpt-4o, or gpt-3.5-turbo as needed
        temperature: 0.7,
      }),
      new openai.TTS({ // Text-to-Speech using OpenAI TTS
        model: 'tts-1', // or 'tts-1-hd' for higher quality
        voice: 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
      }),
      {
        chatCtx: initialContext,
        fncCtx,
      },
    );

    // Start the agent with the participant
    agent.start(ctx.room, participant);

    // Greet the participant
    await agent.say('Hello! This is your AI assistant. How can I help you today?', true);

    console.log(`Voice assistant started for participant: ${participant.identity}`);
  },
});

// Start the worker process
cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));