import { initializeHiltonDentalSheet, initializeDermaVixualsSheet, initializeZoomDentalSheet } from '../tools/sheetsTool.js';
import path from 'node:path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../../.env.local');
dotenv.config({ path: envPath });

const DEMO_USER_ID = process.env.DEMO_USER_ID ?? 'demo-user';

async function main() {
  console.log('\n=== Initializing Google Sheets for Appointment Bookings ===\n');

  const hiltonSheetId = process.env.HILTON_DENTAL_SHEET_ID;
  const dermaSheetId = process.env.DERMAVIXUALS_SHEET_ID;
  const zoomDentalSheetId = process.env.ZOOM_DENTAL_SHEET_ID;

  if (!hiltonSheetId && !dermaSheetId && !zoomDentalSheetId) {
    console.error('Error: No sheet IDs found in environment variables.');
    console.log('\nPlease set the following in your .env.local file:');
    console.log('- HILTON_DENTAL_SHEET_ID=your_hilton_dental_spreadsheet_id');
    console.log('- DERMAVIXUALS_SHEET_ID=your_dermavixuals_spreadsheet_id');
    console.log('\nTo create a Google Sheet:');
    console.log('1. Go to https://sheets.google.com/');
    console.log('2. Create a new spreadsheet');
    console.log('3. Copy the ID from the URL (the long string between /d/ and /edit)');
    process.exit(1);
  }

  try {
    if (hiltonSheetId) {
      console.log('Initializing Hilton Dental sheet...');
      await initializeHiltonDentalSheet(DEMO_USER_ID, hiltonSheetId);
      console.log('✓ Hilton Dental sheet initialized successfully');
      console.log(`  URL: https://docs.google.com/spreadsheets/d/${hiltonSheetId}/edit\n`);
    } else {
      console.log('⚠ Skipping Hilton Dental sheet (HILTON_DENTAL_SHEET_ID not set)\n');
    }

    if (dermaSheetId) {
      console.log('Initializing DermaVixuals sheet...');
      await initializeDermaVixualsSheet(DEMO_USER_ID, dermaSheetId);
      console.log('✓ DermaVixuals MedSpa sheet initialized successfully');
      console.log(`  URL: https://docs.google.com/spreadsheets/d/${dermaSheetId}/edit\n`);
    } else {
      console.log('⚠ Skipping DermaVixuals sheet (DERMAVIXUALS_SHEET_ID not set)\n');
    }

    if (zoomDentalSheetId) {
      console.log('Initializing Zoom Dental sheet...');
      await initializeZoomDentalSheet(DEMO_USER_ID, zoomDentalSheetId);
      console.log('✓ Zoom Dental sheet initialized successfully');
      console.log(`  URL: https://docs.google.com/spreadsheets/d/${zoomDentalSheetId}/edit\n`);
    } else {
      console.log('⚠ Skipping Zoom Dental sheet (ZOOM_DENTAL_SHEET_ID not set)\n');
    }

    console.log('All sheets initialized successfully!');
    console.log('\nSheet columns:');
    console.log('\nHilton Dental:');
    console.log('  - Timestamp, Business, Name, Phone, Email, Service/Procedure, Date, Time, Location, Patient Type');
    console.log('\nDermaVixuals MedSpa:');
    console.log('  - Timestamp, Business, Name, Phone, Email, Service Type, Date, Time');

  } catch (error: any) {
    console.error('\n❌ Error initializing sheets:', error.message);
    if (error.message.includes('No refresh token found')) {
      console.log('\n⚠ Please run the Google authentication script first:');
      console.log('  npm run auth:google');
      console.log('  or');
      console.log('  node dist/scripts/googleAuth.js');
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

