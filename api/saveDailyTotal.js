// api/saveDailyTotal.js

// Load environment variables (for local testing)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

// ------ আপনার তথ্য এনভায়রনমেন্ট ভেরিয়েবল থেকে ------
const FINAL_SHEET_ID = process.env.GOOGLE_SHEETS_FINAL_ID;
const DAILY_TOTALS_SHEET_ID = process.env.GOOGLE_SHEETS_DAILY_TOTALS_ID; // <--- এই ID টি নতুন DailyTotals শীটের হবে
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

async function appendSheetRow(sheetId, values) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      resource: { values: [values] },
    });
  } catch (err) {
    console.error(`Error appending row to ${sheetId}:`, err.message);
    throw err;
  }
}

// ------ Daily Total সেভ করার লজিক ------
async function saveDailyTotalLogic() {
  try {
    // DailyTotals Sheet এর আইডি অবশ্যই আপনার Vercel Environment Variables এ যোগ করতে হবে।
    if (!DAILY_TOTALS_SHEET_ID) {
        console.error("DAILY_TOTALS_SHEET_ID is not set in environment variables. Please set it in Vercel settings.");
        return;
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // "yyyy-MM-dd"
    const habibaSheetData = await getSheetData(FINAL_SHEET_ID, 'Sheet1');
    const currentTotalTasks = habibaSheetData.length - 1; // হেডার বাদ

    // 'DailyTotals' শীট থেকে ডেটা পড়ুন
    const dailyTotalsData = await getSheetData(DAILY_TOTALS_SHEET_ID, 'Sheet1');

    let found = false;
    // যদি আজকের তারিখের জন্য ইতিমধ্যেই এন্ট্রি থাকে, তাহলে আপডেট করুন
    for (let i = 1; i < dailyTotalsData.length; i++) { // হেডার রো বাদ দিন
        if (dailyTotalsData[i][0] === todayStr) { // A কলামে তারিখ
            await updateSheetRange(DAILY_TOTALS_SHEET_ID, `Sheet1!B${i + 1}`, [[currentTotalTasks]]); // B কলামে টোটাল
            found = true;
            break;
        }
    }
    // যদি আজকের তারিখের জন্য কোনো এন্ট্রি না থাকে, তাহলে নতুন রো যোগ করুন
    if (!found) {
        await appendSheetRow(DAILY_TOTALS_SHEET_ID, [todayStr, currentTotalTasks]);
    }
    console.log(`Total tasks for ${todayStr} saved: ${currentTotalTasks}`);
  } catch (err) {
    console.error(`Error in saveDailyTotal:`, err.message, err.stack);
    throw err;
  }
}

// Vercel Serverless Function export
module.exports = async (req, res) => {
    if (req.method === 'GET') { // Cron jobs সাধারণত GET রিকোয়েস্ট পাঠায়
        await saveDailyTotalLogic();
        res.status(200).send('Daily total saved');
    } else {
        res.status(405).send('Method Not Allowed');
    }
};