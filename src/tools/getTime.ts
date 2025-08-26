import { z } from 'zod';

export const getTime = {
  description: 'Get the current time',
  parameters: z.object({}),
  execute: async () => {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    return `The current time is ${timeString}`;
  },
} as const;
