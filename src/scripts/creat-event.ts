import { google, calendar_v3 } from "googleapis";
import { getAuthorizedClient, getPrimaryCalendar, getPrimaryCalendarId, normalizeIana } from '../tools/calendarTool.js';
import { DateTime } from "luxon";
import { withBackoff } from "../utils/retry.js";

export async function createEvent(userId: string, input: {
    summary: string;
    date: string; // YYYY-MM-DD
    start: string; // HH:mm
    end: string;   // HH:mm
    timeZone?: string; // IANA
    description?: string;
    attendees?: Array<{ email: string; displayName?: string }>;
}): Promise<{ id: string; htmlLink?: string; start: string; end: string; timeZone?: string }> {

    // Input validation
    if (!input.summary?.trim()) {
        throw new Error('Event summary is required');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        throw new Error('Date must be in YYYY-MM-DD format');
    }

    if (!/^\d{2}:\d{2}$/.test(input.start) || !/^\d{2}:\d{2}$/.test(input.end)) {
        throw new Error('Time must be in HH:mm format');
    }

    const client = await getAuthorizedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: client });
    const calId = await getPrimaryCalendarId(userId);

    const primaryCal = await getPrimaryCalendar(userId);
    const tz = normalizeIana(input.timeZone) || primaryCal?.timeZone || 'UTC';

    const start = DateTime.fromISO(`${input.date}T${input.start}:00`, { zone: tz });
    const end = DateTime.fromISO(`${input.date}T${input.end}:00`, { zone: tz });

    if (!start.isValid) {
        throw new Error(`Invalid start time: ${input.date}T${input.start} in timezone ${tz}`);
    }

    if (!end.isValid) {
        throw new Error(`Invalid end time: ${input.date}T${input.end} in timezone ${tz}`);
    }

    if (end <= start) {
        throw new Error('End time must be after start time');
    }

    const event: calendar_v3.Schema$Event = {
        summary: input.summary.trim(),
        description: input.description?.trim(),
        start: {
            dateTime: start.toISO(),
            timeZone: tz
        },
        end: {
            dateTime: end.toISO(),
            timeZone: tz
        },
        attendees: input.attendees?.map((a) => ({
            email: a.email,
            displayName: a.displayName,
        })),
    };

    try {
        const response = await withBackoff(() =>
            calendar.events.insert({
                calendarId: calId,
                requestBody: event,
                sendNotifications: true, // Send email notifications to attendees
            })
        );

        const createdEvent = response.data;
        if (!createdEvent.id) {
            throw new Error('Event creation failed - no event ID returned');
        }

        const resultTz = normalizeIana(createdEvent.start?.timeZone || tz) || 'UTC';

        return {
            id: createdEvent.id,
            htmlLink: createdEvent.htmlLink || undefined,
            start: createdEvent.start?.dateTime
                ? DateTime.fromISO(createdEvent.start.dateTime).setZone(resultTz).toISO()!
                : start.toISO()!,
            end: createdEvent.end?.dateTime
                ? DateTime.fromISO(createdEvent.end.dateTime).setZone(resultTz).toISO()!
                : end.toISO()!,
            timeZone: resultTz,
        };
    } catch (error: any) {
        console.error('Error creating event:', error);
        throw new Error(`Failed to create event: ${error?.message || 'Unknown error'}`);
    }
}

const input = {
    summary: "Team Sync Meeting",
    date: "2025-09-01",       // YYYY-MM-DD
    start: "10:00",           // HH:mm
    end: "11:00",             // HH:mm
    timeZone: "America/New_York",
    description: "Weekly sync to align on project updates and blockers.",
    attendees: [
        { email: "alice@example.com", displayName: "Alice Johnson" },
        { email: "bob@example.com", displayName: "Bob Smith" },
        { email: "carol@example.com" } // no displayName provided
    ]
};

createEvent("demo-user", input).then((event) => {
    console.log('Event created:', event);
}).catch((error) => {
    console.error('Error creating event:', error);
});
    