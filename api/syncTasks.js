// api/syncTasks.js (Habiba থেকে Work Sheet এ সিঙ্ক করার জন্য)

// Load environment variables (for local testing, Vercel loads them automatically)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

// ------ আপনার তথ্য এনভায়রনমেন্ট ভেরিয়েবল থেকে ------
const WORK_SHEET_ID = process.env.GOOGLE_SHEETS_WORK_ID;
const FINAL_SHEET_ID = process.env.GOOGLE_SHEETS_FINAL_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

// Google Sheets API ক্লায়েন্ট সেটআপ
const auth = new JWT({
  email: SERVICE_ACCOUNT_EMAIL,
  key: PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// --- Helper Functions (যদি প্রয়োজন হয়, api/index.js থেকে কপি করুন) ---
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

// ------ Habiba থেকে Work শীটে বুদ্ধিমানভাবে সিঙ্ক করার ফাংশন ------
// এই ফাংশনটি আপনার Apps Script এর syncHabibaToWorkSheet ফাংশনের সরাসরি রূপান্তর
async function syncHabibaToWorkSheetLogic() {
  try {
    const finalSheetData = await getSheetData(FINAL_SHEET_ID, 'Sheet1');
    const workSheetData = await getSheetData(WORK_SHEET_ID, 'Sheet1');

    const sourceEmails = {};
    finalSheetData.forEach((row, index) => { 
      if (index === 0) return; // হেডার রো (প্রথম রো) বাদ দিন
      const email = row[0];
      const phoneNumber = row[3];
      if (email && !phoneNumber) { // ইমেইল আছে এবং ফোন নম্বর নেই এমন কাজগুলো বিবেচনা করুন
        sourceEmails[email] = { email: email, password: row[1], recovery: row[2] };
      }
    });

    const destEmails = new Set(workSheetData.map(row => row[0]).filter(Boolean)); // Work Sheet এ বিদ্যমান ইমেইল

    const newTasksToAdd = [];
    for (const email in sourceEmails) {
      if (!destEmails.has(email)) { // যদি কাজটি Work Sheet এ না থাকে
        const task = sourceEmails[email];
        newTasksToAdd.push([task.email, task.password, task.recovery, "", "Available", ""]); // স্ট্যাটাস "Available" সেট করুন
      }
    }

    if (newTasksToAdd.length > 0) {
      const currentWorkSheetLastRow = workSheetData.length;
      // নতুন কাজগুলো Work Sheet এর শেষে যোগ করুন
      await updateSheetRange(WORK_SHEET_ID, `Sheet1!A${currentWorkSheetLastRow + 1}:F${currentWorkSheetLastRow + newTasksToAdd.length}`, newTasksToAdd);
      console.log(`${newTasksToAdd.length} new tasks added to Work sheet.`);
    }

    const fullWorkSheetData = await getSheetData(WORK_SHEET_ID, 'Sheet1');
    const rowsToDelete = [];

    // Work Sheet থেকে অপ্রয়োজনীয় কাজ মুছে ফেলার জন্য
    for (let i = fullWorkSheetData.length - 1; i >= 1; i--) { // নিচ থেকে লুপ চালানো হচ্ছে, হেডার বাদ
      const row = fullWorkSheetData[i];
      const email = row[0];
      const status = row[4];

      // যদি কাজটি "Available" থাকে এবং Habiba শীটে আর না থাকে (অর্থাৎ Habiba থেকে মুছে ফেলা হয়েছে)
      if (status === "Available" && !sourceEmails[email]) {
        rowsToDelete.push(i + 1); // 1-ভিত্তিক রো ইন্ডেক্স
      }
    }

    if (rowsToDelete.length > 0) {
        // রো ডিলিট করার জন্য batchUpdate ব্যবহার করা যেতে পারে
        // ছোট সংখ্যক রো এর জন্য, একটি একটি করে ডিলিট করা যেতে পারে, তবে অনেক রো হলে ধীর হবে।
        // এখানে Sheets API এর batchUpdate ব্যবহার করে রো ডিলিট করার উদাহরণ:
        const requests = [];
        for (const rowIndex of rowsToDelete.reverse()) { // নিচ থেকে উপরে ডিলিট করুন যাতে ইন্ডেক্সিং ঠিক থাকে
            requests.push({
                deleteDimension: {
                    range: {
                        sheetId: 0, // Assuming first sheet is ID 0
                        dimension: 'ROWS',
                        startIndex: rowIndex - 1, // 0-based
                        endIndex: rowIndex // 0-based (endIndex is exclusive)
                    }
                }
            });
        }
        if (requests.length > 0) {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: WORK_SHEET_ID,
                resource: { requests }
            });
            console.log(`${rowsToDelete.length} tasks removed from Work sheet.`);
        }
    }

  } catch (err) {
    console.error(`Error in syncHabibaToWorkSheet:`, err.message, err.stack);
    throw err; // ত্রুটি উপরে নিক্ষেপ করুন
  }
}

// Vercel Serverless Function export
module.exports = async (req, res) => {
    if (req.method === 'GET') { // Cron jobs সাধারণত GET রিকোয়েস্ট পাঠায়
        await syncHabibaToWorkSheetLogic();
        res.status(200).send('Sync complete');
    } else {
        res.status(405).send('Method Not Allowed'); // GET ছাড়া অন্য মেথড অনুমতি নেই
    }
};