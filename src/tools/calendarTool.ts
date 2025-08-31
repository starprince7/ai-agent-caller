import { google, calendar_v3 } from 'googleapis';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { DateTime, IANAZone } from 'luxon';
import { withBackoff } from '../utils/retry.js';
import { saveRefreshToken, getRefreshToken } from '../store/tokenStore.js';
import { setWorkingHoursPref, WorkingHours, getWorkingHoursPref } from '../store/prefsStore.js';
import { generateCodeVerifier, challengeFromVerifier } from '../auth/pkce.js';
import path from 'node:path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../../.env.local');
dotenv.config({ path: envPath });

// Scopes: least-privilege
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
  const clientSecret = getEnv('GOOGLE_CLIENT_SECRET');
  const redirectUri = getEnv('GOOGLE_REDIRECT_URI')!;

  console.log('OAuth Client Config:', {
    clientId: clientId?.substring(0, 20) + '...',
    hasClientSecret: !!clientSecret,
    redirectUri: redirectUri
  });

  return new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri,
  });
}

export type AuthStart = {
  url: string;
  codeVerifier: string;
  state: string;
};

export function getAuthorizationUrl(state: string): AuthStart {
  const oauth2Client = buildOAuthClient();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = challengeFromVerifier(codeVerifier);

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: CALENDAR_SCOPES,
    prompt: 'consent',
    include_granted_scopes: true,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    state,
  });

  return { url, codeVerifier, state };
}

export async function handleOAuthCallback(userId: string, code: string, codeVerifier: string): Promise<void> {
  const oauth2Client = buildOAuthClient();

  try {
    console.log('Exchanging authorization code for tokens...');
    const { tokens } = await oauth2Client.getToken({
      code,
      codeVerifier,
    });

    console.log('Received tokens:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      tokenType: tokens.token_type,
      scope: tokens.scope
    });

    if (!tokens.refresh_token) {
      throw new Error('No refresh_token received. Ensure prompt=consent and access_type=offline.');
    }

    console.log('Refresh token to be encrypted and saved:', tokens.refresh_token)
    await saveRefreshToken(userId, tokens.refresh_token);
    console.log('Successfully encrypted and saved refresh token for user:', userId);

  } catch (error: any) {
    console.error('OAuth callback error:', error);
    throw new Error(`Failed to handle OAuth callback: ${error?.message || 'Unknown error'}`);
  }
}

// Add debugging utility functions
export function isReauthRequired(error: any): boolean {
  const message = error?.message?.toLowerCase() || '';
  return (
    message.includes('invalid_grant') ||
    message.includes('reauth_required') ||
    message.includes('token has been expired') ||
    message.includes('token has been revoked') ||
    error?.code === 'invalid_grant'
  );
}

export async function clearUserTokens(userId: string): Promise<void> {
  try {
    await saveRefreshToken(userId, '');
    console.log('Cleared tokens for user:', userId);
  } catch (error) {
    console.error('Failed to clear tokens:', error);
  }
}

export async function getAuthorizedClient(userId: string): Promise<OAuth2Client> {
  const envRt = process.env.GOOGLE_REFRESH_TOKEN;

  // Check for whitespace issues that commonly cause invalid_grant
  const cleanedEnvRt = envRt?.trim();
  if (envRt && envRt !== cleanedEnvRt) {
    console.warn('⚠️  WARNING: Refresh token has leading/trailing whitespace - this causes invalid_grant errors');
    console.log('Original length:', envRt.length, 'Cleaned length:', cleanedEnvRt?.length);
  }

  const refreshToken = cleanedEnvRt || (await getRefreshToken(userId));

  if (!refreshToken) {
    throw new Error('User not authorized with Google Calendar. Please re-authenticate.');
  }

  if (refreshToken.length < 50) {
    throw new Error('Refresh token appears to be too short - it may be corrupted');
  }

  const client = buildOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });

  // Test the credentials by making a simple API call
  try {
    console.log('🔄 Testing refresh token validity with Google...');
    const tokenInfo = await client.getAccessToken();
    console.log('✅ Successfully obtained access token');
    console.log('  - Access token length:', tokenInfo.token?.length || 0);
    console.log('  - Token type:', typeof tokenInfo.token);
    return client;
  } catch (error: any) {
    console.error('❌ Failed to get access token');
    console.error('Full error object:', JSON.stringify(error, null, 2));
    console.error('Error response data:', error.response?.data);

    // Detailed error analysis
    if (error?.message?.includes('invalid_grant')) {
      console.error('🚨 INVALID_GRANT ERROR ANALYSIS:');
      console.error('  - This means Google rejected your refresh token');
    }

    throw new Error(`Authentication failed: ${error?.message || 'Unknown error'}. Please try re-authenticating.`);
  }
}

export function normalizeIana(zone?: string | null): string | undefined {
  if (!zone) return undefined;
  if (IANAZone.isValidZone(zone)) return zone;

  // Common timezone mappings
  const timezoneMap: Record<string, string> = {
    'EST': 'America/New_York',
    'PST': 'America/Los_Angeles',
    'GMT': 'UTC',
    'BST': 'Europe/London',
    'CET': 'Europe/Paris',
  };

  if (timezoneMap[zone]) return timezoneMap[zone];

  try {
    const dt = DateTime.now().setZone(zone);
    if (dt.isValid) return dt.zoneName;
  } catch {
    // Ignore errors and return undefined
  }

  return undefined;
}

export async function listCalendars(
  userId: string,
): Promise<Array<{ id: string; summary: string; primary?: boolean; timeZone?: string }>> {
  const client = await getAuthorizedClient(userId);
  const calendar = google.calendar({ version: 'v3', auth: client });

  try {
    const response = await withBackoff(() => calendar.calendarList.list());
    const items = response.data?.items || [];

    return items
      .filter((c) => c.id)
      .map((c) => ({
        id: c.id!,
        summary: c.summary || 'Untitled Calendar',
        primary: Boolean(c.primary),
        timeZone: normalizeIana(c.timeZone),
      }));
  } catch (error: any) {
    console.error('Error listing calendars:', error);
    throw new Error(`Failed to list calendars: ${error?.message || 'Unknown error'}`);
  }
}

export async function getPrimaryCalendar(userId: string): Promise<{ id: string; summary: string; timeZone?: string } | null> {
  try {
    const cals = await listCalendars(userId);
    const primary = cals.find((c) => c.primary) || cals.find((c) => c.id === 'primary');

    if (!primary) return null;

    return {
      id: primary.id,
      summary: primary.summary,
      timeZone: primary.timeZone,
    };
  } catch (error: any) {
    console.error('Error getting primary calendar:', error);
    return null;
  }
}

export async function setWorkingHours(userId: string, input: WorkingHours): Promise<void> {
  const tz = input.timeZone ? normalizeIana(input.timeZone) : undefined;
  const sanitized: WorkingHours = {
    days: input.days,
    start: input.start,
    end: input.end,
    timeZone: tz,
  };
  await setWorkingHoursPref(userId, sanitized);
}

export async function getPrimaryCalendarId(userId: string): Promise<string> {
  const cal = await getPrimaryCalendar(userId);
  if (!cal) throw new Error('Primary calendar not found');
  return cal.id;
}

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
        sendNotifications: true,
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

export async function cancelEvent(userId: string, input: { eventId: string }): Promise<void> {
  if (!input.eventId?.trim()) {
    throw new Error('Event ID is required');
  }

  const client = await getAuthorizedClient(userId);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const calId = await getPrimaryCalendarId(userId);

  try {
    await withBackoff(() =>
      calendar.events.delete({
        calendarId: calId,
        eventId: input.eventId,
        sendNotifications: true,
      })
    );
  } catch (error: any) {
    console.error('Error canceling event:', error);
    throw new Error(`Failed to cancel event: ${error?.message || 'Unknown error'}`);
  }
}

export async function rescheduleEvent(userId: string, input: {
  eventId: string;
  newDate: string; // YYYY-MM-DD
  newStart: string; // HH:mm
  newEnd: string;   // HH:mm
  timeZone?: string;
}): Promise<{ id: string; start: string; end: string; timeZone?: string }> {

  // Input validation
  if (!input.eventId?.trim()) {
    throw new Error('Event ID is required');
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.newDate)) {
    throw new Error('Date must be in YYYY-MM-DD format');
  }

  if (!/^\d{2}:\d{2}$/.test(input.newStart) || !/^\d{2}:\d{2}$/.test(input.newEnd)) {
    throw new Error('Time must be in HH:mm format');
  }

  const client = await getAuthorizedClient(userId);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const calId = await getPrimaryCalendarId(userId);

  const primaryCal = await getPrimaryCalendar(userId);
  const tz = normalizeIana(input.timeZone) || primaryCal?.timeZone || 'UTC';

  const start = DateTime.fromISO(`${input.newDate}T${input.newStart}:00`, { zone: tz });
  const end = DateTime.fromISO(`${input.newDate}T${input.newEnd}:00`, { zone: tz });

  if (!start.isValid || !end.isValid) {
    throw new Error('Invalid new start/end time');
  }

  if (end <= start) {
    throw new Error('New end time must be after start time');
  }

  const patch: calendar_v3.Schema$Event = {
    start: {
      dateTime: start.toISO(),
      timeZone: tz
    },
    end: {
      dateTime: end.toISO(),
      timeZone: tz
    },
  };

  try {
    const response = await withBackoff(() =>
      calendar.events.patch({
        calendarId: calId,
        eventId: input.eventId,
        requestBody: patch,
        sendNotifications: true,
      })
    );

    const updatedEvent = response.data;
    if (!updatedEvent.id) {
      throw new Error('Event rescheduling failed');
    }

    const resultTz = normalizeIana(updatedEvent.start?.timeZone || tz) || 'UTC';

    return {
      id: updatedEvent.id,
      start: updatedEvent.start?.dateTime
        ? DateTime.fromISO(updatedEvent.start.dateTime).setZone(resultTz).toISO()!
        : start.toISO()!,
      end: updatedEvent.end?.dateTime
        ? DateTime.fromISO(updatedEvent.end.dateTime).setZone(resultTz).toISO()!
        : end.toISO()!,
      timeZone: resultTz,
    };
  } catch (error: any) {
    console.error('Error rescheduling event:', error);
    throw new Error(`Failed to reschedule event: ${error?.message || 'Unknown error'}`);
  }
}

export async function findFreeSlots(userId: string, input: {
  date: string;
  durationMins: number;
  timeZone?: string
}): Promise<Array<{ start: string; end: string; timeZone?: string }>> {

  // Input validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new Error('Date must be in YYYY-MM-DD format');
  }

  if (input.durationMins <= 0 || input.durationMins > 1440) { // max 24 hours
    throw new Error('Duration must be between 1 and 1440 minutes');
  }

  const client = await getAuthorizedClient(userId);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const calId = await getPrimaryCalendarId(userId);

  const primary = await getPrimaryCalendar(userId);
  const tz = normalizeIana(input.timeZone) || primary?.timeZone || 'UTC';

  // Get working hours with better defaults
  const wh = await getWorkingHoursPref(userId);
  const startStr = wh?.start ?? '09:00';
  const endStr = wh?.end ?? '17:00';

  const dayStart = DateTime.fromISO(`${input.date}T${startStr}:00`, { zone: tz });
  const dayEnd = DateTime.fromISO(`${input.date}T${endStr}:00`, { zone: tz });

  if (!dayStart.isValid || !dayEnd.isValid) {
    throw new Error(`Invalid working hours or timezone: ${startStr}-${endStr} in ${tz}`);
  }

  if (dayEnd <= dayStart) {
    throw new Error('Working hours end time must be after start time');
  }

  try {
    // Get events for the day with proper date range
    const response = await withBackoff(() =>
      calendar.events.list({
        calendarId: calId,
        singleEvents: true,
        orderBy: 'startTime',
        timeMin: dayStart.toISO(),
        timeMax: dayEnd.toISO(),
        maxResults: 250,
      })
    );

    const events = (response.data?.items || [])
      .filter((e) => e.start?.dateTime && e.end?.dateTime && e.status !== 'cancelled')
      .map((e) => ({
        start: DateTime.fromISO(e.start!.dateTime!, { zone: tz }),
        end: DateTime.fromISO(e.end!.dateTime!, { zone: tz }),
      }))
      .filter((e) => e.start.isValid && e.end.isValid)
      .sort((a, b) => a.start.toMillis() - b.start.toMillis());

    // Find free slots
    const slots: Array<{ start: string; end: string; timeZone?: string }> = [];
    let cursor = dayStart;
    const durationMs = input.durationMins * 60 * 1000;

    for (const event of events) {
      // Check if there's a gap before this event
      if (cursor < event.start) {
        const availableMs = event.start.toMillis() - cursor.toMillis();
        if (availableMs >= durationMs) {
          const slotEnd = cursor.plus({ minutes: input.durationMins });
          if (slotEnd <= event.start && slotEnd <= dayEnd) {
            slots.push({
              start: cursor.toISO()!,
              end: slotEnd.toISO()!,
              timeZone: tz,
            });
          }
        }
      }

      // Move cursor to end of current event
      if (cursor < event.end) {
        cursor = event.end as any;
      }
    }

    // Check for slot after the last event
    if (cursor < dayEnd) {
      const availableMs = dayEnd.toMillis() - cursor.toMillis();
      if (availableMs >= durationMs) {
        const slotEnd = cursor.plus({ minutes: input.durationMins });
        if (slotEnd <= dayEnd) {
          slots.push({
            start: cursor.toISO()!,
            end: slotEnd.toISO()!,
            timeZone: tz,
          });
        }
      }
    }

    return slots;
  } catch (error: any) {
    console.error('Error finding free slots:', error);
    throw new Error(`Failed to find free slots: ${error?.message || 'Unknown error'}`);
  }
}