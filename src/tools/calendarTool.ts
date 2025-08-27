import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { DateTime, IANAZone } from 'luxon';
import { withBackoff } from '../utils/retry.js';
import { saveRefreshToken, getRefreshToken } from '../store/tokenStore.js';
import { setWorkingHoursPref, WorkingHours, getWorkingHoursPref } from '../store/prefsStore.js';
import { generateCodeVerifier, challengeFromVerifier } from '../auth/pkce.js';

// Scopes: least-privilege
// - calendar.readonly (read calendars)
// - calendar.events (manage events if needed later)
export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

function getEnv(name: string, optional = false): string | undefined {
  const v = process.env[name];
  if (!v && !optional) throw new Error(`${name} is required`);
  return v;
}

function buildOAuthClient(): OAuth2Client {
  const clientId = getEnv('GOOGLE_CLIENT_ID')!;
  const clientSecret = getEnv('GOOGLE_CLIENT_SECRET')
  const redirectUri = getEnv('GOOGLE_REDIRECT_URI')!; // e.g., http://localhost:3000/oauth2/callback
  const client = new OAuth2Client({ clientId, clientSecret, redirectUri });
  return client;
}

export type AuthStart = {
  url: string;
  codeVerifier: string; // caller must store temporarily tied to user session/state
  state: string; // opaque state recommended
};

export function getAuthorizationUrl(state: string): AuthStart {
  const oauth2Client = buildOAuthClient();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = challengeFromVerifier(codeVerifier);

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: CALENDAR_SCOPES,
    prompt: 'consent', // ensure refresh_token on re-consent
    include_granted_scopes: true,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  } as any);

  return { url, codeVerifier, state };
}

export async function handleOAuthCallback(userId: string, code: string, codeVerifier: string): Promise<void> {
  const oauth2Client = buildOAuthClient();
  const { tokens } = await oauth2Client.getToken({ code, codeVerifier });
  if (!tokens.refresh_token) {
    throw new Error('No refresh_token received. Ensure prompt=consent and access_type=offline.');
  }
  await saveRefreshToken(userId, tokens.refresh_token);
}

async function getAuthorizedClient(userId: string): Promise<OAuth2Client> {
  const envRt = process.env.GOOGLE_REFRESH_TOKEN;
  const refreshToken = envRt || (await getRefreshToken(userId));
  if (!refreshToken) throw new Error('User not authorized with Google Calendar');
  const client = buildOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

function normalizeIana(zone?: string | null): string | undefined {
  if (!zone) return undefined;
  if (IANAZone.isValidZone(zone)) return zone;
  // Fallback: try to map common aliases. If invalid, omit.
  try {
    const dt = DateTime.now().setZone(zone);
    if (dt.isValid) return dt.zoneName;
  } catch {}  
  return undefined;
}

// Public API
export async function listCalendars(
  userId: string,
): Promise<Array<{ id: string; summary: string; primary?: boolean; timeZone?: string }>> {
  const client = await getAuthorizedClient(userId);
  const calendar = google.calendar({ version: 'v3', auth: client });

  const res = (await withBackoff(() => calendar.calendarList.list())) as calendar_v3.Schema$CalendarList;
  const items: calendar_v3.Schema$CalendarListEntry[] = (res as any).data?.items ?? [];
  return items
    .filter((c: calendar_v3.Schema$CalendarListEntry) => !!c.id)
    .map((c: calendar_v3.Schema$CalendarListEntry) => ({
      id: c.id as string,
      summary: c.summary || '',
      primary: Boolean(c.primary),
      timeZone: normalizeIana(c.timeZone) || undefined,
    }));
}

export async function getPrimaryCalendar(userId: string): Promise<{ id: string; summary: string; timeZone?: string } | null> {
  const cals = await listCalendars(userId);
  const primary = cals.find((c) => c.primary) ?? cals.find((c) => c.id === 'primary');
  if (!primary) return null;
  return { id: primary.id, summary: primary.summary, timeZone: primary.timeZone };
}

export async function setWorkingHours(userId: string, input: WorkingHours): Promise<void> {
  // Validate IANA time zone if provided
  const tz = input.timeZone ? normalizeIana(input.timeZone) : undefined;
  const sanitized: WorkingHours = {
    days: input.days,
    start: input.start,
    end: input.end,
    timeZone: tz,
  };
  await setWorkingHoursPref(userId, sanitized);
}

async function getPrimaryCalendarId(userId: string): Promise<string> {
  const cal = await getPrimaryCalendar(userId);
  if (!cal) throw new Error('Primary calendar not found');
  return cal.id;
}

// Create an event on the user's primary calendar
export async function createEvent(userId: string, input: {
  summary: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm
  end: string;   // HH:mm
  timeZone?: string; // IANA
  description?: string;
  attendees?: Array<{ email: string; displayName?: string }>;
}): Promise<{ id: string; htmlLink?: string; start: string; end: string; timeZone?: string } > {
  const client = await getAuthorizedClient(userId);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const calId = await getPrimaryCalendarId(userId);

  const tz = normalizeIana(input.timeZone) || (await getPrimaryCalendar(userId))?.timeZone;
  const start = DateTime.fromISO(`${input.date}T${input.start}`, { zone: tz || 'UTC' });
  const end = DateTime.fromISO(`${input.date}T${input.end}`, { zone: tz || 'UTC' });
  if (!start.isValid || !end.isValid || end <= start) {
    throw new Error('Invalid start/end');
  }

  const event: calendar_v3.Schema$Event = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: start.toISO(), timeZone: tz },
    end: { dateTime: end.toISO(), timeZone: tz },
    attendees: input.attendees?.map((a) => ({ email: a.email, displayName: a.displayName })),
  };

  const res = await withBackoff(() => calendar.events.insert({ calendarId: calId, requestBody: event }));
  const ev = (res as any).data as calendar_v3.Schema$Event;
  const outTz = normalizeIana(ev.start?.timeZone || tz) || undefined;
  const s = ev.start?.dateTime ? DateTime.fromISO(ev.start.dateTime).setZone(outTz || 'UTC').toISO()! : '';
  const e = ev.end?.dateTime ? DateTime.fromISO(ev.end.dateTime).setZone(outTz || 'UTC').toISO()! : '';
  return { id: ev.id!, htmlLink: ev.htmlLink || undefined, start: s, end: e, timeZone: outTz };
}

export async function cancelEvent(userId: string, input: { eventId: string }): Promise<void> {
  const client = await getAuthorizedClient(userId);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const calId = await getPrimaryCalendarId(userId);
  await withBackoff(() => calendar.events.delete({ calendarId: calId, eventId: input.eventId }));
}

export async function rescheduleEvent(userId: string, input: {
  eventId: string;
  newDate: string; // YYYY-MM-DD
  newStart: string; // HH:mm
  newEnd: string;   // HH:mm
  timeZone?: string;
}): Promise<{ id: string; start: string; end: string; timeZone?: string } > {
  const client = await getAuthorizedClient(userId);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const calId = await getPrimaryCalendarId(userId);
  const tz = normalizeIana(input.timeZone) || (await getPrimaryCalendar(userId))?.timeZone;
  const start = DateTime.fromISO(`${input.newDate}T${input.newStart}`, { zone: tz || 'UTC' });
  const end = DateTime.fromISO(`${input.newDate}T${input.newEnd}`, { zone: tz || 'UTC' });
  if (!start.isValid || !end.isValid || end <= start) {
    throw new Error('Invalid new start/end');
  }
  const patch: calendar_v3.Schema$Event = {
    start: { dateTime: start.toISO(), timeZone: tz },
    end: { dateTime: end.toISO(), timeZone: tz },
  };
  const res = await withBackoff(() => calendar.events.patch({ calendarId: calId, eventId: input.eventId, requestBody: patch }));
  const ev = (res as any).data as calendar_v3.Schema$Event;
  const outTz = normalizeIana(ev.start?.timeZone || tz) || undefined;
  const s = ev.start?.dateTime ? DateTime.fromISO(ev.start.dateTime).setZone(outTz || 'UTC').toISO()! : '';
  const e = ev.end?.dateTime ? DateTime.fromISO(ev.end.dateTime).setZone(outTz || 'UTC').toISO()! : '';
  return { id: ev.id!, start: s, end: e, timeZone: outTz };
}

// Find free slots on a date within working hours
export async function findFreeSlots(userId: string, input: { date: string; durationMins: number; timeZone?: string }): Promise<Array<{ start: string; end: string; timeZone?: string }>> {
  const client = await getAuthorizedClient(userId);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const calId = await getPrimaryCalendarId(userId);

  const primary = await getPrimaryCalendar(userId);
  const tz = normalizeIana(input.timeZone) || primary?.timeZone || 'UTC';

  // Working hours: fallback to 09:00-17:00 if not set
  const wh = await getWorkingHoursPref(userId);
  const startStr = wh?.start ?? '09:00';
  const endStr = wh?.end ?? '17:00';

  const dayStart = DateTime.fromISO(`${input.date}T${startStr}`, { zone: tz });
  const dayEnd = DateTime.fromISO(`${input.date}T${endStr}`, { zone: tz });
  const timeMin = dayStart.toISO();
  const timeMax = dayEnd.toISO();

  // Get events for the date
  const listParams: calendar_v3.Params$Resource$Events$List = {
    calendarId: calId,
    singleEvents: true,
    orderBy: 'startTime',
    timeMin: timeMin ?? undefined,
    timeMax: timeMax ?? undefined,
  };
  const res = await withBackoff(() => calendar.events.list(listParams));
  const events: calendar_v3.Schema$Event[] = ((res as any).data?.items ?? []).filter((e: calendar_v3.Schema$Event) => e.start?.dateTime && e.end?.dateTime);
  const busy = events.map((e) => ({
    s: DateTime.fromISO(e.start!.dateTime!, { zone: tz }),
    e: DateTime.fromISO(e.end!.dateTime!, { zone: tz }),
  }));

  // Build free slots
  const slots: Array<{ start: string; end: string; timeZone?: string }> = [];
  let cursor = dayStart;
  const dur = { minutes: input.durationMins } as const;
  for (const b of busy) {
    if (cursor < b.s) {
      const maybeEnd = cursor.plus(dur);
      if (maybeEnd <= b.s && maybeEnd <= dayEnd) {
        slots.push({ start: cursor.toISO()!, end: maybeEnd.toISO()!, timeZone: tz });
      }
    }
    if (cursor < b.e) cursor = b.e;
  }
  // tail
  if (cursor < dayEnd) {
    const maybeEnd = cursor.plus(dur);
    if (maybeEnd <= dayEnd) {
      slots.push({ start: cursor.toISO()!, end: maybeEnd.toISO()!, timeZone: tz });
    }
  }

  return slots;
}
