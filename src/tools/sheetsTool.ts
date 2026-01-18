import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { getRefreshToken } from '../store/tokenStore.js';
import path from 'node:path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../../.env.local');
dotenv.config({ path: envPath });

// Google Sheets scopes
export const SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
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

  return new OAuth2Client({
    clientId,
    clientSecret,
    redirectUri,
  });
}

async function getAuthorizedClient(userId: string): Promise<OAuth2Client> {
  // Try to get refresh token from environment variable first (useful for Docker)
  const envRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  
  let refreshToken: string | null = null;
  
  if (envRefreshToken) {
    refreshToken = envRefreshToken;
    console.log('Using refresh token from environment variable');
  } else {
    // Fallback to file-based token storage
    try {
      refreshToken = await getRefreshToken(userId);
    } catch (error: any) {
      console.warn('Failed to read refresh token from file storage:', error.message);
      // Continue without throwing - we'll handle this below
    }
  }
  
  if (!refreshToken) {
    throw new Error('No refresh token found. Either run googleAuth script first or set GOOGLE_REFRESH_TOKEN environment variable.');
  }

  const oauth2Client = buildOAuthClient();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return oauth2Client;
}

export interface DentalBookingParams {
  name: string;
  phone: string;
  email: string;
  procedures: string;
  date: string;
  preferredTime: string;
  clinicLocation: string;
  patientType?: string;
}

export interface DermaVixualsBooking {
  name: string;
  phone: string;
  email: string;
  serviceType: string;
  date: string;
  preferredTime: string;
}

/**
 * Write Zoom Dental appointment booking to Google Sheets
 */
export async function writeZoomDentalBooking(
  userId: string,
  booking: DentalBookingParams
): Promise<string> {
  try {
    const auth = await getAuthorizedClient(userId);
    const sheets = google.sheets({ version: 'v4', auth });

    const spreadsheetId = getEnv('ZOOM_DENTAL_SHEET_ID');
    if (!spreadsheetId) {
      throw new Error('ZOOM_DENTAL_SHEET_ID environment variable is not set');
    }

    // Prepare the row data
    const timestamp = new Date().toISOString();
    const values = [
      [
        timestamp,
        'Zoom Dental',
        booking.name,
        booking.phone,
        booking.email,
        booking.procedures,
        booking.date,
        booking.preferredTime,
        booking.clinicLocation,
        booking.patientType || 'new'
      ]
    ];

    // Append the data to the sheet
    const range = 'Sheet1!A:J'; // Adjust sheet name if needed
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    console.log(`Zoom Dental booking written to sheet: ${response.data.updates?.updatedRows} row(s) added`);
    return `Appointment successfully recorded in Zoom Dental booking system for ${booking.name} on ${booking.date} at ${booking.preferredTime}.`;
  } catch (error: any) {
    console.error('Error writing Zoom Dental booking to Google Sheets:', error);
    throw new Error(`Failed to record booking: ${error.message}`);
  }
}

/**
 * Write Hilton Dental appointment booking to Google Sheets
 */
export async function writeHiltonDentalBooking(
  userId: string,
  booking: DentalBookingParams
): Promise<string> {
  try {
    const auth = await getAuthorizedClient(userId);
    const sheets = google.sheets({ version: 'v4', auth });

    const spreadsheetId = getEnv('HILTON_DENTAL_SHEET_ID');
    if (!spreadsheetId) {
      throw new Error('HILTON_DENTAL_SHEET_ID environment variable is not set');
    }

    // Prepare the row data
    const timestamp = new Date().toISOString();
    const values = [
      [
        timestamp,
        'Hilton Dental',
        booking.name,
        booking.phone,
        booking.email,
        booking.procedures,
        booking.date,
        booking.preferredTime,
        booking.clinicLocation,
        booking.patientType || 'new'
      ]
    ];

    // Append the data to the sheet
    const range = 'Sheet1!A:J'; // Adjust sheet name if needed
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    console.log(`Hilton Dental booking written to sheet: ${response.data.updates?.updatedRows} row(s) added`);
    return `Appointment successfully recorded in Hilton Dental booking system for ${booking.name} on ${booking.date} at ${booking.preferredTime}.`;
  } catch (error: any) {
    console.error('Error writing Hilton Dental booking to Google Sheets:', error);
    throw new Error(`Failed to record booking: ${error.message}`);
  }
}

/**
 * Write DermaVixuals appointment booking to Google Sheets
 */
export async function writeDermaVixualsBooking(
  userId: string,
  booking: DermaVixualsBooking
): Promise<string> {
  try {
    const auth = await getAuthorizedClient(userId);
    const sheets = google.sheets({ version: 'v4', auth });

    const spreadsheetId = getEnv('DERMAVIXUALS_SHEET_ID');
    if (!spreadsheetId) {
      throw new Error('DERMAVIXUALS_SHEET_ID environment variable is not set');
    }

    // Prepare the row data
    const timestamp = new Date().toISOString();
    const values = [
      [
        timestamp,
        'DermaVixuals MedSpa',
        booking.name,
        booking.phone,
        booking.email,
        booking.serviceType,
        booking.date,
        booking.preferredTime
      ]
    ];

    // Append the data to the sheet
    const range = 'Sheet1!A:H'; // Adjust sheet name if needed
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values,
      },
    });

    console.log(`DermaVixuals booking written to sheet: ${response.data.updates?.updatedRows} row(s) added`);
    return `Appointment successfully recorded in DermaVixuals booking system for ${booking.name} on ${booking.date} at ${booking.preferredTime}.`;
  } catch (error: any) {
    console.error('Error writing DermaVixuals booking to Google Sheets:', error);
    throw new Error(`Failed to record booking: ${error.message}`);
  }
}

/**
 * Initialize sheet headers (run once per sheet)
 */
export async function initializeZoomDentalSheet(userId: string, spreadsheetId: string): Promise<void> {
  const auth = await getAuthorizedClient(userId);
  const sheets = google.sheets({ version: 'v4', auth });

  const headers = [
    'Timestamp',
    'Business',
    'Name',
    'Phone',
    'Email',
    'Service/Procedure',
    'Date',
    'Time',
    'Location',
    'Patient Type'
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Sheet1!A1:J1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [headers],
    },
  });

  console.log('Zoom Dental sheet headers initialized');
}

/**
 * Initialize sheet headers (run once per sheet)
 */
export async function initializeHiltonDentalSheet(userId: string, spreadsheetId: string): Promise<void> {
  const auth = await getAuthorizedClient(userId);
  const sheets = google.sheets({ version: 'v4', auth });

  const headers = [
    'Timestamp',
    'Business',
    'Name',
    'Phone',
    'Email',
    'Service/Procedure',
    'Date',
    'Time',
    'Location',
    'Patient Type'
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Sheet1!A1:J1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [headers],
    },
  });

  console.log('Hilton Dental sheet headers initialized');
}

/**
 * Initialize sheet headers for DermaVixuals (run once per sheet)
 */
export async function initializeDermaVixualsSheet(userId: string, spreadsheetId: string): Promise<void> {
  const auth = await getAuthorizedClient(userId);
  const sheets = google.sheets({ version: 'v4', auth });

  const headers = [
    'Timestamp',
    'Business',
    'Name',
    'Phone',
    'Email',
    'Service Type',
    'Date',
    'Time'
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Sheet1!A1:H1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [headers],
    },
  });

  console.log('DermaVixuals sheet headers initialized');
}

