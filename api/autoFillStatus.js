// api/autoFillStatus.js

// Load environment variables (for local testing)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

// ------ আপনার তথ্য এনভায়রনমেন্ট ভেরিয়েবল থেকে ------
const WORK_SHEET_ID = process.env.GOOGLE_SHEETS_WORK_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

// Google Sheets API ক্লায়েন্ট সেটআপ
const auth = new JWT({
  email: SERVICE_ACCOUNT_EMAIL,
  key: PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// --- Helper Functions ---
async function getSheetData(sheetId, range = 'Sheet1') {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${range}!A:ZZ`,
    });
    return res.data.values || [];
  } catch (err) {
    console.error(`Error getting data from ${sheetId}, range ${range}:`, err.message);
    throw err;
  }
}

async function updateSheetRange(sheetId, range, values) {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: range,
      valueInputOption: 'RAW',
      resource: { values: values },
    });
  } catch (err) {
    console.error(`Error updating range ${range} in ${sheetId}:`, err.message);
    throw err;
  }
}

// ------ Status অটো-ফিল করার লজিক ------
async function autoFillStatusLogic() {
  try {
    const data = await getSheetData(WORK_SHEET_ID, 'Sheet1');
    if (data.length <= 1) { // No data or only header
      console.log("No data to autofill status in Work sheet.");
      return;
    }

    let hasChanged = false;
    const updates = []; // ব্যাচ আপডেটের জন্য

    for (let i = 1; i < data.length; i++) { // হেডার রো (0-ভিত্তিক ইন্ডেক্স 0) বাদ দিন
      // আপনার Apps Script কোড অনুযায়ী: values[i][0] ইমেইল (A কলাম), values[i][4] স্ট্যাটাস (E কলাম)
      if (data[i][0] !== "" && (data[i][4] === "" || data[i][4] === undefined)) { // যদি ইমেইল থাকে এবং স্ট্যাটাস খালি থাকে
        updates.push({
          range: `Sheet1!E${i + 1}`, // E কলামের জন্য 1-ভিত্তিক রো ইন্ডেক্স
          values: [["Available"]]
        });
        hasChanged = true;
      }
    }

    if (hasChanged) {
      // batchUpdate ব্যবহার করে একবারে সব আপডেট করুন
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: WORK_SHEET_ID,
        resource: {
          data: updates,
          valueInputOption: 'RAW'
        }
      });
      console.log(`${updates.length} tasks status auto-filled in Work sheet.`);
    } else {
        console.log("No new status to autofill.");
    }
  } catch (err) {
    console.error(`Error in autoFillStatus:`, err.message, err.stack);
    throw err;
  }
}

// Vercel Serverless Function export
module.exports = async (req, res) => {
    if (req.method === 'GET') { // Cron jobs সাধারণত GET রিকোয়েস্ট পাঠায়
        await autoFillStatusLogic();
        res.status(200).send('AutoFill Status complete');
    } else {
        res.status(405).send('Method Not Allowed');
    }
};