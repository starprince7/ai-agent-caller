# Google Sheets Booking Integration - Quick Start

## What's New

Your voice agent now automatically records appointment bookings to Google Sheets! Each business has its own spreadsheet:

- 🦷 **Hilton Dental** → Separate spreadsheet
- 💆 **DermaVixuals MedSpa** → Separate spreadsheet

## Quick Setup (3 Steps)

### Step 1: Create Google Sheets

1. Go to https://sheets.google.com
2. Create TWO new blank spreadsheets:
   - One for "Hilton Dental Bookings"
   - One for "DermaVixuals Bookings"
3. Copy each spreadsheet ID from the URL

**Where to find the ID:**
```
https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p/edit
                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                        Copy this part
```

### Step 2: Add to .env.local

```env
# Add these lines to your .env.local file
HILTON_DENTAL_SHEET_ID=your_hilton_sheet_id_here
DERMAVIXUALS_SHEET_ID=your_dermavixuals_sheet_id_here
```

### Step 3: Authenticate & Initialize

```bash
# Re-authenticate with Google (includes new Sheets permission)
npm run auth:google

# Initialize sheet headers
npm run init:sheets
```

Done! 🎉

## What Gets Recorded

### Hilton Dental
✓ Patient name, phone, email  
✓ Service/procedure requested  
✓ Preferred date & time  
✓ Clinic location  
✓ Patient type (new/existing)  
✓ Timestamp

### DermaVixuals MedSpa
✓ Client name, phone, email  
✓ Service type requested  
✓ Preferred date & time  
✓ Timestamp

## Tools Available

The agent now has two booking tools:

1. **`accept_dental_booking`** - For Hilton Dental appointments
2. **`accept_spa_booking`** - For DermaVixuals appointments

The correct tool is automatically used based on which system prompt you're using.

## Switching Between Businesses

In `agent.ts`, change the instructions:

```typescript
// For Hilton Dental
instructions: hiltonDentalPrompt(today)

// For DermaVixuals
instructions: dermaVisualsSpaPrompt(today)
```

## Viewing Bookings

Visit your Google Sheets:
- Direct links are shown after running `npm run init:sheets`
- Or go to https://sheets.google.com and open your spreadsheets

## Troubleshooting

**"No refresh token found"**
→ Run `npm run auth:google`

**"Sheet ID not set"**
→ Add the IDs to `.env.local`

**"Insufficient permissions"**
→ Delete `data/tokens.json` and re-run `npm run auth:google`

**"EACCES: permission denied, mkdir '/app/data'" (Docker)**
→ **Best option**: Set `GOOGLE_REFRESH_TOKEN=your_token` environment variable
→ **Alternative**: Set `DATA_DIR=/tmp/voice-agent-data` environment variable
→ **Fallback**: App will auto-fallback to `/tmp/voice-agent/data`

## Next Steps

- Share sheets with your team
- Set up filters and sorting
- Export data for reports
- Create automated notifications

For detailed documentation, see `docs/google-sheets-setup.md`

