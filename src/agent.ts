// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import { type JobContext, type JobProcess, WorkerOptions, cli, defineAgent, voice, llm } from '@livekit/agents';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    try {
      // Pre-load the Voice Activity Detection model for better performance
      // This runs once when the worker starts, before any jobs
      // Loading AI models is slow, so we do it upfront to make calls start faster
      proc.userData.vad = await silero.VAD.load();
      console.log('VAD model pre-loaded successfully');
    } catch (error) {
      console.error('Failed to pre-load VAD model:', error);
      throw error;
    }
  },

  entry: async (ctx: JobContext) => {
    try {
      // Get the pre-loaded VAD model from prewarm
      const vad = ctx.proc.userData.vad! as silero.VAD;
      const today = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      console.log('Time log: Today is - : ', today);
      const promptInstruction = `You are a professional AI voice assistant named Jane. Keep responses concise, conversational, and natural for voice-only interactions. Today's date is ${today}.`;

      // Define Jane's persona with tools
      const agent = new voice.Agent({
        vad: vad, // Add VAD to the Agent to enable streaming STT
        instructions: promptInstruction,
        allowInterruptions: true,
        tools: {
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
          set_working_hours: llm.tool({
            description: set_working_hours.description,
            parameters: set_working_hours.parameters,
            execute: set_working_hours.execute,
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
        },
      });

      // Build a non-realtime session: OpenAI STT, OpenAI TTS, OpenAI LLM
      const session = new voice.AgentSession({
        vad,
        stt: new openai.STT(),
        tts: new openai.TTS({ model: "gpt-4o-mini-tts", voice: "nova"}),
        llm: new openai.LLM({ model: 'gpt-4o-mini', temperature: 0.7 }),
        // turnDetection: new livekit.turnDetector.MultilingualModel(),
      });

      // Connect to the room first
      await ctx.connect();
      console.log(`Agent connected to room: ${ctx.room.name}`);

      // Start the session with the room and agent
      await session.start({
        room: ctx.room,
        agent,
        inputOptions: {
          noiseCancellation: BackgroundVoiceCancellation(),
        },
      });
      console.log('Agent session started successfully');

      // Wait for participant to join before greeting
      console.log('Waiting for participant to join...');
      const participant = await ctx.waitForParticipant();
      console.log(`Participant joined: ${participant.identity}`);

      // Now greet the participant who is actually present
      // This ensures the greeting is delivered to someone who can hear it
      const handle = session.generateReply({
        instructions: 'Introduce yourself as Jane, greet the user warmly and offer your assistance.',
      });
      
      // Wait for the greeting to complete before continuing
      await handle.waitForPlayout();
      console.log('Greeting delivered successfully');

    } catch (error) {
      console.error('Error in agent entry:', error);
      
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

// Start the worker process with explicit agent name for better dispatch control
cli.runApp(new WorkerOptions({ 
  agent: fileURLToPath(import.meta.url), 
  agentName: 'jane' 
}));