// Optional integration (disabled by default)
// NOTE: FilterTrack V1 does not require Google Sheets to operate.
// If you later want a shared operational view, set env vars:
// GOOGLE_SHEET_ID, GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY

const { google } = require('googleapis');

const hasSheetsEnv =
  process.env.GOOGLE_CLIENT_EMAIL &&
  process.env.GOOGLE_PRIVATE_KEY &&
  process.env.GOOGLE_SHEET_ID;

let sheets = null;
let SPREADSHEET_ID = null;

if (hasSheetsEnv) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheets = google.sheets({ version: 'v4', auth });
  SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
  console.log('✅ Google Sheets enabled (optional)');
} else {
  console.log('ℹ️ Google Sheets disabled (optional)');
}

async function safeAppend(_sheetName, _values) {
  // placeholder to keep backend stable even without Sheets
  return;
}

module.exports = { safeAppend };
