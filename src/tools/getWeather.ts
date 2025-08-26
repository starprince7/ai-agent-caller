import { z } from 'zod';

export const getWeather = {
  description: 'Get current weather information for any location',
  parameters: z.object({
    location: z.string().describe('The city, state, or country to get weather for'),
  }),
  execute: async ({ location }: { location: string }) => {
    console.log(`Fetching weather for: ${location}`);
    try {
      const response = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=%C+%t+%h+%w`);
      if (!response.ok) {
        throw new Error(`Weather API returned status: ${response.status}`);
      }
      const weather = await response.text().then((text) => text.trim());
      return `Current weather in ${location}: ${weather}`;
    } catch (error) {
      console.error(`Failed to fetch weather for ${location}:`, error);
      return `I'm sorry, I couldn't get the weather information for ${location} right now. Please try again later.`;
    }
  },
} as const;
