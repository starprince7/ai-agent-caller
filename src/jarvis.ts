// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import { type JobContext, WorkerOptions, cli, defineAgent, voice, llm } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import {
  get_calendars,
  get_primary_calendar,
  set_working_hours,
  create_event,
  cancel_event,
  reschedule_event,
  find_free_slots,
} from './tools/calendarAgentTools.js';

// Load local env like the primary agent
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

export default defineAgent({
  entry: async (ctx: JobContext) => {
    // Connect and log room/participant
    await ctx.connect();
    console.log(`Agent connected to room: ${ctx.room.name}`);
    console.log('Waiting for participant to join...');
    const participant = await ctx.waitForParticipant();
    console.log(`Participant joined: ${participant.identity}`);

    // Create the agent definition (personality & behavior)
    const agent = new voice.Agent({
      instructions: 'You are Jarvis, a helpful, concise assistant.',
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

    // Use OpenAI Realtime API only for Jarvis
    let session = new voice.AgentSession({
      llm: process.env.AZURE_OPENAI_ENDPOINT
        ? openai.realtime.RealtimeModel.withAzure({
          baseURL: process.env.AZURE_OPENAI_ENDPOINT,
          azureDeployment: process.env.AZURE_OPENAI_DEPLOYMENT || '',
          apiKey: process.env.AZURE_OPENAI_API_KEY,
          entraToken: process.env.AZURE_OPENAI_ENTRA_TOKEN,
          // You can pick a server-side voice when available
        })
        : new openai.realtime.RealtimeModel({
          // voice: 'echo', // optionally select a server-side voice
        }),
    });

    await session.start({
      room: ctx.room,
      agent,
      inputOptions: {
        noiseCancellation: BackgroundVoiceCancellation(),
      },
    });

    // Have Jarvis greet the user
    const handle = session.generateReply({
      instructions:
        "Say 'Hello! My name is Jarvis, and I would like to be your AI assistant for today. How can I help you?'",
    });
    await handle.waitForPlayout();
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url), agentName: 'jarvis' }));
