// api/index.js (মূল বট লজিক)

// Load environment variables (for local testing, Vercel loads them automatically)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

// ------ আপনার তথ্য এনভায়রনমেন্ট ভেরিয়েবল থেকে ------
const TOKEN = process.env.BOT_TOKEN;
const WORK_SHEET_ID = process.env.GOOGLE_SHEETS_WORK_ID;
const STATS_SHEET_ID = process.env.GOOGLE_SHEETS_STATS_ID;
const FINAL_SHEET_ID = process.env.GOOGLE_SHEETS_FINAL_ID;
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
// Private Key লোড করার সময় \n গুলোকে সঠিক নিউলাইন ক্যারেক্টারে পরিবর্তন করা হচ্ছে।
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'); 

// Google Sheets API ক্লায়েন্ট সেটআপ
const auth = new JWT({
  email: SERVICE_ACCOUNT_EMAIL,
  key: PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'], // Sheets অ্যাক্সেসের জন্য প্রয়োজনীয় স্কোপ
});
const sheets = google.sheets({ version: 'v4', auth }); // Sheets API v4 ব্যবহার করা হচ্ছে

const bot = new Telegraf(TOKEN); // Telegraf বট ইনস্ট্যান্স তৈরি

// --- গ্লোবাল কনস্ট্যান্টস (আপনার IP তথ্য) ---
const IP_SERVER = "104dec7a79170064.dmv.eu.pyproxy.io";
const IP_PORT = "16666";
const IP_USERNAME = "Habiba18-zone-resi-region-es";
const IP_PASSWORD = "Habiba8";

// --- Helper Functions (আপনার Apps Script ফাংশনগুলোর Node.js ভার্সন) ---

// Google Sheet থেকে ডেটা পড়া
// sheetId: কোন শীট থেকে পড়বেন (ID)
// range: কোন রেঞ্জ থেকে পড়বেন (যেমন 'Sheet1!A:Z' বা শুধু 'Sheet1')
async function getSheetData(sheetId, range = 'Sheet1') {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${range}!A:ZZ`, // পুরো রেঞ্জ পড়ার জন্য, আপনার কলাম অনুযায়ী ZZ পরিবর্তন করুন
    });
    return res.data.values || [];
  } catch (err) {
    console.error(`Error getting data from ${sheetId}, range ${range}:`, err.message);
    throw err; // ত্রুটি পুনরায় নিক্ষেপ করুন যাতে মূল হ্যান্ডলার এটি ধরতে পারে
  }
}

// Google Sheet-এর একটি রেঞ্জে ডেটা লেখা/আপডেট করা
// sheetId: কোন শীটে লিখবেন (ID)
// range: কোন রেঞ্জে লিখবেন (যেমন 'Sheet1!E2:F2')
// values: লেখার জন্য ডেটার অ্যারে অফ অ্যারেস (যেমন [['Assigned', 'UserName']])
async function updateSheetRange(sheetId, range, values) {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: range,
      valueInputOption: 'RAW', // ডেটা যেমন আছে তেমনই লিখবে, ফরম্যাটিং ছাড়া
      resource: { values: values },
    });
  } catch (err) {
    console.error(`Error updating range ${range} in ${sheetId}:`, err.message);
    throw err;
  }
}

// শীটে নতুন রো যোগ করা
// sheetId: কোন শীটে যোগ করবেন (ID)
// values: যোগ করার জন্য ডেটার অ্যারে (যেমন [userId, userName, 0, 0, ""])
async function appendSheetRow(sheetId, values) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1', // এখানে শুধুমাত্র শীটের নাম দিলেই হবে, এটি শেষ রো এর পরে যোগ করবে
      valueInputOption: 'RAW',
      resource: { values: [values] },
    });
  } catch (err) {
    console.error(`Error appending row to ${sheetId}:`, err.message);
    throw err;
  }
}

// Google Sheet-এর সেলের ব্যাকগ্রাউন্ড কালার সেট করা
// sheetId: কোন শীটে কালার করবেন (ID)
// range: কালার করার জন্য রেঞ্জ অবজেক্ট { startRow, endRow, startCol, endCol } (1-based)
// color: কালার অবজেক্ট { r, g, b } (0-1 এর মধ্যে) অথবা null (কালার সরাতে)
async function setCellBackground(sheetId, range, color) {
  try {
    const requests = [{
      repeatCell: {
        range: {
          sheetId: 0, // প্রথম শীট ID (সাধারণত 0, যদি আপনার শীটের ID ভিন্ন হয় তবে এটি পরিবর্তন করুন)
          startRowIndex: range.startRow - 1, // 0-ভিত্তিক ইন্ডেক্স
          endRowIndex: range.endRow, // 0-ভিত্তিক ইন্ডেক্স
          startColumnIndex: range.startCol - 1, // 0-ভিত্তিক ইন্ডেক্স
          endColumnIndex: range.endCol, // 0-ভিত্তিক ইন্ডেক্স
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: color ? { red: color.r, green: color.g, blue: color.b } : null,
          },
        },
        fields: 'userEnteredFormat.backgroundColor',
      },
    }];

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      resource: { requests },
    });
  } catch (err) {
    console.error(`Error setting background color in ${sheetId}, range ${JSON.stringify(range)}:`, err.message);
    throw err;
  }
}

// ব্যবহারকারী খোঁজার ফাংশন (Sheets থেকে)
async function findUser(userId) {
  const data = await getSheetData(STATS_SHEET_ID, 'Sheet1'); // STATS_SHEET_ID ব্যবহার করে Sheet1 থেকে ডেটা পড়ুন
  for (let i = 1; i < data.length; i++) { // হেডার রো (row 0) বাদ দিন, 1 থেকে শুরু করুন
    if (String(data[i][0]) === String(userId)) { // UserID কলাম (A, 0-ভিত্তিক ইন্ডেক্স 0)
      return {
        row: i + 1, // 1-ভিত্তিক রো নম্বর
        id: data[i][0],
        name: data[i][1],             // UserName কলাম (B, 0-ভিত্তিক ইন্ডেক্স 1)
        total: parseInt(data[i][2]) || 0, // TotalCompleted কলাম (C, 0-ভিত্তিক ইন্ডেক্স 2)
        daily: parseInt(data[i][3]) || 0, // DailyCompleted কলাম (D, 0-ভিত্তিক ইন্ডেক্স 3)
        date: data[i][4]              // LastCompletedDate কলাম (E, 0-ভিত্তিক ইন্ডেক্স 4)
        // Note: F কলামে (0-ভিত্তিক ইন্ডেক্স 5) স্টেট ডেটা আছে
      };
    }
  }
  return null;
}

// ব্যবহারকারী রেজিস্টার করা (Sheets এ)
async function registerUser(userId, userName) {
  // UserID, UserName, TotalCompleted, DailyCompleted, LastCompletedDate, UserState (নতুন F কলাম)
  await appendSheetRow(STATS_SHEET_ID, [userId, userName, 0, 0, "", ""]);
}

// ব্যবহারকারীর পরিসংখ্যান আপডেট করা (Sheets এ)
async function updateUserStats(user, count) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // "yyyy-MM-dd" ফরম্যাট

  // শীট থেকে ব্যবহারকারীর বর্তমান ডেটা পড়ুন (এটি গুরুত্বপূর্ণ যাতে stale ডেটা আপডেট না হয়)
  const latestUserData = (await getSheetData(STATS_SHEET_ID, `Sheet1!C${user.row}:E${user.row}`))[0];
  const lastTotal = parseInt(latestUserData[0]) || 0; // TotalCompleted (C)
  let dailyCount = parseInt(latestUserData[1]) || 0; // DailyCompleted (D)
  const lastDate = latestUserData[2] ? new Date(latestUserData[2]) : null; // LastCompletedDate (E)

  let lastDateStr = null;
  if (lastDate) {
    lastDateStr = lastDate.toISOString().split('T')[0];
  }

  if (todayStr === lastDateStr) {
    dailyCount += count;
  } else {
    dailyCount = count; // তারিখ না মিললে নতুন দিনের জন্য কাউন্ট শুরু
  }

  const newTotal = lastTotal + count;
  // সঠিক কলামে (C, D, E) ডেটা লেখা হচ্ছে
  await updateSheetRange(STATS_SHEET_ID, `Sheet1!C${user.row}:E${user.row}`, [[newTotal, dailyCount, todayStr]]);
}

// আজকের কাজের সংখ্যা গণনার ফাংশন
function getTodaysCount(user) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // "YYYY-MM-DD"
  const lastDate = user.date; // findUser থেকে পাওয়া তারিখ

  if (!lastDate) {
    return 0;
  }

  const lastDateObj = new Date(lastDate);
  if (isNaN(lastDateObj.getTime())) { // Invalid date check
      console.warn("Invalid lastDate found for user:", user.id, lastDate);
      return 0;
  }

  const lastDateStr = lastDateObj.toISOString().split('T')[0];

  if (todayStr === lastDateStr) {
    return user.daily;
  }

  return 0;
}

// --- টেলিগ্রাম ইউটিলিটি ফাংশন ---
function getMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "✅ নতুন কাজ নিন (Get Task)", callback_data: "/get_task" }],
      [{ text: "📊 আমার কাজের হিসাব (My Stats)", callback_data: "/my_stats" }]
    ]
  };
}

async function sendText(chatId, text, keyboard = null) {
  try {
    await bot.telegram.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (e) {
    console.error(`Error sending message to ${chatId}:`, e.message);
  }
}

async function editMessage(chatId, messageId, text, keyboard = null) {
  if (!messageId) return;
  try {
    await bot.telegram.editMessageText(chatId, messageId, null, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (e) {
    console.error(`Error editing message ${messageId} for ${chatId}:`, e.message);
  }
}

// ------ কাজ দেওয়ার ফাংশন ------
async function handleGetTask(chatId, user) {
  const data = await getSheetData(WORK_SHEET_ID, 'Sheet1'); // পুরো ডেটা পড়া

  // ব্যবহারকারীর ইতিমধ্যে কাজ আছে কিনা চেক করুন
  for (let i = 1; i < data.length; i++) {
    // কলাম F (index 5) ব্যবহারকারীর নাম, কলাম E (index 4) স্ট্যাটাস
    if (String(data[i][5]).trim() === user.name && data[i][4] === 'Assigned') {
      await sendText(chatId, "আপনার কাছে ইতিমধ্যে একটি কাজ অসমাপ্ত রয়েছে।");
      return;
    }
  }

  // একটি "Available" কাজ খুঁজুন
  for (let i = 1; i < data.length; i++) {
    if (data[i][4] === "Available") { // কলাম E (index 4) স্ট্যাটাস
      const taskRow = i + 1; // 1-ভিত্তিক রো নম্বর

      // Work Sheet আপডেট করুন: 'Assigned', user.name
      // কলাম E (index 4) এবং কলাম F (index 5)
      await updateSheetRange(WORK_SHEET_ID, `Sheet1!E${taskRow}:F${taskRow}`, [['Assigned', user.name]]);

      const email = data[i][0]; // কলাম A
      const password = data[i][1]; // কলাম B
      const recoveryMail = data[i][2]; // কলাম C

      // এখানে `getDailyTaskStats` কে `WORK_SHEET_ID` এর সম্পূর্ণ ডেটা সহ কল করুন
      const workSheetDataForStats = await getSheetData(WORK_SHEET_ID, 'Sheet1');
      const stats = await getDailyTaskStats(workSheetDataForStats); // await যোগ করুন

      const title = `আপনার নতুন কাজ (${stats.completed}/${stats.total})`;

      const message = `<b>${title}</b>\n\n` +
                      `<b>Email: </b> <code>${email}</code>\n` +
                      `<b>Password: </b> <code>${password}</code>\n` +
                      `<b>Recovery Mail:</b> <code>${recoveryMail}</code>\n\n` +
                      `<b>Server: </b> <code>${IP_SERVER}</code>\n` +
                      `<b>Port: </b> <code>${IP_PORT}</code>\n` +
                      `<b>Username: </b> <code>${IP_USERNAME}</code>\n` +
                      `<b>Ip Password: </b> <code>${IP_PASSWORD}</code>\n\n` +
                      `কাজটি শেষ করে Talkatone থেকে পাওয়া ফোন নম্বরটি এখানে পাঠান।\n` +
                      `কাজটি করতে না পারলে 'বাতিল করুন' বাটনে ক্লিক করুন।`;
      const keyboard = { inline_keyboard: [[{ text: "✅ ফোন নম্বর জমা দিন", callback_data: `submit_phone_${taskRow}` }], [{ text: "❌ বাতিল করুন (Reject)", callback_data: `reject_${taskRow}` }]] };

      await sendText(chatId, message, keyboard);
      return; // কাজ খুঁজে পেলে এবং অ্যাসাইন করলে ফাংশন শেষ করুন
    }
  }
  await sendText(chatId, "দুঃখিত, এই মুহূর্তে কোনো নতুন কাজ নেই।");
}

// ------ আজকের কাজের পরিসংখ্যান গণনার ফাংশন ------
async function getDailyTaskStats(workSheetData) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // "yyyy-MM-dd"

  // Apps Script এর PropertiesService এর সমতুল্য কিছু নেই, তাই এই অংশটি সহজীকরণ করা হলো।
  // `daily_total_${yesterdayStr}` এর জন্য আপনাকে আলাদা একটি শীট বা ডেটাবেস ব্যবহার করতে হবে।
  // বর্তমানে, `finalSheetData.length - 1` (মোট কাজ) ব্যবহার করা হচ্ছে।

  const habibaSheetData = await getSheetData(FINAL_SHEET_ID, 'Sheet1'); // Final Sheet থেকে ডেটা
  const currentTotalTasks = habibaSheetData.length - 1; // হেডার বাদ

  let completedTasksInWorkSheet = 0;
  for (let i = 1; i < workSheetData.length; i++) {
    const status = workSheetData[i][4]; // কলাম E (index 4) স্ট্যাটাস
    if (status === "Completed" || status === "Rejected") {
      completedTasksInWorkSheet++;
    }
  }

  return {
    completed: completedTasksInWorkSheet,
    total: currentTotalTasks >= 0 ? currentTotalTasks : 0
  };
}

// ------ ফোন নম্বর জমা নেওয়ার ফাংশন ------
async function handlePhoneNumberInput(chatId, user, phoneNumber, stateData) {
  const trimmedPhoneNumber = phoneNumber.trim();
  const phoneRegex = /^\(\d{3}\)\s\d{3}-\d{4}$/;

  if (!phoneRegex.test(trimmedPhoneNumber)) {
    await sendText(chatId, "দুঃখিত, ফোন নম্বরটি সঠিক ফরম্যাটে নেই। অনুগ্রহ করে সঠিক ফরম্যাটে আবার পাঠান।");
    return;
  }

  const { row, messageId } = stateData;
  const taskRow = parseInt(row);

  // Work sheet থেকে ডেটা পড়ুন
  const workSheetData = await getSheetData(WORK_SHEET_ID, `Sheet1!A${taskRow}:F${taskRow}`);
  if (!workSheetData || workSheetData.length === 0) {
    console.error(`No data found for taskRow ${taskRow} in Work Sheet.`);
    await sendText(chatId, "দুঃখিত, এই কাজটি জমা দেওয়ার সময় একটি সমস্যা হয়েছে।", getMainMenuKeyboard());
    return;
  }
  const assignedUserName = String(workSheetData[0][5]).trim(); // কলাম F
  const status = workSheetData[0][4]; // কলাম E

  if (assignedUserName === user.name && status === "Assigned") {
    // Work sheet আপডেট করুন: Phone number, Status to 'Completed'
    // কলাম D (index 3) এবং কলাম E (index 4)
    await updateSheetRange(WORK_SHEET_ID, `Sheet1!D${taskRow}:E${taskRow}`, [[trimmedPhoneNumber, "Completed"]]);

    const email = workSheetData[0][0]; // কলাম A
    const password = workSheetData[0][1]; // কলাম B
    const recoveryMail = workSheetData[0][2]; // কলাম C

    await updateFinalSheetOnSuccess(email, password, trimmedPhoneNumber);
    await updateUserStats(user, 1);

    // SCRIPT_PROPERTIES.deleteProperty(String(user.id)); এর পরিবর্তে ইউজার স্টেট শীটেই হ্যান্ডেল করবো
    // STATS_SHEET এর F কলামে (0-ভিত্তিক ইন্ডেক্স 5) ইউজার স্টেট আছে, এটি খালি করুন।
    await updateSheetRange(STATS_SHEET_ID, `Sheet1!F${user.row}`, [['']]); 

    const taskDetails = `<b>কাজটি সম্পন্ন হয়েছে (Row ${taskRow}):</b>\n\n<b>Email:</b> <code>${email}</code>\n<b>Password:</b> <code>${password}</code>\n<b>Recovery Mail:</b> <code>${recoveryMail}</code>\n\n<b>জমাকৃত ফোন নম্বর:</b> <code>${trimmedPhoneNumber}</code>`;

    await editMessage(chatId, messageId, taskDetails);
    await sendText(chatId, `✅ ধন্যবাদ! কাজটি সফলভাবে জমা হয়েছে।`, getMainMenuKeyboard());
  } else {
    // SCRIPT_PROPERTIES.deleteProperty(String(user.id));
    await updateSheetRange(STATS_SHEET_ID, `Sheet1!F${user.row}`, [['']]); // ইউজার স্টেট খালি করুন
    await sendText(chatId, "দুঃখিত, এই কাজটি জমা দেওয়ার সময় একটি সমস্যা হয়েছে।", getMainMenuKeyboard());
  }
}

// ------ Reject Task ফাংশন ------
async function handleRejectTask(chatId, user, rowToReject, reason, messageId) {
  const taskRow = parseInt(rowToReject);
  const workSheetData = await getSheetData(WORK_SHEET_ID, `Sheet1!A${taskRow}:F${taskRow}`); // A to F কলাম পড়া
  if (!workSheetData || workSheetData.length === 0) {
    console.error(`No data found for taskRow ${taskRow} in Work Sheet for reject.`);
    await editMessage(chatId, messageId, "এই কাজটি বাতিল করা সম্ভব নয়।");
    return;
  }
  const status = workSheetData[0][4]; // কলাম E
  const assignedUserName = String(workSheetData[0][5]).trim(); // কলাম F

  if (status === "Assigned" && assignedUserName === user.name) {
    const email = workSheetData[0][0]; // কলাম A
    const password = workSheetData[0][1]; // কলাম B
    let responseText = "";

    if (reason === "problem") {
      await updateSheetRange(WORK_SHEET_ID, `Sheet1!E${taskRow}`, [['Rejected']]); // কলাম E
      // Set background color: #ea4335 (Red)
      await setCellBackground(WORK_SHEET_ID, { startRow: taskRow, endRow: taskRow, startCol: 1, endCol: 6 }, { r: 234/255, g: 67/255, b: 53/255 }); // A থেকে F কলাম
      await updateFinalSheetOnReject(email, password);
      responseText = `কাজটি (Row ${taskRow}) সফলভাবে বাতিল করা হয়েছে।`;
    } else if (reason === "later") {
      await updateSheetRange(WORK_SHEET_ID, `Sheet1!E${taskRow}:F${taskRow}`, [['', '']]); // স্ট্যাটাস এবং অ্যাসাইনড ইউজার খালি করুন
      await resetTaskInFinalSheet(email, password);
      responseText = `কাজটি আবার তালিকার শুরুতে যুক্ত করা হয়েছে।`;
    }
    await editMessage(chatId, messageId, responseText);
    await sendText(chatId, "আপনার পরবর্তী কাজের জন্য প্রস্তুত।", getMainMenuKeyboard());
  } else {
    await editMessage(chatId, messageId, "এই কাজটি বাতিল করা সম্ভব নয়।");
  }
}

// ------ স্ট্যাটাস দেখানোর ফাংশন ------
async function updateAndShowStats(chatId, user) {
  const latestUserInfo = await findUser(user.id); // সর্বশেষ ডেটা শীট থেকে আবার পড়ুন
  if (latestUserInfo) {
    const todaysCount = getTodaysCount(latestUserInfo);
    const totalCount = latestUserInfo.total;
    const statsMessage = `📊 <b>আপনার কাজের হিসাব, ${latestUserInfo.name}</b>\n\n- আজকের সম্পন্ন কাজ: ${todaysCount}\n- মোট সম্পন্ন কাজ: ${totalCount}`;
    await sendText(chatId, statsMessage, getMainMenuKeyboard());
  } else {
    await sendText(chatId, "দুঃখিত, আপনার তথ্য খুঁজে পাওয়া যায়নি।");
  }
}

async function resetTaskInFinalSheet(email, password) {
  try {
    const data = await getSheetData(FINAL_SHEET_ID, 'Sheet1');
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === email && data[i][1] === password) {
        await updateSheetRange(FINAL_SHEET_ID, `Sheet1!D${i + 1}`, [['']]); // ফোন নম্বর খালি করুন (কলাম D)
        // ব্যাকগ্রাউন্ড কালার সরাুন (A থেকে D কলাম)
        await setCellBackground(FINAL_SHEET_ID, { startRow: i + 1, endRow: i + 1, startCol: 1, endCol: 4 }, null); 
        break;
      }
    }
  } catch (err) { console.error("Error in resetTaskInFinalSheet:", err.message); }
}

async function updateFinalSheetOnSuccess(email, password, phoneNumber) {
  try {
    const data = await getSheetData(FINAL_SHEET_ID, 'Sheet1');
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === email && data[i][1] === password) {
        await updateSheetRange(FINAL_SHEET_ID, `Sheet1!D${i + 1}`, [[phoneNumber]]); // ফোন নম্বর সেট করুন (কলাম D)
        break;
      }
    }
  } catch (err) { console.error("Error in updateFinalSheetOnSuccess:", err.message); }
}

async function updateFinalSheetOnReject(email, password) {
  try {
    const data = await getSheetData(FINAL_SHEET_ID, 'Sheet1');
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === email && data[i][1] === password) {
        // ব্যাকগ্রাউন্ড কালার সেট করুন: #ea4335 (Red) (A থেকে D কলাম)
        await setCellBackground(FINAL_SHEET_ID, { startRow: i + 1, endRow: i + 1, startCol: 1, endCol: 4 }, { r: 234/255, g: 67/255, b: 53/255 }); 
        break;
      }
    }
  } catch (err) { console.error("Error in updateFinalSheetOnReject:", err.message); }
}

// এই `module.exports` Vercel এর `api/index.js` ফাইলের main export হবে
// এটি টেলিগ্রাম ওয়েবহুক রিকোয়েস্ট হ্যান্ডেল করবে
module.exports = async (req, res) => {
  if (req.method === 'POST') { // টেলিগ্রাম ওয়েবহুক সবসময় POST রিকোয়েস্ট পাঠায়
    try {
      const contents = req.body; // রিকোয়েস্ট বডি থেকে JSON ডেটা
      const isCallBack = contents.callback_query;
      const chatId = isCallBack ? contents.callback_query.from.id : contents.message.chat.id;
      const userId = isCallBack ? contents.callback_query.from.id : contents.message.from.id;
      let text = isCallBack ? contents.callback_query.data : contents.message.text;
      const messageId = isCallBack ? contents.callback_query.message.message_id : null;

      // --- ইউজার স্টেট ম্যানেজমেন্ট (শিট-ভিত্তিক) ---
      // আমরা SCRIPT_PROPERTIES এর পরিবর্তে STATS_SHEET এর F কলামে (6th column) userState সেভ করব।
      // নিশ্চিত করুন যে STATS_SHEET এর F কলামটি ফাঁকা আছে এবং আপনি এটি ব্যবহারের অনুমতি দিচ্ছেন।
      const user = await findUser(userId);

      if (!user) {
        // --- রেজিস্ট্রেশন প্রক্রিয়া ---
        if (text && text.trim().length > 2 && text.trim().length < 30 && !text.startsWith('/')) {
          await registerUser(userId, text.trim());
          await sendText(chatId, `অভিনন্দন ${text.trim()}! আপনার রেজিস্ট্রেশন সম্পন্ন হয়েছে।`, getMainMenuKeyboard());
        } else {
          await sendText(chatId, "স্বাগতম! বটটি ব্যবহার করার জন্য, দয়া করে আপনার নাম লিখে পাঠান।");
        }
        res.status(200).send('OK'); // টেলিগ্রামকে দ্রুত OK রেসপন্স পাঠান
        return;
      }

      // --- রেজিস্টার্ড ব্যবহারকারীদের জন্য বাকি কাজ ---
      // ইউজার স্টেট চেক করুন (STATS_SHEET এর F কলামে)
      const userStatsData = (await getSheetData(STATS_SHEET_ID, `Sheet1!F${user.row}:F${user.row}`))[0];
      const userStateJSON = userStatsData ? userStatsData[0] : null;

      if (userStateJSON) {
        try {
          const stateData = JSON.parse(userStateJSON);
          if (stateData.state === "awaiting_phone") {
            await handlePhoneNumberInput(chatId, user, text, { row: stateData.row, messageId: stateData.messageId });
            res.status(200).send('OK');
            return;
          }
        } catch (parseError) {
          console.error("Error parsing user state JSON:", parseError);
          // Invalid state, clear it.
          await updateSheetRange(STATS_SHEET_ID, `Sheet1!F${user.row}`, [['']]);
        }
      }

      // বাটন ক্লিক এবং কমান্ড পরিচালনা
      if (text === "/start") {
        await sendText(chatId, `স্বাগতম, ${user.name}! কী করতে চান?`, getMainMenuKeyboard());
      }
      else if (text === "/get_task") {
        await handleGetTask(chatId, user);
      } else if (text === "/my_stats") {
        await updateAndShowStats(chatId, user);
      } else if (text.startsWith("submit_phone_")) {
        const taskRow = text.split("_")[2];
        const stateData = { state: "awaiting_phone", row: taskRow, messageId: messageId };
        await updateSheetRange(STATS_SHEET_ID, `Sheet1!F${user.row}`, [[JSON.stringify(stateData)]]); // Save user state in Sheets
        await sendText(chatId, "অনুগ্রহ করে ফোন নম্বরটি পাঠান।");
      } else if (text.startsWith("reject_")) {
        const taskRow = text.split("_")[1];
        const rejectOptionsKeyboard = { inline_keyboard: [[{ text: "🚫 Account Create Problem", callback_data: `confirm_reject_problem_${taskRow}` }], [{ text: "⏰ পরে করব (Do Later)", callback_data: `confirm_reject_later_${taskRow}` }], [{ text: "↩️  (Back) ", callback_data: `back_to_task_${taskRow}` }]] };
        await editMessage(chatId, messageId, "আপনি কেন কাজটি বাতিল করতে চান?", rejectOptionsKeyboard);
      } else if (text.startsWith("confirm_reject_")) {
        const parts = text.split("_");
        const reason = parts[2];
        const taskRow = parts[3];
        const confirmationKeyboard = { inline_keyboard: [[{ text: "✅ হ্যাঁ (Yes)", callback_data: `final_reject_${reason}_${taskRow}` }], [{ text: "❌ না (No)", callback_data: `back_to_task_${taskRow}` }]] };
        await editMessage(chatId, messageId, "আপনি কি নিশ্চিত?", confirmationKeyboard);
      } else if (text.startsWith("final_reject_")) {
        const parts = text.split("_");
        const reason = parts[2];
        const taskRow = parts[3];
        await handleRejectTask(chatId, user, taskRow, reason, messageId);
      } else if (text.startsWith("back_to_task_")) {
        const taskRow = text.split("_")[2]; // Corrected index for taskRow from callback data

        // Re-fetch task data for display
        const taskData = await getSheetData(WORK_SHEET_ID, `Sheet1!A${parseInt(taskRow)}:C${parseInt(taskRow)}`);
        if (!taskData || taskData.length === 0) {
          console.error(`No task data found for row ${taskRow} for back_to_task`);
          await sendText(chatId, "দুঃখিত, কাজের তথ্য খুঁজে পাওয়া যায়নি।", getMainMenuKeyboard());
          res.status(200).send('OK');
          return;
        }
        const email = taskData[0][0];
        const password = taskData[0][1];
        const recoveryMail = taskData[0][2];

        const message = `<b>আপনার নতুন কাজ (Row ${taskRow}):</b>\n\n<b>Email:</b> <code>${email}</code>\n<b>Password:</b> <code>${password}</code>\n<b>Recovery Mail:</b> <code>${recoveryMail}</code>\n\nকাজটি শেষ করে Talkatone থেকে পাওয়া ফোন নম্বরটি এখানে পাঠান।\nকাজটি করতে না পারলে 'বাতিল করুন' বাটনে ক্লিক করুন।`;
        const originalKeyboard = { inline_keyboard: [[{ text: "✅ ফোন নম্বর জমা দিন", callback_data: `submit_phone_${taskRow}` }], [{ text: "❌ বাতিল করুন (Reject)", callback_data: `reject_${taskRow}` }] ] };
        await editMessage(chatId, messageId, message, originalKeyboard);
      } else if (!isCallBack) {
        await sendText(chatId, "অনুগ্রহ করে নিচের বাটনগুলো ব্যবহার করুন।");
      }

      res.status(200).send('OK'); // সর্বদা টেলিগ্রামকে OK রেসপন্স পাঠান
    } catch (err) {
      console.error("Error in doPost:", err.toString(), err.stack);
      res.status(500).send('Error processing request.'); // ত্রুটি হলে 500 রেসপন্স
    }
  } else {
    // GET রিকোয়েস্টের জন্য, বা যখন সরাসরি Vercel URL ব্রাউজারে খোলা হয়
    res.status(200).send('Hello from Vercel Bot! This endpoint only handles POST requests from Telegram.');
  }
};