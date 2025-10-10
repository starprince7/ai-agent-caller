# Google Sheets Appointment Booking Setup

This guide explains how to set up Google Sheets integration for recording appointment bookings from your voice agent.

## Overview

The voice agent now automatically writes appointment bookings to separate Google Sheets for each business:
- **Hilton Dental**: Records dental appointment bookings
- **DermaVixuals MedSpa**: Records spa/aesthetic appointment bookings

Each business has its own spreadsheet to keep appointment data organized and separated.

## Setup Steps

### 1. Create Google Spreadsheets

Create two separate Google Sheets for storing appointment data:

1. Go to [Google Sheets](https://sheets.google.com/)
2. Create a new spreadsheet for Hilton Dental
3. Create another new spreadsheet for DermaVixuals
4. Copy the spreadsheet IDs from the URLs

**Example URL:**
```
https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p/edit
                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                        This is your Spreadsheet ID
```

### 2. Configure Environment Variables

Add the following to your `.env.local` file:

```env
# Google Sheets Configuration
HILTON_DENTAL_SHEET_ID=your_hilton_dental_spreadsheet_id
DERMAVIXUALS_SHEET_ID=your_dermavixuals_spreadsheet_id
```

### 3. Run Google Authentication

If you haven't already authenticated with Google, run:

```bash
npm run auth:google
```

Or if using the compiled version:

```bash
node dist/scripts/googleAuth.js
```

This will:
1. Open a browser window for Google OAuth
2. Request permissions for Calendar and Sheets access
3. Store the refresh token securely

**Note:** You need to re-authenticate because the Sheets scope has been added to the required permissions.

### 4. Initialize Sheet Headers

Run the initialization script to set up headers in your spreadsheets:

```bash
npm run init:sheets
```

Or using Node directly:

```bash
npm run build
node dist/scripts/initializeSheets.js
```

This will add proper column headers to both sheets.

## Sheet Structures

### Hilton Dental Sheet

Columns:
- **Timestamp**: When the booking was recorded (ISO 8601 format)
- **Business**: "Hilton Dental"
- **Name**: Patient's full name
- **Phone**: Patient's phone number
- **Email**: Patient's email address
- **Service/Procedure**: Dental procedure requested (e.g., "Scaling and Polishing", "Braces")
- **Date**: Preferred appointment date
- **Time**: Preferred appointment time
- **Location**: Clinic location (Amuwo-Odofin, Lekki, or Abijo)
- **Patient Type**: "new" or "existing"

### DermaVixuals MedSpa Sheet

Columns:
- **Timestamp**: When the booking was recorded (ISO 8601 format)
- **Business**: "DermaVixuals MedSpa"
- **Name**: Client's full name
- **Phone**: Client's phone number
- **Email**: Client's email address
- **Service Type**: Spa/aesthetic service requested (e.g., "Botox", "Hydrafacial")
- **Date**: Preferred appointment date
- **Time**: Preferred appointment time

## How It Works

### For Hilton Dental

When a user books an appointment through the voice agent:
1. Agent collects: name, phone, email, service, date, time, and location
2. Uses the `accept_dental_booking` tool
3. Automatically writes data to the Hilton Dental spreadsheet
4. Returns confirmation to the user

### For DermaVixuals MedSpa

When a user books a spa appointment:
1. Agent collects: name, phone, email, service, date, and time
2. Uses the `accept_spa_booking` tool
3. Automatically writes data to the DermaVixuals spreadsheet
4. Returns confirmation to the user

## System Prompt Configuration

The system prompts determine which booking tool is used:

- `hiltonDentalPrompt`: Uses `accept_dental_booking` tool
- `dermaVisualsSpaPrompt`: Uses `accept_spa_booking` tool

To switch between businesses in your agent, change the `instructions` parameter when creating the agent:

```typescript
const agent = new voice.Agent({
  vad: vad,
  instructions: hiltonDentalPrompt(today), // or dermaVisualsSpaPrompt(today)
  allowInterruptions: true,
  tools: TOOL_CONFIGS,
});
```

## Troubleshooting

### Error: No refresh token found

**Solution:** Run the Google authentication script:
```bash
npm run auth:google
```

### Error: HILTON_DENTAL_SHEET_ID environment variable is not set

**Solution:** Add the spreadsheet IDs to your `.env.local` file.

### Error: Insufficient permissions

**Solution:** You may need to re-authenticate with the updated scopes:
1. Delete the existing token from `data/tokens.json`
2. Run `npm run auth:google` again
3. This will request the new Sheets permission

### Error: EACCES: permission denied, mkdir '/app/data' (Docker/Container)

**Solution:** This error occurs in containerized environments where the app doesn't have write permissions to the `/app` directory. You have several options:

#### Option 1: Use Environment Variable for Refresh Token (Recommended for Docker)
Instead of file-based token storage, set the refresh token directly as an environment variable:

```bash
export GOOGLE_REFRESH_TOKEN=your_refresh_token_here
```

To get your refresh token:
1. Run `npm run auth:google` on your local machine
2. Check the `data/tokens.json` file for the refresh token
3. Copy the decrypted refresh token value
4. Set it as an environment variable in your container

#### Option 2: Set DATA_DIR environment variable
```bash
export DATA_DIR=/tmp/voice-agent-data
# or in your Dockerfile/container:
ENV DATA_DIR=/tmp/voice-agent-data
```

#### Option 3: Let the app auto-fallback
The app will automatically try:
- User home directory: `~/.voice-agent/data`
- System temp directory: `/tmp/voice-agent/data`

#### Option 4: Mount a volume
```bash
docker run -v /host/data:/tmp/voice-agent-data your-app
```

The application will log which data directory it's using on startup.

### Bookings not appearing in sheets

**Checks:**
1. Verify the spreadsheet IDs are correct in `.env.local`
2. Check that the sheets are initialized with headers
3. Ensure the Google account used for OAuth has edit access to both spreadsheets
4. Check the console logs for any error messages

## Data Privacy & Security

- Appointment data is stored in Google Sheets under your Google account
- OAuth tokens are stored securely in `data/tokens.json`
- Each business has its own separate spreadsheet for data segregation
- Only the configured user ID (DEMO_USER_ID) can write to the sheets

## Viewing Your Bookings

Access your bookings at:
- Hilton Dental: `https://docs.google.com/spreadsheets/d/YOUR_HILTON_DENTAL_SHEET_ID/edit`
- DermaVixuals: `https://docs.google.com/spreadsheets/d/YOUR_DERMAVIXUALS_SHEET_ID/edit`

You can:
- Filter and sort bookings
- Export to CSV/Excel
- Create charts and reports
- Share with team members
- Set up automated notifications using Google Apps Script

## Additional Features

### Sharing Access

To share sheets with your team:
1. Open the spreadsheet
2. Click "Share" in the top right
3. Add team member emails
4. Set appropriate permissions (Viewer/Editor)

### Data Export

To export booking data:
1. File → Download
2. Choose format (Excel, CSV, PDF, etc.)

### Automated Notifications

Consider setting up Google Apps Script triggers to:
- Send email notifications on new bookings
- Create calendar events automatically
- Send daily/weekly booking summaries

## Support

If you encounter issues, check:
1. Console logs for detailed error messages
2. Google Cloud Console for API quota and permissions
3. Environment variables are correctly set
4. Google OAuth tokens are valid

