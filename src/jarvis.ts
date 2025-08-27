// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import { type JobContext, WorkerOptions, cli, defineAgent, llm, multimodal } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load local env like the primary agent
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();

    console.log('waiting for participant');
    const participant = await ctx.waitForParticipant();
    console.log(`starting jarvis realtime agent for ${participant.identity}`);

    let model: openai.realtime.RealtimeModel;

    if (process.env.AZURE_OPENAI_ENDPOINT) {
      model = openai.realtime.RealtimeModel.withAzure({
        baseURL: process.env.AZURE_OPENAI_ENDPOINT,
        azureDeployment: process.env.AZURE_OPENAI_DEPLOYMENT || '',
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        entraToken: process.env.AZURE_OPENAI_ENTRA_TOKEN,
        instructions: 'You are Jarvis, a helpful, concise assistant.',
      });
    } else {
      model = new openai.realtime.RealtimeModel({
        instructions: 'You are Jarvis, a helpful, concise assistant.',
      });
    }

    // Example tool for demo purposes
    const fncCtx: llm.FunctionContext = {
      weather: {
        description: 'Get the weather in a location',
        parameters: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => {
          console.debug(`executing weather function for ${location}`);
          const response = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=%C+%t`);
          if (!response.ok) {
            throw new Error(`Weather API returned status: ${response.status}`);
          }
          const weather = await response.text();
          return `The weather in ${location} right now is ${weather}.`;
        },
      },
    };

    const agent = new multimodal.MultimodalAgent({
      model,
      fncCtx,
    });

    const session = await agent
      .start(ctx.room, participant)
      .then((s) => s as openai.realtime.RealtimeSession);

    // Kick off an initial assistant message
    session.conversation.item.create(
      llm.ChatMessage.create({
        role: llm.ChatRole.USER,
        text: 'Say "Hello! My name is Jarvis, and I\'ll like to be your AI assistant for today. How can I help you?"',
      }),
    );
    session.response.create();
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url), agentName: 'jarvis' }));
