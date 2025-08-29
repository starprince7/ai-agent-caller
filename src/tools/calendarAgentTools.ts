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
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
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
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  execute: async () => {
    const cal = await getPrimaryCalendar(DEMO_USER_ID);
    if (!cal) return 'Primary calendar not found.';
    const tz = cal.timeZone ? ` [${cal.timeZone}]` : '';
    return `Primary calendar: ${cal.summary} (${cal.id})${tz}`;
  },
} as const;

export const set_working_hours = {
  description: 'Set preferred working hours for the configured demo user',
  parameters: {
    type: "object",
    properties: {
      days: {
        type: "array",
        items: { type: "string" },
        description: 'Days of week as strings: "0".."6" (Sun..Sat) or day names like Monday'
      },
      start: {
        type: "string",
        description: "Start time in HH:mm, e.g., 09:00"
      },
      end: {
        type: "string",
        description: "End time in HH:mm, e.g., 17:30"
      },
      timeZone: {
        type: "string",
        description: "IANA time zone, e.g., Europe/London"
      }
    },
    required: ["days", "start", "end"],
    additionalProperties: false,
  },
  execute: async ({ days, start, end, timeZone }: { days: string[]; start: string; end: string; timeZone?: string }) => {
    await setWorkingHours(DEMO_USER_ID, { days, start, end, timeZone });
    return `Saved working hours: days=${JSON.stringify(days)} ${start}-${end}${timeZone ? ` ${timeZone}` : ''}`;
  },
} as const;

export const create_event = {
  description: 'Create a calendar event on the primary calendar',
  parameters: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Event title/summary"
      },
      date: {
        type: "string",
        description: "YYYY-MM-DD"
      },
      start: {
        type: "string",
        description: "HH:mm"
      },
      end: {
        type: "string",
        description: "HH:mm"
      },
      timeZone: {
        type: "string",
        description: "IANA time zone"
      },
      description: {
        type: "string",
        description: "Event description"
      },
      attendees: {
        type: "array",
        items: {
          type: "object",
          properties: {
            email: { type: "string", format: "email" },
            displayName: { type: "string" }
          },
          required: ["email"],
          additionalProperties: false
        },
        description: "List of attendees"
      }
    },
    required: ["summary", "date", "start", "end"],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const ev = await createEvent(DEMO_USER_ID, args);
    return `Created event ${ev.id} from ${ev.start} to ${ev.end}${ev.timeZone ? ` (${ev.timeZone})` : ''}`;
  },
} as const;

export const cancel_event = {
  description: 'Cancel a calendar event by ID on the primary calendar',
  parameters: {
    type: "object",
    properties: {
      eventId: {
        type: "string",
        description: "ID of the event to cancel"
      }
    },
    required: ["eventId"],
    additionalProperties: false,
  },
  execute: async ({ eventId }: { eventId: string }) => {
    await cancelEvent(DEMO_USER_ID, { eventId });
    return `Cancelled event ${eventId}`;
  },
} as const;

export const reschedule_event = {
  description: 'Reschedule a calendar event by ID',
  parameters: {
    type: "object",
    properties: {
      eventId: {
        type: "string",
        description: "ID of the event to reschedule"
      },
      newDate: {
        type: "string",
        description: "YYYY-MM-DD"
      },
      newStart: {
        type: "string",
        description: "HH:mm"
      },
      newEnd: {
        type: "string",
        description: "HH:mm"
      },
      timeZone: {
        type: "string",
        description: "IANA time zone"
      }
    },
    required: ["eventId", "newDate", "newStart", "newEnd"],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const ev = await rescheduleEvent(DEMO_USER_ID, args);
    return `Rescheduled event ${ev.id} to ${ev.start} - ${ev.end}${ev.timeZone ? ` (${ev.timeZone})` : ''}`;
  },
} as const;

export const find_free_slots = {
  description: 'Find free time slots on a date within working hours',
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "YYYY-MM-DD"
      },
      durationMins: {
        type: "integer",
        minimum: 1,
        description: "Duration in minutes"
      },
      timeZone: {
        type: "string",
        description: "IANA time zone"
      }
    },
    required: ["date", "durationMins"],
    additionalProperties: false,
  },
  execute: async (args: any) => {
    const slots = await findFreeSlots(DEMO_USER_ID, args);
    if (!slots.length) return 'No free slots found in your working hours.';
    const lines = slots.map((s) => `- ${s.start} to ${s.end}${s.timeZone ? ` (${s.timeZone})` : ''}`);
    return `Free slots:\n${lines.join('\n')}`;
  },
} as const;