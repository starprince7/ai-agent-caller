import { z } from 'zod';
import {
  getPrimaryCalendar,
  listCalendars,
  setWorkingHours,
  createEvent,
  cancelEvent,
  rescheduleEvent,
  findFreeSlots,
} from './calendarTool.js';

const DEMO_USER_ID = process.env.DEMO_USER_ID ?? 'demo-user';

export const get_calendars = {
  type: 'function',
  description: 'List all calendars for the configured demo user',
  parameters: z.object({}),
  execute: async () => {
    const cals = await listCalendars(DEMO_USER_ID);
    if (!cals.length) return 'No calendars found.';
    const lines = cals.map((c) => {
      const parts = [c.summary || c.id];
      if (c.primary) parts.push('(primary)');
      if (c.timeZone) parts.push(`[${c.timeZone}]`);
      return `- ${parts.join(' ')}`;
    });
    return `Your calendars:\n${lines.join('\n')}`;
  },
} as const;

export const get_primary_calendar = {
  description: 'Get primary calendar metadata for the configured demo user',
  parameters: z.object({}),
  execute: async () => {
    const cal = await getPrimaryCalendar(DEMO_USER_ID);
    if (!cal) return 'Primary calendar not found.';
    const tz = cal.timeZone ? ` [${cal.timeZone}]` : '';
    return `Primary calendar: ${cal.summary} (${cal.id})${tz}`;
  },
} as const;

export const set_working_hours = {
  description: 'Set preferred working hours for the configured demo user',
  parameters: z.object({
    days: z.array(z.string()).describe('Days of week as strings: "0".."6" (Sun..Sat) or day names like Monday'),
    start: z.string().describe('Start time in HH:mm, e.g., 09:00'),
    end: z.string().describe('End time in HH:mm, e.g., 17:30'),
    timeZone: z.string().optional().describe('IANA time zone, e.g., Europe/London'),
  }),
  execute: async ({ days, start, end, timeZone }: { days: string[]; start: string; end: string; timeZone?: string }) => {
    await setWorkingHours(DEMO_USER_ID, { days, start, end, timeZone });
    return `Saved working hours: days=${JSON.stringify(days)} ${start}-${end}${timeZone ? ` ${timeZone}` : ''}`;
  },
} as const;

export const create_event = {
  description: 'Create a calendar event on the primary calendar',
  parameters: z.object({
    summary: z.string(),
    date: z.string().describe('YYYY-MM-DD'),
    start: z.string().describe('HH:mm'),
    end: z.string().describe('HH:mm'),
    timeZone: z.string().optional().describe('IANA time zone'),
    description: z.string().optional(),
    attendees: z.array(z.object({ email: z.string().email(), displayName: z.string().optional() })).optional(),
  }),
  execute: async (args: any) => {
    const ev = await createEvent(DEMO_USER_ID, args);
    return `Created event ${ev.id} from ${ev.start} to ${ev.end}${ev.timeZone ? ` (${ev.timeZone})` : ''}`;
  },
} as const;

export const cancel_event = {
  description: 'Cancel a calendar event by ID on the primary calendar',
  parameters: z.object({ eventId: z.string() }),
  execute: async ({ eventId }: { eventId: string }) => {
    await cancelEvent(DEMO_USER_ID, { eventId });
    return `Cancelled event ${eventId}`;
  },
} as const;

export const reschedule_event = {
  description: 'Reschedule a calendar event by ID',
  parameters: z.object({
    eventId: z.string(),
    newDate: z.string().describe('YYYY-MM-DD'),
    newStart: z.string().describe('HH:mm'),
    newEnd: z.string().describe('HH:mm'),
    timeZone: z.string().optional(),
  }),
  execute: async (args: any) => {
    const ev = await rescheduleEvent(DEMO_USER_ID, args);
    return `Rescheduled event ${ev.id} to ${ev.start} - ${ev.end}${ev.timeZone ? ` (${ev.timeZone})` : ''}`;
  },
} as const;

export const find_free_slots = {
  description: 'Find free time slots on a date within working hours',
  parameters: z.object({
    date: z.string().describe('YYYY-MM-DD'),
    durationMins: z.number().int().positive(),
    timeZone: z.string().optional(),
  }),
  execute: async (args: any) => {
    const slots = await findFreeSlots(DEMO_USER_ID, args);
    if (!slots.length) return 'No free slots found in your working hours.';
    const lines = slots.map((s) => `- ${s.start} to ${s.end}${s.timeZone ? ` (${s.timeZone})` : ''}`);
    return `Free slots:\n${lines.join('\n')}`;
  },
} as const;
