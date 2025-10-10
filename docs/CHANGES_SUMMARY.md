# Google Sheets Integration - Changes Summary

## Overview
Added Google Sheets integration to automatically record appointment bookings from voice agent interactions. Each business (Hilton Dental and DermaVixuals) now has separate spreadsheet storage for their appointment data.

## New Files Created

### 1. `/src/tools/sheetsTool.ts`
Core Google Sheets integration with functions:
- `writeHiltonDentalBooking()` - Write dental appointments to Hilton Dental sheet
- `writeDermaVixualsBooking()` - Write spa appointments to DermaVixuals sheet
- `initializeHiltonDentalSheet()` - Set up headers for Hilton Dental sheet
- `initializeDermaVixualsSheet()` - Set up headers for DermaVixuals sheet

### 2. `/src/tools/bookingTools.ts`
Agent tool wrappers for booking functionality:
- `accept_dental_booking` - LLM tool for booking dental appointments
- `accept_spa_booking` - LLM tool for booking spa appointments

Both tools handle data collection and Google Sheets writing with error fallback.

### 3. `/src/scripts/initializeSheets.ts`
Setup script to initialize Google Sheets with proper headers. Includes helpful error messages and validation.

### 4. `/docs/google-sheets-setup.md`
Comprehensive documentation covering:
- Setup instructions
- Sheet structures
- Troubleshooting
- Data privacy considerations
- Advanced features

### 5. `/docs/BOOKING_SHEETS_QUICKSTART.md`
Quick start guide for rapid setup (3 simple steps).

### 6. `/docs/CHANGES_SUMMARY.md`
This file - summary of all changes made.

## Modified Files

### `/src/agent.ts`
**Changes:**
- Removed import from `./tools/dentalTool.js`
- Added imports from `./tools/bookingTools.js` (both dental and spa booking tools)
- Added `accept_spa_booking` to tool configurations

**Lines changed:** ~34, ~96-105

### `/src/tools/calendarTool.ts`
**Changes:**
- Added Google Sheets scope to `CALENDAR_SCOPES` array
- New scope: `'https://www.googleapis.com/auth/spreadsheets'`

**Lines changed:** ~20

### `/package.json`
**Changes:**
- Added new npm script: `"init:sheets": "pnpm build && node ./dist/scripts/initializeSheets.js"`

**Lines changed:** ~13

## Key Features

### Separate Business Data
- Hilton Dental bookings → Separate spreadsheet
- DermaVixuals bookings → Separate spreadsheet
- No mixing of appointment data

### Data Collected

**Hilton Dental:**
- Timestamp
- Business name ("Hilton Dental")
- Patient name, phone, email
- Service/procedure
- Date, time, location
- Patient type

**DermaVixuals:**
- Timestamp
- Business name ("DermaVixuals MedSpa")
- Client name, phone, email
- Service type
- Date, time

### Automatic Tool Selection
The agent automatically uses the correct booking tool based on the active system prompt:
- `hiltonDentalPrompt` → uses `accept_dental_booking`
- `dermaVisualsSpaPrompt` → uses `accept_spa_booking`

### Error Handling
Both booking tools include graceful error handling:
- Primary: Write to Google Sheets
- Fallback: Return confirmation message with note about follow-up

## Environment Variables Required

Add these to your `.env.local` file:

```env
# Existing Google OAuth variables (already configured)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=...
DEMO_USER_ID=...

# New: Google Sheets IDs
HILTON_DENTAL_SHEET_ID=your_hilton_dental_spreadsheet_id
DERMAVIXUALS_SHEET_ID=your_dermavixuals_spreadsheet_id
```

## Setup Steps (for user)

1. **Create Google Sheets**
   - Create two new spreadsheets on Google Sheets
   - Copy their IDs from the URLs

2. **Update Environment**
   - Add sheet IDs to `.env.local`

3. **Re-authenticate**
   ```bash
   npm run auth:google
   ```
   (Required to get new Sheets permission)

4. **Initialize Headers**
   ```bash
   npm run init:sheets
   ```

5. **Build and Run**
   ```bash
   npm run build
   npm start
   ```

## Testing

To test the integration:

1. Start the agent with Hilton Dental prompt
2. Book a test appointment through voice
3. Check the Hilton Dental spreadsheet for the new row
4. Switch to DermaVixuals prompt (in code)
5. Book a test spa appointment
6. Check the DermaVixuals spreadsheet for the new row

## Architecture Decisions

### Why Separate Spreadsheets?
- Clear data separation per business
- Easier to manage permissions
- Simpler to share with different teams
- Prevents accidental data mixing

### Why Not Database?
- Quick setup with existing Google OAuth
- Familiar interface for non-technical users
- Easy data export and sharing
- No additional infrastructure needed
- Built-in versioning and collaboration

### Error Handling Strategy
- Graceful degradation: Agent continues even if Sheets write fails
- Logged errors for debugging
- User still gets confirmation
- Can be monitored and fixed later

## Future Enhancements (Optional)

Potential improvements:
- Add calendar event creation alongside sheet writing
- Email confirmation using Gmail API
- SMS notifications via Twilio
- Real-time dashboard using Google Apps Script
- Automated booking reminders
- Integration with payment systems
- Webhook notifications to external systems

## Dependencies

No new npm packages required - uses existing `googleapis` package.

## Backward Compatibility

✓ Existing calendar tools unchanged
✓ Old dental tool replaced with enhanced version
✓ No breaking changes to agent configuration
✓ Existing authentication flow extended (needs re-auth for new scope)

## Security Considerations

- OAuth tokens stored securely in `data/tokens.json`
- Each business has own spreadsheet (data segregation)
- Least-privilege scopes used
- No sensitive data logged
- User controls spreadsheet access via Google sharing

## Monitoring

Check logs for:
- `"Hilton Dental booking written to sheet"` - Success
- `"DermaVixuals booking written to sheet"` - Success
- `"Error writing ... booking to Google Sheets"` - Failure (check error details)

## Support

For issues:
1. Check console logs
2. Verify environment variables
3. Ensure OAuth tokens are valid
4. Confirm spreadsheet IDs are correct
5. Check Google Cloud Console for API quotas

## Documentation References

- Quick Start: `docs/BOOKING_SHEETS_QUICKSTART.md`
- Full Guide: `docs/google-sheets-setup.md`
- This Summary: `docs/CHANGES_SUMMARY.md`

