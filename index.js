// ═══════════════════════════════════════════════════════════════
//  เป๋าแพร — Line OA Daily Bot  v6  (Smart Category Edition)
//  เพิ่ม: smart category flow, เรียนรู้ keyword อัตโนมัติ
//  แก้ไข: pie chart font (ASCII-safe legend), numbered categories
// ═══════════════════════════════════════════════════════════════
require("dotenv").config();
const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const { createClient } = require("@supabase/supabase-js");
const generatePayload = require("promptpay-qr");
const QRCode = require("qrcode");
const crypto = require("crypto");

const app = express();
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new Client(config);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// ════════════════════════════════════════════════════════════════
//  THEME — Pastel Kawaii
// ════════════════════════════════════════════════════════════════
const C = {
  green: "#72C472", greenLight: "#D8F2D8", greenPill: "#5AB55A",
  pink: "#E87EA0", pinkLight: "#FFE0EC", pinkPill: "#D4607E",
  blue: "#7AAFC8", blueLight: "#D8EEF8", bluePill: "#5A96B4",
  peach: "#F0BC6A", peachLight: "#FFF0D0", peachPill: "#D89A44",
  lavender: "#B898D8", lavenderLight: "#EDE0FF", lavenderPill: "#9878C0",
  coral: "#F08888", coralLight: "#FFE0E0", coralPill: "#D86868",
  bgPage: "#EAF2FF", white: "#FFFFFF",
  textDark: "#3A3A4A", textMid: "#7A7A8A", textLight: "#AAAABC",
};

// ════════════════════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════════════════════
function fmt(n) {
  return Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}
function getPublicUrl() {
  return (process.env.PUBLIC_URL || "").replace(/\/$/, "");
}
function hasPieSupport() {
  return !!process.env.PUBLIC_URL;
}

// ════════════════════════════════════════════════════════════════
//  THAI MONTH UTILITIES
// ════════════════════════════════════════════════════════════════
const THAI_MONTHS = {
  "มกราคม": 1, "มกรา": 1, "ม.ค.": 1, "ม.ค": 1,
  "กุมภาพันธ์": 2, "กุมภา": 2, "ก.พ.": 2, "ก.พ": 2,
  "มีนาคม": 3, "มีนา": 3, "มี.ค.": 3, "มี.ค": 3,
  "เมษายน": 4, "เมษา": 4, "เม.ย.": 4, "เม.ย": 4,
  "พฤษภาคม": 5, "พฤษภา": 5, "พ.ค.": 5, "พ.ค": 5,
  "มิถุนายน": 6, "มิถุนา": 6, "มิ.ย.": 6, "มิ.ย": 6,
  "กรกฎาคม": 7, "กรกฎา": 7, "ก.ค.": 7, "ก.ค": 7,
  "สิงหาคม": 8, "สิงหา": 8, "ส.ค.": 8, "ส.ค": 8,
  "กันยายน": 9, "กันยา": 9, "ก.ย.": 9, "ก.ย": 9,
  "ตุลาคม": 10, "ตุลา": 10, "ต.ค.": 10, "ต.ค": 10,
  "พฤศจิกายน": 11, "พฤศจิกา": 11, "พ.ย.": 11, "พ.ย": 11,
  "ธันวาคม": 12, "ธันวา": 12, "ธ.ค.": 12, "ธ.ค": 12,
};
const THAI_MONTH_NAMES = ["", "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

function parseMonthFilter(text) {
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();
  if (text.includes("เดือนนี้") || text.includes("เดือนปัจจุบัน")) {
    const start = new Date(thisYear, thisMonth, 1);
    const end = new Date(thisYear, thisMonth + 1, 0, 23, 59, 59, 999);
    return { start, end, label: THAI_MONTH_NAMES[thisMonth + 1] + " " + (thisYear + 543) };
  }
  if (text.includes("เดือนที่แล้ว") || text.includes("เดือนก่อน")) {
    const m = thisMonth === 0 ? 11 : thisMonth - 1;
    const y = thisMonth === 0 ? thisYear - 1 : thisYear;
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
    return { start, end, label: THAI_MONTH_NAMES[m + 1] + " " + (y + 543) };
  }
  for (const [name, num] of Object.entries(THAI_MONTHS)) {
    if (text.includes(name)) {
      const start = new Date(thisYear, num - 1, 1);
      const end = new Date(thisYear, num, 0, 23, 59, 59, 999);
      return { start, end, label: THAI_MONTH_NAMES[num] + " " + (thisYear + 543) };
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════
//  CATEGORY SYSTEM
// ════════════════════════════════════════════════════════════════
const DEFAULT_CATEGORIES = [
  { name: "🍜 อาหาร", keywords: ["ข้าว", "กะเพรา", "ผัด", "ต้ม", "แกง", "ทอด", "ยำ", "ก๋วยเตี๋ยว", "ส้มตำ", "ชาบู", "บุฟเฟ่ต์", "พิซซ่า", "แมค", "เบอร์เกอร์", "ขนมปัง", "ขนม", "ไก่", "ไข่", "หมู", "ปลา", "กุ้ง", "ผัก", "ซูชิ", "ราเมน", "อาหาร", "ข้าวต้ม", "โจ๊ก", "หมูกะทะ"], color: "#FF6B6B" },
  { name: "☕ เครื่องดื่ม", keywords: ["กาแฟ", "ชา", "นม", "ชานม", "โกโก้", "น้ำผลไม้", "ชาไข่มุก", "สมูตี้", "ชาเขียว", "น้ำอัดลม", "starbucks", "cafe", "amazon", "cafe"], color: "#C0885A" },
  { name: "🚗 เดินทาง", keywords: ["grab", "bolt", "แท็กซี่", "น้ำมัน", "ทางด่วน", "bts", "mrt", "รถไฟ", "รถเมล์", "ค่ารถ", "ค่าเดินทาง", "ที่จอดรถ", "uber"], color: "#4ECDC4" },
  { name: "🏠 ที่อยู่", keywords: ["ค่าห้อง", "ค่าเช่า", "ค่าน้ำ", "ค่าไฟ", "ค่าเน็ต", "อินเทอร์เน็ต", "wifi", "ค่าส่วนกลาง", "ค่าโทรศัพท์", "ค่ามือถือ", "ค่าหอ", "ค่าที่พัก"], color: "#45B7D1" },
  { name: "🎨 บันเทิง", keywords: ["netflix", "youtube", "spotify", "disney", "เกม", "game", "หนัง", "คอนเสิร์ต", "คาราโอเกะ", "สมัครสมาชิก", "subscription"], color: "#96CEB4" },
  { name: "🛒 ช้อปปิ้ง", keywords: ["shopee", "lazada", "เสื้อ", "กางเกง", "รองเท้า", "กระเป๋า", "ซื้อของ", "ช้อป", "เครื่องสำอาง", "ของ"], color: "#FFEAA7" },
  { name: "💊 สุขภาพ", keywords: ["หมอ", "ยา", "โรงพยาบาล", "คลินิก", "ฟิตเนส", "ยิม", "ทันตกรรม", "ตรวจสุขภาพ"], color: "#DDA0DD" },
];
const DEFAULT_CAT_COLORS = { ...Object.fromEntries(DEFAULT_CATEGORIES.map(c => [c.name, c.color])), "📦 อื่นๆ": "#B0B0B0" };

async function getUserCategories(userId) {
  try {
    const { data, error } = await supabase.from("user_categories").select("*").eq("user_id", userId).order("created_at", { ascending: true });
    if (error) { console.error("getUserCategories error:", error.message); return []; }
    return data || [];
  } catch (e) { console.error("getUserCategories exception:", e.message); return []; }
}
async function upsertCategory(userId, name, keywords = [], color = "#B0B0B0") {
  try {
    const { error } = await supabase.from("user_categories").upsert(
      { user_id: userId, name, keywords, color, updated_at: new Date().toISOString() },
      { onConflict: "user_id,name" }
    );
    if (error) console.error("upsertCategory error:", error.message);
  } catch (e) { console.error("upsertCategory exception:", e.message); }
}
async function deleteCategoryByName(userId, name) {
  try {
    const defExists = DEFAULT_CATEGORIES.find(c => c.name === name);
    if (defExists) return false;
    const { error } = await supabase.from("user_categories").delete().eq("user_id", userId).eq("name", name);
    return !error;
  } catch (e) { return false; }
}
async function getCategory(userId, title, manualTag = null) {
  if (manualTag) return manualTag;
  const lower = title.toLowerCase();
  const userCats = await getUserCategories(userId);
  for (const cat of userCats) {
    const kws = Array.isArray(cat.keywords) ? cat.keywords : [];
    if (kws.some(k => lower.includes(k.toLowerCase()))) return cat.name;
  }
  for (const cat of DEFAULT_CATEGORIES) {
    if (cat.keywords.some(k => lower.includes(k.toLowerCase()))) return cat.name;
  }
  return "📦 อื่นๆ";
}
async function getCatColor(userId, catName) {
  if (DEFAULT_CAT_COLORS[catName]) return DEFAULT_CAT_COLORS[catName];
  const userCats = await getUserCategories(userId);
  const found = userCats.find(c => c.name === catName);
  return found?.color || "#B0B0B0";
}
// ── Smart Category Helpers ────────────────────────────────────
// เพิ่ม keyword ให้ category ที่มีอยู่แล้ว (เรียนรู้จาก user)
async function learnKeyword(userId, catName, keyword) {
  try {
    // หา user category ที่มีอยู่
    const { data } = await supabase.from("user_categories").select("*")
      .eq("user_id", userId).eq("name", catName).maybeSingle();
    const existingKw = Array.isArray(data?.keywords) ? data.keywords : [];
    if (existingKw.includes(keyword.toLowerCase())) return; // มีแล้ว
    const newKw = [...existingKw, keyword.toLowerCase()];
    await supabase.from("user_categories").upsert(
      { user_id: userId, name: catName, keywords: newKw, color: data?.color || "#B0B0B0", updated_at: new Date().toISOString() },
      { onConflict: "user_id,name" }
    );
  } catch (e) { console.error("learnKeyword error:", e.message); }
}

// ตรวจว่า keyword match ใน user_categories หรือไม่ (user เคยสอนแล้ว)
async function getUserCatMatch(userId, title) {
  const lower = title.toLowerCase();
  const userCats = await getUserCategories(userId);
  for (const cat of userCats) {
    const kws = Array.isArray(cat.keywords) ? cat.keywords : [];
    if (kws.some(k => lower.includes(k.toLowerCase()))) return cat.name;
  }
  return null;
}

// ตรวจว่า keyword match ใน default categories หรือไม่
function getDefaultCatMatch(title) {
  const lower = title.toLowerCase();
  for (const cat of DEFAULT_CATEGORIES) {
    if (cat.keywords.some(k => lower.includes(k.toLowerCase()))) return cat.name;
  }
  return null;
}

// สร้าง quick reply ให้เลือกหมวดหมู่
async function buildCatQuickReply(userId, suggestedCat) {
  const allCats = await buildCatList(userId);
  const items = [];
  if (suggestedCat) {
    items.push({ type: "action", action: { type: "message", label: `✅ ${suggestedCat.replace(/^.{1,3}\s/, "").substring(0, 12)}`, text: `__cat__${suggestedCat}` } });
    items.push({ type: "action", action: { type: "message", label: "เลือกหมวดอื่น", text: "__cat__choose__" } });
  } else {
    allCats.slice(0, 11).forEach(c => {
      items.push({ type: "action", action: { type: "message", label: c.name.substring(0, 20), text: `__cat__${c.name}` } });
    });
  }
  items.push({ type: "action", action: { type: "message", label: "ไม่มีหมวด", text: "__cat__📦 อื่นๆ" } });
  return { type: "quickReply", items: items.slice(0, 13) };
}

// สร้าง quick reply ให้เลือกหมวดทั้งหมด (สำหรับกรณีกด "เลือกหมวดอื่น")
async function buildAllCatQuickReply(userId) {
  const allCats = await buildCatList(userId);
  const items = allCats.slice(0, 12).map(c => ({
    type: "action", action: { type: "message", label: c.name.substring(0, 20), text: `__cat__${c.name}` }
  }));
  items.push({ type: "action", action: { type: "message", label: "ไม่มีหมวด", text: "__cat__📦 อื่นๆ" } });
  return { type: "quickReply", items: items.slice(0, 13) };
}

// Main handler — ตัดสินใจว่าจะบันทึกทันที หรือถามหมวดก่อน
async function handleExpenseRecord(userId, replyToken, amount, title, manualTag = null) {
  // 1. ถ้า user ระบุ tag มาเอง → บันทึกทันที
  if (manualTag) {
    await saveSession(userId, title, "expense", { amount, note: title, category: manualTag });
    const bState = await checkBudget(userId);
    if (bState && bState.alert) {
      return client.replyMessage(replyToken, flexWrap("แจ้งเตือนงบ", { type: "carousel", contents: [flexSuccess("expense", amount, title, manualTag).contents, budgetAlertBubble(bState)] }));
    }
    return client.replyMessage(replyToken, flexSuccess("expense", amount, title, manualTag));
  }

  // 2. ตรวจ user_categories ก่อน (เคยเรียนรู้แล้ว → บันทึกทันที)
  const userMatch = await getUserCatMatch(userId, title);
  if (userMatch) {
    await saveSession(userId, title, "expense", { amount, note: title, category: userMatch });
    const bState = await checkBudget(userId);
    if (bState && bState.alert) {
      return client.replyMessage(replyToken, flexWrap("แจ้งเตือนงบ", { type: "carousel", contents: [flexSuccess("expense", amount, title, userMatch).contents, budgetAlertBubble(bState)] }));
    }
    return client.replyMessage(replyToken, flexSuccess("expense", amount, title, userMatch));
  }

  // 3. ตรวจ default keywords → ถาม confirm
  const defaultMatch = getDefaultCatMatch(title);
  await setState(userId, "waiting_cat_confirm", { amount, title, suggested: defaultMatch });

  if (defaultMatch) {
    const qr = await buildCatQuickReply(userId, defaultMatch);
    return client.replyMessage(replyToken, {
      type: "text",
      text: `"${title}" → ${defaultMatch} ใช่ไหมคะ? 🌸`,
      quickReply: qr,
    });
  } else {
    // ไม่รู้จักเลย → ให้เลือก
    const qr = await buildAllCatQuickReply(userId);
    return client.replyMessage(replyToken, {
      type: "text",
      text: `"${title}" จัดอยู่หมวดไหนดีคะ? 🌸`,
      quickReply: qr,
    });
  }
}

function parseExpenseTag(text) {
  const tagMatch = text.match(/#([^\s]+)\s*$/);
  if (!tagMatch) return { cleanText: text, tag: null };
  return { cleanText: text.replace(/#[^\s]+\s*$/, "").trim(), tag: tagMatch[1] };
}
async function buildCatList(userId) {
  const userCats = await getUserCategories(userId);
  return [
    ...DEFAULT_CATEGORIES.map(c => ({ ...c, isDefault: true })),
    ...userCats.map(c => ({ ...c, keywords: Array.isArray(c.keywords) ? c.keywords : [], isDefault: false })),
  ];
}

// ════════════════════════════════════════════════════════════════
//  DATABASE — sessions, bot_state
// ════════════════════════════════════════════════════════════════
async function getState(userId) {
  try {
    const { data } = await supabase.from("bot_state").select("*").eq("user_id", userId).maybeSingle();
    if (!data) return { mode: null, data: {} };
    return { mode: data.mode, data: typeof data.data === "string" ? JSON.parse(data.data) : (data.data || {}) };
  } catch (e) { return { mode: null, data: {} }; }
}
async function setState(userId, mode, data = {}) {
  try {
    await supabase.from("bot_state").upsert({ user_id: userId, mode, data, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  } catch (e) { console.error("setState error:", e.message); }
}
async function clearState(userId) {
  try {
    await supabase.from("bot_state").delete().eq("user_id", userId);
  } catch (e) { console.error("clearState error:", e.message); }
}
async function saveSession(userId, title, type, summary) {
  try {
    const { data, error } = await supabase.from("sessions").insert({ user_id: userId, title, type, summary }).select("id").single();
    if (error) { console.error("saveSession error:", error.message); return null; }
    return data.id;
  } catch (e) { console.error("saveSession exception:", e.message); return null; }
}
async function getSessions(userId, type = null, limit = 10) {
  try {
    let q = supabase.from("sessions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    if (type) q = q.eq("type", type);
    const { data } = await q;
    return data || [];
  } catch (e) { return []; }
}
async function getSessionsByMonth(userId, start, end) {
  try {
    const { data } = await supabase.from("sessions").select("*")
      .eq("user_id", userId)
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .order("created_at", { ascending: false });
    return data || [];
  } catch (e) { return []; }
}
async function deleteSession(userId, sessionId) {
  try {
    const { data } = await supabase.from("sessions").select("id,title,type").eq("user_id", userId).eq("id", sessionId).maybeSingle();
    if (!data) return null;
    await supabase.from("sessions").delete().eq("user_id", userId).eq("id", sessionId);
    return data;
  } catch (e) { return null; }
}
async function deleteAllSessions(userId) {
  try {
    const { count } = await supabase.from("sessions").delete({ count: "exact" }).eq("user_id", userId);
    return count || 0;
  } catch (e) { return 0; }
}

// ════════════════════════════════════════════════════════════════
//  BUDGET — แก้ไข: error handling ครบ
// ════════════════════════════════════════════════════════════════
async function getBudget(userId) {
  try {
    const { data, error } = await supabase.from("user_budgets").select("amount").eq("user_id", userId).maybeSingle();
    if (error) { console.error("getBudget error:", error.message); return 0; }
    return data ? Number(data.amount) : 0;
  } catch (e) { console.error("getBudget exception:", e.message); return 0; }
}
async function setBudget(userId, amount) {
  try {
    const { error } = await supabase.from("user_budgets").upsert(
      { user_id: userId, amount, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    if (error) {
      console.error("setBudget error:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("setBudget exception:", e.message);
    return false;
  }
}
async function checkBudget(userId) {
  const budget = await getBudget(userId);
  if (budget <= 0) return null;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const sessions = await getSessionsByMonth(userId, start, end);
  const spent = sessions.filter(s => s.type === "expense").reduce((s, r) => s + Number(r.summary?.amount || 0), 0);
  const pct = (spent / budget) * 100;
  return {
    budget, spent, remaining: budget - spent,
    pct: pct.toFixed(1),
    alert: pct >= 100 ? "over" : pct >= 80 ? "warning" : null
  };
}

// ════════════════════════════════════════════════════════════════
//  RECURRING EXPENSES — ใหม่ v5
// ════════════════════════════════════════════════════════════════
async function getRecurring(userId) {
  try {
    const { data, error } = await supabase.from("recurring_expenses").select("*")
      .eq("user_id", userId).order("day_of_month", { ascending: true });
    if (error) { console.error("getRecurring error:", error.message); return []; }
    return data || [];
  } catch (e) { return []; }
}
async function addRecurring(userId, description, amount, dayOfMonth) {
  try {
    const { error } = await supabase.from("recurring_expenses").insert({
      user_id: userId, description, amount, day_of_month: dayOfMonth
    });
    if (error) { console.error("addRecurring error:", error.message); return false; }
    return true;
  } catch (e) { return false; }
}
async function deleteRecurring(userId, id) {
  try {
    const { data } = await supabase.from("recurring_expenses").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
    if (!data) return null;
    await supabase.from("recurring_expenses").delete().eq("id", id);
    return data;
  } catch (e) { return null; }
}

// ── ตรวจสอบรายจ่ายประจำที่ถึงกำหนดวันนี้ ──────────────────
async function getDueRecurring(userId) {
  const list = await getRecurring(userId);
  if (!list.length) return [];
  const today = new Date();
  const todayDay = today.getDate();
  const thisYear = today.getFullYear();
  const thisMonth = today.getMonth();
  const due = [];
  for (const r of list) {
    const lastReminded = r.last_reminded ? new Date(r.last_reminded) : null;
    const alreadyRemindedThisMonth = lastReminded &&
      lastReminded.getFullYear() === thisYear &&
      lastReminded.getMonth() === thisMonth;
    if (todayDay >= r.day_of_month && !alreadyRemindedThisMonth) {
      due.push(r);
    }
  }
  return due;
}
async function markRecurringReminded(id) {
  try {
    await supabase.from("recurring_expenses").update({ last_reminded: new Date().toISOString() }).eq("id", id);
  } catch (e) { console.error("markRecurringReminded error:", e.message); }
}

// ════════════════════════════════════════════════════════════════
//  BILL SPLIT
// ════════════════════════════════════════════════════════════════
function calcSplit(orders, totalDiscount) {
  const totalBefore = orders.reduce((s, o) => s + o.price, 0);
  if (totalBefore === 0) return [];
  return orders.map(o => {
    const share = totalDiscount * (o.price / totalBefore);
    return { ...o, discountShare: share, finalPay: o.price - share };
  });
}
function parseOrders(text) {
  const orders = [];
  for (const part of text.split(",").map(s => s.trim())) {
    const m = part.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const words = m[1].trim().split(/\s+/);
    orders.push({ name: words[0], item: words.slice(1).join(" ") || "รายการ", price: parseFloat(m[2]) });
  }
  return orders.length > 0 ? orders : null;
}

// ════════════════════════════════════════════════════════════════
//  FLEX HELPERS
// ════════════════════════════════════════════════════════════════
const sep = { type: "separator", margin: "md", color: "#E8E8F0" };
function flexWrap(altText, bubble) {
  return { type: "flex", altText, contents: bubble };
}
function pill(text, bgColor) {
  return {
    type: "box", layout: "vertical",
    backgroundColor: bgColor, cornerRadius: "20px",
    paddingTop: "5px", paddingBottom: "5px",
    paddingStart: "14px", paddingEnd: "14px",
    contents: [{ type: "text", text, color: C.white, size: "sm", weight: "bold", align: "center" }],
  };
}
function kawaiiHeader(icon, label, bgColor, pillColor) {
  return {
    type: "box", layout: "vertical",
    backgroundColor: bgColor,
    paddingTop: "18px", paddingBottom: "14px",
    paddingStart: "16px", paddingEnd: "16px",
    spacing: "sm",
    contents: [
      { type: "text", text: icon, size: "3xl", align: "center" },
      { type: "box", layout: "vertical", alignItems: "center", margin: "sm", contents: [pill(label, pillColor)] },
    ],
  };
}
function kv(label, value, vColor = C.textDark) {
  return {
    type: "box", layout: "horizontal", margin: "sm",
    contents: [
      { type: "text", text: label, color: C.textMid, size: "sm", flex: 3, wrap: true },
      { type: "text", text: value, color: vColor, size: "sm", flex: 2, align: "end", weight: "bold", wrap: true },
    ],
  };
}

// ════════════════════════════════════════════════════════════════
//  FLEX BUILDERS
// ════════════════════════════════════════════════════════════════

// ── 1. SUCCESS รายรับ/รายจ่าย ────────────────────────────────
function flexSuccess(type, amount, title, category = null) {
  const isIn = type === "income";
  const color = isIn ? C.green : C.pink;
  const bgLight = isIn ? C.greenLight : C.pinkLight;
  const pillCol = isIn ? C.greenPill : C.pinkPill;
  const sign = isIn ? "+" : "-";
  const icon = isIn ? "💰" : "🛍️";
  const label = isIn ? "รายรับ" : "รายจ่าย";

  const bodyContents = [
    { type: "text", text: `${sign}${fmt(amount)} บาท`, size: "xxl", weight: "bold", color, align: "center" },
    sep,
    kv("📌 หัวข้อ", title),
  ];
  if (category && !isIn) {
    bodyContents.push(kv("🗂️ หมวดหมู่", category, C.lavender));
  }
  bodyContents.push({ type: "text", text: "✨ บันทึกในประวัติแล้วค่ะ", color: C.textLight, size: "xs", align: "center", margin: "lg" });

  return flexWrap(`บันทึก${label}แล้วค่ะ`, {
    type: "bubble", size: "kilo",
    header: kawaiiHeader(icon, `บันทึก${label}`, bgLight, pillCol),
    body: { type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "18px", spacing: "sm", contents: bodyContents },
  });
}

// ── 2. SUMMARY (ทั้งหมดตลอดกาล) ─────────────────────────────
async function flexSummary(userId) {
  const sessions = await getSessions(userId, null, 200);
  const incomes = sessions.filter(s => s.type === "income");
  const expenses = sessions.filter(s => s.type === "expense");
  const totalIn = incomes.reduce((s, r) => s + Number(r.summary?.amount || 0), 0);
  const totalOut = expenses.reduce((s, r) => s + Number(r.summary?.amount || 0), 0);
  const balance = totalIn - totalOut;
  const pos = balance >= 0;

  const makeRows = (list, sign, color) =>
    list.length > 0
      ? list.slice(0, 5).reverse().map(s => ({
        type: "box", layout: "horizontal", margin: "xs",
        contents: [
          { type: "text", text: s.title, color: C.textMid, size: "xs", flex: 3, wrap: true },
          { type: "text", text: `${sign}${fmt(s.summary?.amount || 0)}`, color, size: "xs", flex: 2, align: "end", weight: "bold" },
        ],
      }))
      : [{ type: "text", text: "ยังไม่มีรายการค่ะ", color: C.textLight, size: "xs", margin: "xs" }];

  return flexWrap("สรุปรายรับรายจ่าย", {
    type: "bubble", size: "mega",
    header: kawaiiHeader("📊", "สรุปรายรับรายจ่าย", C.blueLight, C.bluePill),
    body: {
      type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "16px", spacing: "md",
      contents: [
        {
          type: "box", layout: "vertical", backgroundColor: C.greenLight, cornerRadius: "12px", paddingAll: "12px",
          contents: [
            { type: "box", layout: "horizontal", contents: [{ type: "box", layout: "vertical", alignItems: "flex-start", flex: 1, contents: [pill("💚 รายรับ", C.greenPill)] }, { type: "text", text: `+${fmt(totalIn)} บาท`, weight: "bold", color: C.green, size: "sm", align: "end", flex: 2 }] },
            sep, ...makeRows(incomes, "+", C.green),
          ],
        },
        {
          type: "box", layout: "vertical", backgroundColor: C.pinkLight, cornerRadius: "12px", paddingAll: "12px",
          contents: [
            { type: "box", layout: "horizontal", contents: [{ type: "box", layout: "vertical", alignItems: "flex-start", flex: 1, contents: [pill("❤️ รายจ่าย", C.pinkPill)] }, { type: "text", text: `-${fmt(totalOut)} บาท`, weight: "bold", color: C.pink, size: "sm", align: "end", flex: 2 }] },
            sep, ...makeRows(expenses, "-", C.pink),
          ],
        },
        {
          type: "box", layout: "vertical",
          backgroundColor: pos ? C.greenLight : C.pinkLight,
          cornerRadius: "12px", paddingAll: "14px",
          contents: [
            { type: "box", layout: "vertical", alignItems: "center", margin: "xs", contents: [pill(pos ? "✅ คงเหลือ" : "⚠️ ติดลบ", pos ? C.greenPill : C.pinkPill)] },
            { type: "text", text: `${pos ? "+" : ""}${fmt(balance)} บาท`, color: pos ? C.green : C.pink, size: "xl", weight: "bold", align: "center", margin: "sm" },
          ],
        },
      ],
    },
    footer: {
      type: "box", layout: "vertical", backgroundColor: C.blueLight, paddingAll: "10px",
      contents: [{ type: "text", text: "พิมพ์ สรุปเดือนนี้ / สรุปหมวด เพื่อดูรายละเอียด 💕", color: C.bluePill, size: "xs", align: "center" }],
    },
  });
}

// ── 3. MONTHLY SUMMARY ───────────────────────────────────────
function flexMonthlySummary(sessions, monthLabel) {
  const incomes = sessions.filter(s => s.type === "income");
  const expenses = sessions.filter(s => s.type === "expense");
  const splits = sessions.filter(s => s.type === "split");
  const totalIn = incomes.reduce((s, r) => s + Number(r.summary?.amount || 0), 0);
  const totalOut = expenses.reduce((s, r) => s + Number(r.summary?.amount || 0), 0);
  const balance = totalIn - totalOut;
  const pos = balance >= 0;

  if (sessions.length === 0) {
    return flexWrap(`สรุป ${monthLabel}`, {
      type: "bubble", size: "kilo",
      header: kawaiiHeader("📭", `สรุป ${monthLabel}`, C.blueLight, C.bluePill),
      body: {
        type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "20px", spacing: "sm",
        contents: [
          { type: "text", text: "ยังไม่มีรายการในเดือนนี้ค่ะ", color: C.textMid, align: "center", wrap: true },
          { type: "text", text: "ลองบันทึกรายรับรายจ่ายก่อนนะคะ 🌸", color: C.textLight, size: "xs", align: "center", margin: "md" },
        ],
      },
    });
  }

  const makeRows = (list, sign, color) =>
    list.slice(0, 5).reverse().map(s => ({
      type: "box", layout: "horizontal", margin: "xs",
      contents: [
        { type: "text", text: s.title, color: C.textMid, size: "xs", flex: 3, wrap: true },
        { type: "text", text: `${sign}${fmt(s.summary?.amount || 0)}`, color, size: "xs", flex: 2, align: "end", weight: "bold" },
      ],
    }));

  return flexWrap(`สรุป ${monthLabel}`, {
    type: "bubble", size: "mega",
    header: kawaiiHeader("📅", `สรุป ${monthLabel}`, C.blueLight, C.bluePill),
    body: {
      type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "16px", spacing: "md",
      contents: [
        {
          type: "box", layout: "vertical", backgroundColor: C.greenLight, cornerRadius: "12px", paddingAll: "12px",
          contents: [
            { type: "box", layout: "horizontal", contents: [{ type: "box", layout: "vertical", alignItems: "flex-start", flex: 1, contents: [pill("💚 รายรับ", C.greenPill)] }, { type: "text", text: `+${fmt(totalIn)} บาท`, weight: "bold", color: C.green, size: "sm", align: "end", flex: 2 }] },
            ...(incomes.length > 0 ? [sep, ...makeRows(incomes, "+", C.green)] : []),
          ],
        },
        {
          type: "box", layout: "vertical", backgroundColor: C.pinkLight, cornerRadius: "12px", paddingAll: "12px",
          contents: [
            { type: "box", layout: "horizontal", contents: [{ type: "box", layout: "vertical", alignItems: "flex-start", flex: 1, contents: [pill("❤️ รายจ่าย", C.pinkPill)] }, { type: "text", text: `-${fmt(totalOut)} บาท`, weight: "bold", color: C.pink, size: "sm", align: "end", flex: 2 }] },
            ...(expenses.length > 0 ? [sep, ...makeRows(expenses, "-", C.pink)] : []),
          ],
        },
        {
          type: "box", layout: "horizontal", margin: "sm", spacing: "sm",
          contents: [
            { type: "box", layout: "vertical", flex: 1, backgroundColor: C.peachLight, cornerRadius: "10px", paddingAll: "10px", contents: [{ type: "text", text: "📝", size: "lg", align: "center" }, { type: "text", text: `${sessions.length}`, color: C.peach, size: "lg", weight: "bold", align: "center" }, { type: "text", text: "รายการ", color: C.textMid, size: "xxs", align: "center" }] },
            { type: "box", layout: "vertical", flex: 1, backgroundColor: C.peachLight, cornerRadius: "10px", paddingAll: "10px", contents: [{ type: "text", text: "🍱", size: "lg", align: "center" }, { type: "text", text: `${splits.length}`, color: C.peach, size: "lg", weight: "bold", align: "center" }, { type: "text", text: "หารบิล", color: C.textMid, size: "xxs", align: "center" }] },
          ],
        },
        {
          type: "box", layout: "vertical",
          backgroundColor: pos ? C.greenLight : C.pinkLight, cornerRadius: "12px", paddingAll: "14px",
          contents: [
            { type: "box", layout: "vertical", alignItems: "center", contents: [pill(pos ? "✅ คงเหลือ" : "⚠️ ติดลบ", pos ? C.greenPill : C.pinkPill)] },
            { type: "text", text: `${pos ? "+" : ""}${fmt(balance)} บาท`, color: pos ? C.green : C.pink, size: "xl", weight: "bold", align: "center", margin: "sm" },
          ],
        },
      ],
    },
    footer: {
      type: "box", layout: "vertical", backgroundColor: C.blueLight, paddingAll: "10px",
      contents: [{ type: "text", text: "พิมพ์ สรุปหมวด เพื่อดู pie chart หมวดหมู่ค่ะ 💕", color: C.bluePill, size: "xs", align: "center" }],
    },
  });
}

// ── 4. BUDGET ──────────────────────────────────────────────────
function flexBudget(bState, justSet = false) {
  if (!bState) {
    return flexWrap("การตั้งงบประมาณ", {
      type: "bubble", size: "kilo",
      header: kawaiiHeader("💰", "งบประมาณ", C.peachLight, C.peachPill),
      body: {
        type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "20px", spacing: "md",
        contents: [
          { type: "text", text: "ยังไม่ได้ตั้งงบนะคะ", color: C.textMid, align: "center" },
          { type: "text", text: "ช่วยควบคุมรายจ่ายได้ดีขึ้นค่ะ 🌸", color: C.textLight, size: "xs", align: "center" },
          { type: "button", style: "primary", color: C.peach, margin: "lg", height: "sm", action: { type: "message", label: "ตั้งงบเลย", text: "ตั้งงบ" } }
        ]
      }
    });
  }

  const { budget, spent, remaining, pct, alert } = bState;
  let headerIcon = justSet ? "✅" : "💰";
  let headerColor = C.greenLight;
  let headerText = justSet ? `ตั้งงบ ${fmt(budget)} บาทแล้วค่ะ!` : "งบประมาณ";
  let barColor = C.green;

  if (!justSet && alert === "warning") {
    headerIcon = "⚠️"; headerColor = C.peachLight;
    headerText = "งบใกล้หมดแล้ว"; barColor = C.peach;
  } else if (!justSet && alert === "over") {
    headerIcon = "🚨"; headerColor = C.coralLight;
    headerText = "เกินงบแล้ว!"; barColor = C.coral;
  }

  const clampPct = Math.min(Math.max(Number(pct), 0), 100);

  return flexWrap("งบประมาณ", {
    type: "bubble", size: "kilo",
    header: kawaiiHeader(headerIcon, headerText, headerColor, barColor),
    body: {
      type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "16px", spacing: "sm",
      contents: [
        { type: "box", layout: "horizontal", contents: [{ type: "text", text: "ใช้ไป", color: C.textMid, size: "sm", flex: 1 }, { type: "text", text: `${fmt(spent)} บาท`, color: barColor, size: "lg", weight: "bold", align: "end", flex: 2 }] },
        { type: "box", layout: "horizontal", margin: "xs", contents: [{ type: "text", text: "งบทั้งหมด", color: C.textLight, size: "xs", flex: 1 }, { type: "text", text: `${fmt(budget)} บาท`, color: C.textMid, size: "sm", align: "end", flex: 2 }] },
        { type: "box", layout: "vertical", backgroundColor: C.bgPage, height: "8px", cornerRadius: "4px", margin: "md", contents: [{ type: "box", layout: "vertical", backgroundColor: barColor, height: "8px", cornerRadius: "4px", width: `${clampPct}%`, contents: [] }] },
        { type: "box", layout: "horizontal", margin: "xs", contents: [{ type: "text", text: `${pct}%`, color: barColor, size: "xs", weight: "bold" }, { type: "text", text: alert === "over" ? `เกินงบ ${fmt(-remaining)} บาท` : `เหลือ ${fmt(remaining)} บาท`, color: alert === "over" ? C.coral : C.textMid, size: "xs", align: "end", flex: 1 }] },
      ]
    },
    footer: {
      type: "box", layout: "horizontal", backgroundColor: C.bgPage, paddingAll: "10px", spacing: "sm",
      contents: [{ type: "button", style: "secondary", height: "sm", flex: 1, action: { type: "message", label: "เปลี่ยนงบ", text: "ตั้งงบ" } }]
    }
  });
}

// ── 5. HISTORY ───────────────────────────────────────────────
async function flexHistory(userId, filterType = null, limit = 10) {
  const sessions = await getSessions(userId, filterType, limit);
  if (sessions.length === 0) {
    const label = filterType ? ({ income: "รายรับ", expense: "รายจ่าย", split: "หารบิล" }[filterType]) : "การใช้งาน";
    return flexWrap("ไม่พบประวัติ", {
      type: "bubble", size: "kilo",
      body: {
        type: "box", layout: "vertical", backgroundColor: C.bgPage, paddingAll: "28px", spacing: "sm",
        contents: [
          { type: "text", text: "📭", size: "3xl", align: "center" },
          { type: "text", text: `ยังไม่มีประวัติ${label}ค่ะ`, color: C.textMid, align: "center", margin: "md" },
          { type: "box", layout: "vertical", alignItems: "center", margin: "md", contents: [pill("ลองใช้งานก่อนนะคะ 🌸", C.lavenderPill)] },
        ],
      },
    });
  }

  const typeCfg = {
    income: { color: C.green, bg: C.greenLight, pill: C.greenPill, icon: "💰", label: "รายรับ" },
    expense: { color: C.pink, bg: C.pinkLight, pill: C.pinkPill, icon: "🛍️", label: "รายจ่าย" },
    split: { color: C.peach, bg: C.peachLight, pill: C.peachPill, icon: "🍱", label: "หารบิล" },
  };

  const bubbles = sessions.map((s, i) => {
    const cfg = typeCfg[s.type] || { color: C.textMid, bg: C.bgPage, pill: C.textMid, icon: "📌", label: "" };
    let detailRows = [];
    if (s.type === "income" || s.type === "expense") {
      const sign = s.type === "income" ? "+" : "-";
      detailRows = [kv("💵 จำนวน", `${sign}${fmt(s.summary?.amount || 0)} บาท`, cfg.color)];
      if (s.summary?.category && s.type === "expense") {
        detailRows.push(kv("🗂️ หมวด", s.summary.category, C.lavender));
      }
    } else if (s.type === "split") {
      const p = s.summary?.participants || [];
      detailRows = [
        ...p.map(r => kv(`👤 ${r.name} (${r.item})`, `${fmt(r.finalPay)} บาท`, cfg.color)),
        ...(s.summary?.discount > 0 ? [kv("🎫 ส่วนลด", `-${fmt(s.summary.discount)} บาท`, C.peach)] : []),
        kv("✅ รวมสุทธิ", `${fmt(s.summary?.totalAfter || 0)} บาท`, cfg.color),
      ];
    }
    return {
      type: "bubble", size: "kilo",
      header: {
        type: "box", layout: "vertical", backgroundColor: cfg.bg, paddingAll: "14px", spacing: "sm",
        contents: [
          { type: "box", layout: "horizontal", contents: [{ type: "box", layout: "vertical", alignItems: "flex-start", flex: 1, contents: [pill(`${cfg.icon} ${cfg.label}`, cfg.pill)] }, { type: "text", text: `#${i + 1}`, color: C.textLight, size: "xs", align: "end" }] },
          { type: "text", text: s.title, color: C.textDark, size: "sm", weight: "bold", margin: "sm", wrap: true },
          { type: "text", text: `📅 ${fmtDate(s.created_at)}`, color: C.textMid, size: "xs", margin: "xs" },
        ],
      },
      body: { type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "14px", spacing: "xs", contents: detailRows },
      footer: {
        type: "box", layout: "vertical", backgroundColor: C.coralLight, paddingAll: "10px",
        contents: [{ type: "button", style: "primary", color: C.coral, height: "sm", action: { type: "message", label: "🗑️ ลบรายการนี้", text: `ลบประวัติ ${s.id}` } }],
      },
    };
  });
  const hdrLabel = filterType ? (typeCfg[filterType]?.label || "") : "ทั้งหมด";
  return flexWrap(`ประวัติ${hdrLabel}`, { type: "carousel", contents: bubbles });
}

// ── 6. CATEGORY LIST ─────────────────────────────────────────
async function flexCategoryList(userId) {
  const all = await buildCatList(userId);
  const userCats = all.filter(c => !c.isDefault);
  const defCats = all.filter(c => c.isDefault);

  const makeRow = (cat, isDef) => ({
    type: "box", layout: "horizontal",
    backgroundColor: isDef ? C.bgPage : C.lavenderLight,
    cornerRadius: "8px", paddingAll: "10px", margin: "sm",
    contents: [
      {
        type: "box", layout: "vertical", flex: 1, spacing: "xs",
        contents: [
          { type: "text", text: cat.name, size: "sm", weight: "bold", color: C.textDark },
          { type: "text", wrap: true, size: "xxs", color: C.textLight, text: cat.keywords.length > 0 ? cat.keywords.slice(0, 6).join(", ") + (cat.keywords.length > 6 ? "…" : "") : "ยังไม่มี keyword" },
        ],
      },
      ...(!isDef ? [{ type: "button", style: "secondary", height: "sm", flex: 0, action: { type: "message", label: "🗑️", text: `ลบหมวด ${cat.name}` } }] : []),
    ],
  });

  return flexWrap("จัดการหมวดหมู่", {
    type: "bubble", size: "mega",
    header: kawaiiHeader("🗂️", "จัดการหมวดหมู่", C.lavenderLight, C.lavenderPill),
    body: {
      type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "14px", spacing: "xs",
      contents: [
        ...(userCats.length > 0 ? [{ type: "box", layout: "vertical", alignItems: "flex-start", margin: "sm", contents: [pill("✨ หมวดของฉัน", C.lavenderPill)] }, ...userCats.map(c => makeRow(c, false))] : []),
        { type: "box", layout: "vertical", alignItems: "flex-start", margin: "sm", contents: [pill("📋 หมวดเริ่มต้น", C.bluePill)] },
        ...defCats.map(c => makeRow(c, true)),
      ],
    },
    footer: {
      type: "box", layout: "vertical", backgroundColor: C.lavenderLight, paddingAll: "12px", spacing: "sm",
      contents: [
        { type: "text", text: "💡 คำสั่งจัดการหมวดหมู่:", color: C.textMid, size: "xs" },
        { type: "text", text: "เพิ่มหมวด 💕 แฟน", color: C.textDark, size: "xs" },
        { type: "text", text: "keyword แฟน > ของขวัญ ดอกไม้", color: C.textDark, size: "xs" },
        { type: "text", text: "ลบหมวด 💕 แฟน", color: C.coral, size: "xs" },
        { type: "text", text: "tag ตอนบันทึก: -60 ชานม #เครื่องดื่ม", color: C.textMid, size: "xs" },
      ],
    },
  });
}

// ── 7. CATEGORY PIE CHART SUMMARY ────────────────────────────
const { createCanvas } = require("@napi-rs/canvas");
const chartStore = new Map();
const CHART_EXPIRE_MS = 30 * 60 * 1000;

async function generatePieChart(catEntries, total, userId) {
  const id = crypto.randomBytes(8).toString("hex");
  const W = 600, H = 460;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#FFF5F8";
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2, cy = 210, radius = 170;
  let startAngle = -Math.PI / 2;

  const colorMap = {};
  for (const [cat] of catEntries) {
    colorMap[cat] = await getCatColor(userId, cat);
  }

  // Draw slices
  catEntries.forEach(([cat, amount]) => {
    const sliceAngle = (amount / total) * 2 * Math.PI;
    const color = colorMap[cat] || "#B0B0B0";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 4;
    ctx.stroke();
    startAngle += sliceAngle;
  });

  // Donut hole
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.52, 0, 2 * Math.PI);
  ctx.fillStyle = "#FFF5F8";
  ctx.fill();

  // Center text — ASCII only (safe, no Thai font needed)
  const totalFmt = Number(total).toLocaleString("en-US", { minimumFractionDigits: 2 });
  ctx.fillStyle = "#E87EA0";
  ctx.font = "bold 32px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(totalFmt, cx, cy - 4);
  ctx.fillStyle = "#AAAABC";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("THB", cx, cy + 26);

  // Legend — colored swatches + percentage numbers (ASCII only)
  const legendStartY = 395;
  const cols = Math.min(catEntries.length, 3);
  const colW = W / cols;
  catEntries.forEach(([cat, amount], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * colW + colW * 0.12;
    const y = legendStartY + row * 38;
    const color = colorMap[cat] || "#B0B0B0";
    const pct = ((amount / total) * 100).toFixed(1);
    const idx = i + 1;

    // Colored circle
    ctx.beginPath();
    ctx.arc(x + 10, y, 10, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();

    // Number label + percentage (ASCII — always renders)
    ctx.fillStyle = "#3A3A4A";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${idx}.  ${pct}%`, x + 26, y + 6);
  });

  const buffer = canvas.toBuffer("image/png");
  chartStore.set(id, buffer);
  setTimeout(() => chartStore.delete(id), CHART_EXPIRE_MS);
  return id;
}

// ── Category Summary Flex ────────────────────────────────────
async function flexCategorySummary(userId, sessions, monthLabel) {
  const expenses = sessions.filter(s => s.type === "expense");
  if (expenses.length === 0) {
    return flexWrap(`สรุปหมวดหมู่ ${monthLabel}`, {
      type: "bubble", size: "kilo",
      header: kawaiiHeader("📊", `สรุปหมวดหมู่ ${monthLabel}`, C.pinkLight, C.pinkPill),
      body: {
        type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "20px", spacing: "sm",
        contents: [
          { type: "text", text: "ยังไม่มีรายจ่ายในช่วงนี้ค่ะ", color: C.textMid, align: "center", wrap: true },
          { type: "text", text: "ลองบันทึกรายจ่ายก่อนนะคะ 🌸", color: C.textLight, size: "xs", align: "center", margin: "md" },
        ],
      },
    });
  }

  // Group by category — ใช้ category ที่บันทึกไว้ก่อน, ถ้าไม่มีค่อย classify
  const catMap = {};
  for (const e of expenses) {
    const cat = e.summary?.category || await getCategory(userId, e.title) || "📦 อื่นๆ";
    catMap[cat] = (catMap[cat] || 0) + Number(e.summary?.amount || 0);
  }
  const totalExp = Object.values(catMap).reduce((a, b) => a + b, 0);
  const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);

  // Category rows — numbered to match pie chart legend (1. 2. 3. ...)
  const catRows = catEntries.map(([cat, amount], i) => {
    const pct = ((amount / totalExp) * 100).toFixed(1);
    const barFill = Math.round(Number(pct) / 100 * 10);
    const bar = "█".repeat(barFill) + "░".repeat(10 - barFill);
    return {
      type: "box", layout: "vertical", margin: "sm",
      contents: [
        {
          type: "box", layout: "horizontal",
          contents: [
            { type: "text", text: `${i + 1}.  ${cat}`, color: C.textDark, size: "sm", flex: 4 },
            { type: "text", text: `${pct}%`, color: C.pink, size: "sm", flex: 1, align: "end", weight: "bold" },
          ],
        },
        {
          type: "box", layout: "horizontal", margin: "xs",
          contents: [
            { type: "text", text: `    ${fmt(amount)} บาท`, color: C.textMid, size: "xs", flex: 4 },
          ],
        },
      ],
    };
  });

  const bodyContents = [
    {
      type: "box", layout: "vertical", backgroundColor: C.pinkLight, cornerRadius: "10px", paddingAll: "12px", margin: "sm",
      contents: [
        { type: "box", layout: "vertical", alignItems: "center", contents: [pill("💸 รวมรายจ่าย", C.pinkPill)] },
        { type: "text", text: `${fmt(totalExp)} บาท`, color: C.pink, size: "xl", weight: "bold", align: "center", margin: "sm" },
      ],
    },
    sep,
    ...catRows,
  ];

  // ถ้า PUBLIC_URL ตั้งไว้ ให้เพิ่มรูป pie chart
  let heroSection = null;
  if (hasPieSupport()) {
    try {
      const chartId = await generatePieChart(catEntries, totalExp, userId);
      const chartUrl = `${getPublicUrl()}/chart/${chartId}`;
      heroSection = { type: "image", url: chartUrl, size: "full", aspectMode: "fit", aspectRatio: "1:1", backgroundColor: "#FFFFFF" };
    } catch (e) {
      console.error("Pie chart generation failed:", e.message);
    }
  }

  return flexWrap(`สรุปหมวดหมู่ ${monthLabel}`, {
    type: "bubble", size: "mega",
    header: kawaiiHeader("📊", `สรุปหมวดหมู่ ${monthLabel}`, C.pinkLight, C.pinkPill),
    ...(heroSection ? { hero: heroSection } : {}),
    body: { type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "14px", spacing: "xs", contents: bodyContents },
    footer: {
      type: "box", layout: "vertical", backgroundColor: C.lavenderLight, paddingAll: "10px",
      contents: [{ type: "button", style: "secondary", height: "sm", action: { type: "message", label: "🗂️ จัดการหมวดหมู่", text: "จัดการหมวด" } }],
    },
  });
}

// ── 8. SPLIT RESULT ──────────────────────────────────────────
function flexSplit(title, results, discount) {
  const totalAfter = results.reduce((s, r) => s + r.finalPay, 0);
  const personCards = results.map(r => ({
    type: "box", layout: "vertical", backgroundColor: C.peachLight, cornerRadius: "10px", paddingAll: "12px", margin: "sm",
    contents: [
      { type: "box", layout: "horizontal", contents: [{ type: "box", layout: "vertical", alignItems: "flex-start", flex: 1, contents: [pill(`👤 ${r.name}`, C.peachPill)] }, { type: "text", text: r.item, color: C.textMid, size: "xs", align: "end" }] },
      ...(discount > 0 ? [{ type: "box", layout: "horizontal", margin: "sm", contents: [{ type: "text", text: `ราคา: ${fmt(r.price)} บาท`, color: C.textMid, size: "xs", flex: 1 }, { type: "text", text: `-${fmt(r.discountShare)} บาท`, color: C.peach, size: "xs", align: "end" }] }] : []),
      { type: "text", text: `💵  ${fmt(r.finalPay)} บาท`, color: C.peach, size: "lg", weight: "bold", align: "center", margin: "sm" },
    ],
  }));
  return flexWrap(`หารบิล: ${title}`, {
    type: "bubble", size: "mega",
    header: kawaiiHeader("🍱", title, C.peachLight, C.peachPill),
    body: {
      type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "14px", spacing: "xs",
      contents: [...personCards, sep, ...(discount > 0 ? [{ type: "box", layout: "horizontal", margin: "sm", contents: [{ type: "text", text: "🎫 ส่วนลดรวม", color: C.peach, size: "sm", flex: 1 }, { type: "text", text: `-${fmt(discount)} บาท`, color: C.peach, weight: "bold", size: "sm", align: "end" }] }] : []),
      { type: "box", layout: "vertical", backgroundColor: C.peachLight, cornerRadius: "10px", paddingAll: "12px", margin: "sm", contents: [{ type: "box", layout: "vertical", alignItems: "center", contents: [pill("✅ รวมสุทธิ", C.peachPill)] }, { type: "text", text: `${fmt(totalAfter)} บาท`, color: C.peach, size: "xl", weight: "bold", align: "center", margin: "sm" }] }],
    },
    footer: { type: "box", layout: "vertical", backgroundColor: C.lavenderLight, paddingAll: "10px", contents: [{ type: "text", text: "💾 เป๋าแพรบันทึกไว้ในประวัติแล้วค่ะ 🌸", color: C.lavenderPill, size: "xs", align: "center" }] },
  });
}

// ── 9. QR Store + SplitWithQR ────────────────────────────────
const qrStore = new Map();
const QR_EXPIRE_MS = 30 * 60 * 1000;

function storeQR(phone, amount) {
  const id = crypto.randomBytes(8).toString("hex");
  qrStore.set(id, { phone, amount });
  setTimeout(() => qrStore.delete(id), QR_EXPIRE_MS);
  return id;
}

function flexSplitWithQR(title, results, discount, phone, qrIds, sessionId) {
  const totalAfter = results.reduce((s, r) => s + r.finalPay, 0);
  const baseUrl = getPublicUrl();
  const personCards = results.map(r => ({
    type: "box", layout: "vertical", backgroundColor: C.peachLight, cornerRadius: "10px", paddingAll: "12px", margin: "sm",
    contents: [
      { type: "box", layout: "horizontal", contents: [{ type: "box", layout: "vertical", alignItems: "flex-start", flex: 1, contents: [pill(`👤 ${r.name}`, C.peachPill)] }, { type: "text", text: r.item, color: C.textMid, size: "xs", align: "end" }] },
      ...(discount > 0 ? [{ type: "box", layout: "horizontal", margin: "sm", contents: [{ type: "text", text: `ราคา: ${fmt(r.price)} บาท`, color: C.textMid, size: "xs", flex: 1 }, { type: "text", text: `-${fmt(r.discountShare)} บาท`, color: C.peach, size: "xs", align: "end" }] }] : []),
      { type: "text", text: `💵  ${fmt(r.finalPay)} บาท`, color: C.peach, size: "lg", weight: "bold", align: "center", margin: "sm" },
    ],
  }));
  const summaryBubble = {
    type: "bubble", size: "mega",
    header: kawaiiHeader("🍱", title, C.peachLight, C.peachPill),
    body: {
      type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "14px", spacing: "xs",
      contents: [...personCards, sep, ...(discount > 0 ? [{ type: "box", layout: "horizontal", margin: "sm", contents: [{ type: "text", text: "🎫 ส่วนลดรวม", color: C.peach, size: "sm", flex: 1 }, { type: "text", text: `-${fmt(discount)} บาท`, color: C.peach, weight: "bold", size: "sm", align: "end" }] }] : []),
      { type: "box", layout: "vertical", backgroundColor: C.peachLight, cornerRadius: "10px", paddingAll: "12px", margin: "sm", contents: [{ type: "box", layout: "vertical", alignItems: "center", contents: [pill("✅ รวมสุทธิ", C.peachPill)] }, { type: "text", text: `${fmt(totalAfter)} บาท`, color: C.peach, size: "xl", weight: "bold", align: "center", margin: "sm" }] }],
    },
    footer: { type: "box", layout: "vertical", backgroundColor: C.lavenderLight, paddingAll: "10px", contents: [{ type: "text", text: "💾 บันทึกในประวัติแล้ว | เลื่อนขวาดู QR 💳", color: C.lavenderPill, size: "xs", align: "center" }] },
  };
  const phoneFmt = phone.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  const qrBubbles = results.map((r, i) => {
    const qrUrl = baseUrl ? `${baseUrl}/qr/${qrIds[i]}` : null;
    const postbackData = `confirm_pay|${sessionId}|${i}|${qrIds[i]}|${r.name}`;
    return {
      type: "bubble", size: "mega",
      header: { type: "box", layout: "vertical", backgroundColor: C.peachLight, paddingAll: "14px", spacing: "xs", contents: [{ type: "box", layout: "vertical", alignItems: "center", contents: [pill("💳 PromptPay QR", C.peachPill)] }, { type: "text", text: `👤 ${r.name}`, color: C.textDark, size: "md", weight: "bold", align: "center", margin: "sm" }, { type: "text", text: r.item, color: C.textMid, size: "xs", align: "center" }] },
      ...(qrUrl ? { hero: { type: "image", url: qrUrl, size: "full", aspectMode: "fit", aspectRatio: "1:1", backgroundColor: "#FFFFFF" } } : {}),
      body: { type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "14px", spacing: "sm", contents: [{ type: "text", text: `${fmt(r.finalPay)} บาท`, color: C.peach, size: "xl", weight: "bold", align: "center" }, sep, { type: "text", text: `📱 PromptPay: ${phoneFmt}`, color: C.textMid, size: "xs", align: "center", margin: "sm" }, { type: "text", text: "สแกน QR ด้วยแอปธนาคาร", color: C.textLight, size: "xxs", align: "center" }] },
      footer: { type: "box", layout: "vertical", backgroundColor: C.greenLight, paddingAll: "10px", spacing: "sm", contents: [{ type: "button", style: "primary", color: C.green, height: "sm", action: { type: "postback", label: "✅ จ่ายแล้ว", data: postbackData, displayText: `✅ ${r.name} จ่ายแล้ว!` } }, { type: "text", text: `💵 จ่ายให้ ${phoneFmt} จำนวน ${fmt(r.finalPay)} บาท`, color: C.textMid, size: "xxs", align: "center", wrap: true }] },
    };
  });
  return flexWrap(`หารบิล: ${title} + QR`, { type: "carousel", contents: [summaryBubble, ...qrBubbles] });
}

// ── 10. RECURRING LIST ───────────────────────────────────────
async function flexRecurringList(userId) {
  const list = await getRecurring(userId);
  if (list.length === 0) {
    return flexWrap("รายจ่ายประจำ", {
      type: "bubble", size: "kilo",
      header: kawaiiHeader("🔁", "รายจ่ายประจำ", C.blueLight, C.bluePill),
      body: {
        type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "20px", spacing: "sm",
        contents: [
          { type: "text", text: "ยังไม่มีรายจ่ายประจำค่ะ", color: C.textMid, align: "center" },
          { type: "text", text: "เพิ่มได้ด้วยคำสั่ง:", color: C.textLight, size: "xs", align: "center", margin: "sm" },
          { type: "text", text: "จ่ายประจำ 699 Netflix ทุกวันที่ 15", color: C.textDark, size: "xs", align: "center" },
        ],
      },
    });
  }

  const rows = list.map(r => ({
    type: "box", layout: "horizontal",
    backgroundColor: C.blueLight, cornerRadius: "8px", paddingAll: "10px", margin: "sm",
    contents: [
      {
        type: "box", layout: "vertical", flex: 1, spacing: "xs",
        contents: [
          { type: "text", text: r.description, size: "sm", weight: "bold", color: C.textDark },
          { type: "text", text: `ทุกวันที่ ${r.day_of_month} | ${fmt(r.amount)} บาท`, size: "xxs", color: C.textMid },
        ],
      },
      { type: "button", style: "secondary", height: "sm", flex: 0, action: { type: "message", label: "🗑️", text: `ลบรายจ่ายประจำ ${r.id}` } },
    ],
  }));

  return flexWrap("รายจ่ายประจำ", {
    type: "bubble", size: "mega",
    header: kawaiiHeader("🔁", "รายจ่ายประจำ", C.blueLight, C.bluePill),
    body: { type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "14px", spacing: "xs", contents: rows },
    footer: {
      type: "box", layout: "vertical", backgroundColor: C.bgPage, paddingAll: "10px",
      contents: [{ type: "text", text: "จ่ายประจำ 699 Netflix ทุกวันที่ 15", color: C.textLight, size: "xs", align: "center" }],
    },
  });
}

// ── 11. BUDGET ALERT BUBBLE ───────────────────────────────────
function budgetAlertBubble(bState) {
  const isOver = bState.alert === "over";
  return {
    type: "bubble", size: "kilo",
    header: kawaiiHeader(isOver ? "🚨" : "⚠️", isOver ? "เกินงบแล้วค่ะ!" : `ใช้ไปแล้ว ${bState.pct}% (เกิน 80%)`, isOver ? C.coralLight : C.peachLight, isOver ? C.coralPill : C.peachPill),
    body: {
      type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "16px", spacing: "sm",
      contents: [
        { type: "text", text: `${bState.pct}% ของงบเดือนนี้`, weight: "bold", size: "xl", color: isOver ? C.coral : C.peach, align: "center" },
        sep,
        kv("💰 งบทั้งหมด", `${fmt(bState.budget)} บาท`),
        kv("💸 ใช้ไปแล้ว", `${fmt(bState.spent)} บาท`, isOver ? C.coral : C.peach),
        kv(isOver ? "🚨 เกิน" : "💚 เหลือ", `${fmt(Math.abs(bState.remaining))} บาท`, isOver ? C.coral : C.green),
      ]
    },
    footer: { type: "box", layout: "vertical", backgroundColor: isOver ? C.coralLight : C.peachLight, paddingAll: "10px", contents: [{ type: "text", text: isOver ? "ระวังการใช้จ่ายเพิ่มด้วยนะคะ 🙏" : "ระวังไว้นิดนึงนะคะ 💕", color: isOver ? C.coralPill : C.peachPill, size: "xs", align: "center" }] },
  };
}

// ════════════════════════════════════════════════════════════════
//  MAIN MESSAGE HANDLER
// ════════════════════════════════════════════════════════════════
async function handleMessage(event) {
  if (event.type !== "message" || event.message.type !== "text") return;

  const replyToken = event.replyToken;
  const text = event.message.text.trim();
  const userId = event.source.groupId || event.source.userId;
  const { mode, data: sd } = await getState(userId);

  // ── ตรวจ recurring ที่ถึงกำหนด (แนบกับ reply แรก) ─────────
  const dueItems = await getDueRecurring(userId);

  // ── MENU ────────────────────────────────────────────────────
  if (["เมนู", "help", "menu", "สวัสดี", "หวัดดี"].includes(text.toLowerCase())) {
    await clearState(userId);
    const messages = [flexWrap("เมนูเป๋าแพร", {
      type: "bubble", size: "mega",
      header: kawaiiHeader("🌸", "สวัสดีค่ะ! เป๋าแพรยินดีช่วยเลยนะคะ", C.pinkLight, C.pinkPill),
      body: {
        type: "box", layout: "vertical", backgroundColor: C.bgPage, paddingAll: "14px", spacing: "sm",
        contents: [
          { type: "box", layout: "horizontal", backgroundColor: C.greenLight, cornerRadius: "12px", paddingAll: "14px", action: { type: "message", label: "รายรับ", text: "บันทึกรายรับ" }, contents: [{ type: "text", text: "💰", size: "xxl", flex: 0 }, { type: "box", layout: "vertical", margin: "md", flex: 1, spacing: "xs", contents: [{ type: "box", layout: "vertical", alignItems: "flex-start", contents: [pill("รายรับ", C.greenPill)] }, { type: "text", text: "+ จำนวน หมายเหตุ", color: C.textMid, size: "xs" }] }] },
          { type: "box", layout: "horizontal", backgroundColor: C.pinkLight, cornerRadius: "12px", paddingAll: "14px", action: { type: "message", label: "รายจ่าย", text: "บันทึกรายจ่าย" }, contents: [{ type: "text", text: "🛍️", size: "xxl", flex: 0 }, { type: "box", layout: "vertical", margin: "md", flex: 1, spacing: "xs", contents: [{ type: "box", layout: "vertical", alignItems: "flex-start", contents: [pill("รายจ่าย", C.pinkPill)] }, { type: "text", text: "- จำนวน หมายเหตุ | #tag", color: C.textMid, size: "xs" }] }] },
          {
            type: "box", layout: "horizontal", spacing: "sm",
            contents: [
              { type: "box", layout: "vertical", flex: 1, backgroundColor: C.blueLight, cornerRadius: "12px", paddingAll: "14px", action: { type: "message", label: "สรุป", text: "สรุป" }, contents: [{ type: "text", text: "📊", size: "xxl", align: "center" }, { type: "box", layout: "vertical", alignItems: "center", margin: "sm", contents: [pill("สรุป", C.bluePill)] }, { type: "text", text: "รายรับ-รายจ่าย", color: C.textMid, size: "xxs", align: "center" }] },
              { type: "box", layout: "vertical", flex: 1, backgroundColor: C.lavenderLight, cornerRadius: "12px", paddingAll: "14px", action: { type: "message", label: "ประวัติ", text: "ประวัติ" }, contents: [{ type: "text", text: "📚", size: "xxl", align: "center" }, { type: "box", layout: "vertical", alignItems: "center", margin: "sm", contents: [pill("ประวัติ", C.lavenderPill)] }, { type: "text", text: "ดูบันทึกทั้งหมด", color: C.textMid, size: "xxs", align: "center" }] },
            ],
          },
          { type: "box", layout: "horizontal", backgroundColor: C.peachLight, cornerRadius: "12px", paddingAll: "14px", action: { type: "message", label: "หาร", text: "หาร" }, contents: [{ type: "text", text: "🍱", size: "xxl", flex: 0 }, { type: "box", layout: "vertical", margin: "md", flex: 1, spacing: "xs", contents: [{ type: "box", layout: "vertical", alignItems: "flex-start", contents: [pill("หารบิล", C.peachPill)] }, { type: "text", text: "หารค่าอาหาร + QR PromptPay", color: C.textMid, size: "xs" }] }] },
          {
            type: "box", layout: "horizontal", spacing: "sm",
            contents: [
              { type: "box", layout: "vertical", flex: 1, backgroundColor: C.lavenderLight, cornerRadius: "12px", paddingAll: "12px", action: { type: "message", label: "หมวดหมู่", text: "จัดการหมวด" }, contents: [{ type: "text", text: "🗂️", size: "xl", align: "center" }, { type: "box", layout: "vertical", alignItems: "center", margin: "sm", contents: [pill("หมวด", C.lavenderPill)] }, { type: "text", text: "จัดการหมวดหมู่", color: C.textMid, size: "xxs", align: "center" }] },
              { type: "box", layout: "vertical", flex: 1, backgroundColor: C.blueLight, cornerRadius: "12px", paddingAll: "12px", action: { type: "message", label: "สรุปเดือนนี้", text: "สรุปเดือนนี้" }, contents: [{ type: "text", text: "📅", size: "xl", align: "center" }, { type: "box", layout: "vertical", alignItems: "center", margin: "sm", contents: [pill("รายเดือน", C.bluePill)] }, { type: "text", text: "สรุปเดือนนี้", color: C.textMid, size: "xxs", align: "center" }] },
              { type: "box", layout: "vertical", flex: 1, backgroundColor: C.peachLight, cornerRadius: "12px", paddingAll: "12px", action: { type: "message", label: "งบ", text: "ดูงบ" }, contents: [{ type: "text", text: "💰", size: "xl", align: "center" }, { type: "box", layout: "vertical", alignItems: "center", margin: "sm", contents: [pill("งบ", C.peachPill)] }, { type: "text", text: "งบประมาณ", color: C.textMid, size: "xxs", align: "center" }] },
            ],
          },
        ],
      },
      footer: {
        type: "box", layout: "vertical", backgroundColor: C.lavenderLight, paddingAll: "10px",
        contents: [
          { type: "text", text: "ตั้งงบ 10000 | ล้างประวัติ | จ่ายประจำ", color: C.textLight, size: "xxs", align: "center" },
          { type: "text", text: "พิมพ์ ยกเลิก เพื่อออกจากขั้นตอนนะคะ 💕", color: C.lavenderPill, size: "xs", align: "center" },
        ],
      },
    })];
    // แนบ reminder ถ้ามี
    if (dueItems.length > 0) {
      const reminderText = dueItems.map(r => `🔔 ถึงกำหนดจ่าย: ${r.description} — ${fmt(r.amount)} บาท (ทุกวันที่ ${r.day_of_month})`).join("\n");
      messages.push({ type: "text", text: `⏰ รายจ่ายประจำที่ถึงกำหนดค่ะ!\n\n${reminderText}\n\nบันทึกได้เลยนะคะ 🌸` });
      for (const r of dueItems) await markRecurringReminded(r.id);
    }
    return client.replyMessage(replyToken, messages.length === 1 ? messages[0] : messages);
  }

  // ── CANCEL ───────────────────────────────────────────────────
  if (text === "ยกเลิก") {
    await clearState(userId);
    return client.replyMessage(replyToken, { type: "text", text: "✅ ยกเลิกแล้วนะคะ มีอะไรให้ช่วยอีกบอกได้เลยค่ะ 😊" });
  }

  // ── QUICK +/- (ต้องมาก่อน flow modes เพราะ override ได้เสมอ) ─
  if (/^\+\d/.test(text) && mode !== "waiting_income") {
    const m = text.match(/^\+(\d+(?:\.\d+)?)\s*(.*)/);
    if (!m) return client.replyMessage(replyToken, { type: "text", text: "❌ เช่น: +5000 เงินเดือน" });
    const amount = parseFloat(m[1]);
    const title = m[2].trim() || "รายรับ";
    await saveSession(userId, title, "income", { amount, note: title, category: "💚 รายรับ" });
    return client.replyMessage(replyToken, flexSuccess("income", amount, title));
  }
  if (/^-\d/.test(text) && mode !== "waiting_expense") {
    const m = text.match(/^-(\d+(?:\.\d+)?)\s*(.*)/);
    if (!m) return client.replyMessage(replyToken, { type: "text", text: "❌ เช่น: -60 ข้าวกลางวัน หรือ -60 ชานม #เครื่องดื่ม" });
    const { cleanText, tag } = parseExpenseTag(m[2].trim());
    const amount = parseFloat(m[1]);
    const title = cleanText || "รายจ่าย";
    return handleExpenseRecord(userId, replyToken, amount, title, tag || null);
  }

  // ── ปุ่ม Rich Menu → เปิด flow ──────────────────────────────
  if (text === "บันทึกรายรับ") {
    await setState(userId, "waiting_income", {});
    return client.replyMessage(replyToken, { type: "text", text: "💚 บันทึกรายรับค่ะ\nพิมพ์มาได้เลยนะคะ\n\nเช่น: +5000 เงินเดือน\nหรือ: 5000 เงินเดือน\n\n(พิมพ์ ยกเลิก เพื่อออกนะคะ)" });
  }
  if (text === "บันทึกรายจ่าย") {
    await setState(userId, "waiting_expense", {});
    return client.replyMessage(replyToken, { type: "text", text: "❤️ บันทึกรายจ่ายค่ะ\nพิมพ์มาได้เลยนะคะ\n\nเช่น: -60 ข้าวกลางวัน\nหรือ: 60 ข้าวกลางวัน\nหรือ: 60 ชานม #เครื่องดื่ม\n\n(พิมพ์ ยกเลิก เพื่อออกนะคะ)" });
  }

  // ── FLOW: รายรับ ─────────────────────────────────────────────
  if (mode === "waiting_income") {
    const raw = text.startsWith("+") ? text : "+" + text;
    const m = raw.match(/^\+(\d+(?:\.\d+)?)\s*(.*)/);
    if (!m) return client.replyMessage(replyToken, { type: "text", text: "❌ ลองใหม่นะคะ เช่น: 5000 เงินเดือน ค่ะ" });
    const amount = parseFloat(m[1]);
    const title = m[2].trim() || "รายรับ";
    await saveSession(userId, title, "income", { amount, note: title, category: "💚 รายรับ" });
    await clearState(userId);
    return client.replyMessage(replyToken, flexSuccess("income", amount, title));
  }

  // ── FLOW: รายจ่าย ────────────────────────────────────────────
  if (mode === "waiting_expense") {
    const raw = text.startsWith("-") ? text : "-" + text;
    const m = raw.match(/^-(\d+(?:\.\d+)?)\s*(.*)/);
    if (!m) return client.replyMessage(replyToken, { type: "text", text: "❌ ลองใหม่นะคะ เช่น: 60 ข้าวกลางวัน หรือ 60 ชานม #เครื่องดื่ม ค่ะ" });
    const amount = parseFloat(m[1]);
    const { cleanText, tag } = parseExpenseTag(m[2].trim());
    const title = cleanText || "รายจ่าย";
    await clearState(userId);
    return handleExpenseRecord(userId, replyToken, amount, title, tag || null);
  }

  // ── FLOW: รอเลือกหมวดหมู่ ────────────────────────────────────
  if (mode === "waiting_cat_confirm") {
    const { amount, title } = sd;

    // user กด __cat__XXX หรือพิมพ์ชื่อหมวดตรงๆ
    let chosenCat = null;

    if (text.startsWith("__cat__")) {
      const raw = text.replace("__cat__", "");
      if (raw === "choose__") {
        // กด "เลือกหมวดอื่น" → แสดงรายการทั้งหมด
        const qr = await buildAllCatQuickReply(userId);
        return client.replyMessage(replyToken, {
          type: "text", text: "เลือกหมวดที่ต้องการเลยนะคะ 🌸",
          quickReply: qr,
        });
      }
      chosenCat = raw;
    } else {
      // พิมพ์ชื่อหมวดตรงๆ — ตรวจว่าตรงกับหมวดที่มีอยู่ไหม
      const allCats = await buildCatList(userId);
      const found = allCats.find(c => c.name === text || c.name.includes(text));
      if (found) chosenCat = found.name;
    }

    if (!chosenCat) {
      // ไม่รู้จัก → ถามใหม่
      const qr = await buildAllCatQuickReply(userId);
      return client.replyMessage(replyToken, {
        type: "text", text: "ไม่เจอหมวดนั้นค่ะ ลองเลือกจากนี้เลยนะคะ 🌸",
        quickReply: qr,
      });
    }

    // บันทึก expense + เรียนรู้ keyword
    await clearState(userId);
    await saveSession(userId, title, "expense", { amount, note: title, category: chosenCat });

    // เรียนรู้ keyword จาก title → category นี้ (เฉพาะ user category หรือสร้างใหม่)
    const keyword = title.toLowerCase().trim();
    if (keyword.length >= 2) {
      await learnKeyword(userId, chosenCat, keyword);
    }

    const bState = await checkBudget(userId);
    if (bState && bState.alert) {
      return client.replyMessage(replyToken, flexWrap("แจ้งเตือนงบ", { type: "carousel", contents: [flexSuccess("expense", amount, title, chosenCat).contents, budgetAlertBubble(bState)] }));
    }
    return client.replyMessage(replyToken, flexSuccess("expense", amount, title, chosenCat));
  }
  if (text === "สรุป" || text === "summary") {
    return client.replyMessage(replyToken, await flexSummary(userId));
  }

  // ── MONTHLY SUMMARY (filter by month) ────────────────────────
  // "สรุปเดือนนี้" / "สรุปมีนาคม" / "สรุปเดือนที่แล้ว"
  if (text.startsWith("สรุป") && text !== "สรุป" && !text.startsWith("สรุปหมวด")) {
    const mf = parseMonthFilter(text);
    if (mf) {
      const sessions = await getSessionsByMonth(userId, mf.start, mf.end);
      return client.replyMessage(replyToken, flexMonthlySummary(sessions, mf.label));
    }
  }

  // ── CATEGORY SUMMARY PIE ─────────────────────────────────────
  // "สรุปหมวด" / "สรุปหมวดหมู่" / "สรุปหมวดเดือนนี้"
  if (text.startsWith("สรุปหมวด") || text === "หมวดหมู่") {
    // parse month filter ถ้ามี
    const mf = parseMonthFilter(text);
    let sessions, monthLabel;
    if (mf) {
      sessions = await getSessionsByMonth(userId, mf.start, mf.end);
      monthLabel = mf.label;
    } else {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      sessions = await getSessionsByMonth(userId, start, end);
      monthLabel = THAI_MONTH_NAMES[now.getMonth() + 1] + " " + (now.getFullYear() + 543);
    }
    return client.replyMessage(replyToken, await flexCategorySummary(userId, sessions, monthLabel));
  }

  // ── CATEGORY MANAGEMENT (แยกจาก pie summary) ─────────────────
  if (["จัดการหมวด", "จัดการหมวดหมู่", "ดูหมวด", "หมวด"].includes(text)) {
    return client.replyMessage(replyToken, await flexCategoryList(userId));
  }
  const addCatMatch = text.match(/^เพิ่มหมวด\s+(.+)$/);
  if (addCatMatch) {
    const catName = addCatMatch[1].trim();
    await upsertCategory(userId, catName, [], "#B898D8");
    await setState(userId, "cat_waiting_keywords", { catName });
    return client.replyMessage(replyToken, flexWrap("เพิ่มหมวดหมู่", {
      type: "bubble", size: "kilo",
      header: kawaiiHeader("✨", `สร้างหมวด "${catName}" แล้วค่ะ`, C.lavenderLight, C.lavenderPill),
      body: {
        type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "16px", spacing: "sm",
        contents: [
          { type: "text", text: "ใส่ keyword ที่ต้องการจัดอยู่ในหมวดนี้ได้เลยค่ะ", color: C.textMid, size: "sm", wrap: true },
          sep,
          { type: "text", text: "เช่น: ของขวัญ ดอกไม้ ข้าว คาเฟ่", color: C.textDark, size: "sm" },
          { type: "text", text: "คั่นด้วยช่องว่าง หรือ , ได้เลยนะคะ", color: C.textLight, size: "xs" },
        ],
      },
      footer: { type: "box", layout: "vertical", backgroundColor: C.bgPage, paddingAll: "10px", contents: [{ type: "text", text: "พิมพ์ ข้าม ถ้าจะใส่ keyword ทีหลังค่ะ", color: C.textLight, size: "xs", align: "center" }] },
    }));
  }
  if (mode === "cat_waiting_keywords") {
    const { catName } = sd;
    if (text !== "ข้าม") {
      const keywords = text.split(/[,\s]+/).map(k => k.trim()).filter(Boolean);
      await upsertCategory(userId, catName, keywords, "#B898D8");
      await clearState(userId);
      return client.replyMessage(replyToken, flexWrap("บันทึก keyword แล้ว", {
        type: "bubble", size: "kilo",
        header: kawaiiHeader("✅", "บันทึก keyword แล้วค่ะ", C.greenLight, C.greenPill),
        body: { type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "16px", spacing: "sm", contents: [{ type: "text", text: catName, size: "lg", weight: "bold", color: C.textDark, align: "center" }, sep, { type: "text", text: keywords.join("  •  "), color: C.textMid, size: "sm", wrap: true, align: "center" }, { type: "text", text: "รายจ่ายที่มีคำเหล่านี้จะถูกจัดในหมวดนี้อัตโนมัติค่ะ ✨", color: C.textLight, size: "xs", align: "center", margin: "md" }] },
      }));
    }
    await clearState(userId);
    return client.replyMessage(replyToken, { type: "text", text: `✅ สร้างหมวด "${catName}" แล้วค่ะ จะเพิ่ม keyword ทีหลังก็ได้นะคะ 🌸\nพิมพ์: keyword ${catName} > คำ1 คำ2 คำ3` });
  }
  const addKwMatch = text.match(/^keyword\s+(.+?)\s*[>:]\s*(.+)$/i);
  if (addKwMatch) {
    const catName = addKwMatch[1].trim();
    const newKws = addKwMatch[2].split(/[,\s]+/).map(k => k.trim()).filter(Boolean);
    const userCats = await getUserCategories(userId);
    const existing = userCats.find(c => c.name === catName);
    const defExists = DEFAULT_CATEGORIES.find(c => c.name === catName);
    if (!existing && !defExists) {
      return client.replyMessage(replyToken, { type: "text", text: `❌ ไม่พบหมวด "${catName}" ค่ะ\nสร้างใหม่ได้ด้วย: เพิ่มหมวด ${catName}` });
    }
    const base = existing ? (Array.isArray(existing.keywords) ? existing.keywords : []) : (defExists?.keywords || []);
    const merged = [...new Set([...base, ...newKws])];
    await upsertCategory(userId, catName, merged, existing?.color || "#B898D8");
    return client.replyMessage(replyToken, flexWrap("เพิ่ม keyword", {
      type: "bubble", size: "kilo",
      header: kawaiiHeader("🏷️", `เพิ่ม keyword ใน "${catName}"`, C.lavenderLight, C.lavenderPill),
      body: { type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "16px", spacing: "sm", contents: [{ type: "box", layout: "vertical", alignItems: "center", contents: [pill(`เพิ่มแล้ว ${newKws.length} คำ`, C.greenPill)] }, sep, { type: "text", text: newKws.join("  •  "), color: C.textMid, size: "sm", wrap: true, align: "center" }, { type: "text", text: `รวม keyword ทั้งหมด: ${merged.length} คำ`, color: C.textLight, size: "xs", align: "center", margin: "sm" }] },
    }));
  }
  const delCatMatch = text.match(/^ลบหมวด\s+(.+)$/);
  if (delCatMatch) {
    const catName = delCatMatch[1].trim();
    const ok = await deleteCategoryByName(userId, catName);
    if (!ok) {
      return client.replyMessage(replyToken, { type: "text", text: `❌ ลบไม่ได้ค่ะ หมวดเริ่มต้นไม่สามารถลบได้นะคะ 🌸\nพิมพ์ จัดการหมวด เพื่อดูหมวดที่ลบได้` });
    }
    return client.replyMessage(replyToken, { type: "text", text: `🗑️ ลบหมวด "${catName}" เรียบร้อยแล้วค่ะ 🌸` });
  }

  // ── HISTORY ──────────────────────────────────────────────────
  if (text.startsWith("ประวัติ") || text === "history") {
    let filterType = null, limit = 10;
    if (text.includes("หาร")) filterType = "split";
    else if (text.includes("รายรับ")) filterType = "income";
    else if (text.includes("รายจ่าย")) filterType = "expense";
    const n = text.match(/(\d+)/);
    if (n) limit = Math.min(parseInt(n[1]), 20);
    return client.replyMessage(replyToken, await flexHistory(userId, filterType, limit));
  }
  const delMatch = text.match(/^ลบประวัติ\s+(\d+)$/);
  if (delMatch) {
    const deleted = await deleteSession(userId, parseInt(delMatch[1]));
    if (!deleted) return client.replyMessage(replyToken, { type: "text", text: "❌ ไม่พบรายการนั้นค่ะ หรือถูกลบไปแล้วนะคะ 🌸" });
    const lbl = { income: "รายรับ", expense: "รายจ่าย", split: "หารบิล" }[deleted.type] || "";
    return client.replyMessage(replyToken, { type: "text", text: `🗑️ ลบแล้วนะคะ\n📌 "${deleted.title}" (${lbl})\n\nพิมพ์ ประวัติ เพื่อดูรายการที่เหลือได้เลยค่ะ 🌸` });
  }

  // ── ล้างประวัติ ──────────────────────────────────────────────
  if (text === "ล้างประวัติ" || text === "ล้างข้อมูล" || text === "ลบทั้งหมด") {
    await setState(userId, "confirm_clear", {});
    return client.replyMessage(replyToken, flexWrap("ยืนยันล้างข้อมูล", {
      type: "bubble", size: "kilo",
      header: kawaiiHeader("⚠️", "ล้างข้อมูลทั้งหมด", C.coralLight, C.coralPill),
      body: {
        type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "16px", spacing: "md",
        contents: [
          { type: "text", text: "ข้อมูลทั้งหมดจะถูกลบค่ะ", color: C.textDark, size: "sm", align: "center", weight: "bold" },
          { type: "text", text: "รวมถึง รายรับ รายจ่าย หารบิล\nทุกรายการของคุณจะหายไป", color: C.textMid, size: "xs", align: "center", wrap: true },
          { type: "text", text: "⚠️ ไม่สามารถกู้คืนได้", color: C.coral, size: "xs", align: "center", weight: "bold" },
        ],
      },
      footer: {
        type: "box", layout: "horizontal", spacing: "sm", paddingAll: "10px", backgroundColor: C.bgPage,
        contents: [
          { type: "button", style: "primary", color: C.coral, height: "sm", flex: 1, action: { type: "message", label: "🗑️ ยืนยันลบ", text: "ยืนยันลบทั้งหมด" } },
          { type: "button", style: "secondary", height: "sm", flex: 1, action: { type: "message", label: "❌ ยกเลิก", text: "ยกเลิก" } },
        ],
      },
    }));
  }
  if (mode === "confirm_clear" && text === "ยืนยันลบทั้งหมด") {
    const count = await deleteAllSessions(userId);
    await clearState(userId);
    return client.replyMessage(replyToken, flexWrap("ล้างข้อมูลสำเร็จ", {
      type: "bubble", size: "kilo",
      header: kawaiiHeader("✅", "ล้างข้อมูลเรียบร้อย", C.greenLight, C.greenPill),
      body: { type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "16px", spacing: "sm", contents: [{ type: "text", text: `🗑️ ลบแล้ว ${count} รายการ`, color: C.textDark, size: "lg", weight: "bold", align: "center" }, { type: "text", text: "เริ่มต้นใหม่ได้เลยค่ะ 🌸", color: C.textMid, size: "sm", align: "center", margin: "md" }] },
    }));
  }

  // ── BUDGET ───────────────────────────────────────────────────
  if (text === "ดูงบ" || text === "งบ" || text === "budget") {
    const bState = await checkBudget(userId);
    return client.replyMessage(replyToken, flexBudget(bState));
  }
  // ตั้งงบ 10000 (inline — ไม่ต้องมี mode)
  const setBudgetMatch = text.match(/^ตั้งงบ\s+(\d+(?:\.\d+)?)$/);
  if (setBudgetMatch) {
    const v = parseFloat(setBudgetMatch[1]);
    const ok = await setBudget(userId, v);
    await clearState(userId);
    if (!ok) {
      return client.replyMessage(replyToken, { type: "text", text: "❌ บันทึกงบไม่สำเร็จค่ะ กรุณาลองใหม่อีกครั้งหรือตรวจสอบ Supabase ค่ะ\n\nอาจต้องรัน SQL Schema ใหม่ค่ะ 🌸" });
    }
    if (v === 0) return client.replyMessage(replyToken, { type: "text", text: "✅ ยกเลิกการจำกัดงบประมาณแล้วค่ะ" });
    const bState = await checkBudget(userId);
    return client.replyMessage(replyToken, flexBudget(bState, true));
  }
  if (text === "ตั้งงบ") {
    const b = await getBudget(userId);
    await setState(userId, "waiting_budget", {});
    return client.replyMessage(replyToken, { type: "text", text: `💰 ตั้งงบประมาณเดือนนี้\n\nงบปัจจุบัน: ${b > 0 ? fmt(b) + " บาท" : "ยังไม่ได้ตั้ง"}\n\nพิมพ์ตัวเลขมาได้เลยค่ะ เช่น 10000\nหรือพิมพ์ 0 เพื่อยกเลิกงบ\n\n(ยกเลิก เพื่อออกนะคะ)` });
  }
  if (mode === "waiting_budget") {
    const v = parseFloat(text);
    if (isNaN(v) || v < 0) return client.replyMessage(replyToken, { type: "text", text: "❌ พิมพ์ตัวเลขนะคะ เช่น 10000\nหรือ 0 เพื่อยกเลิกงบ" });
    const ok = await setBudget(userId, v);
    await clearState(userId);
    if (!ok) return client.replyMessage(replyToken, { type: "text", text: "❌ บันทึกงบไม่สำเร็จค่ะ กรุณาตรวจสอบ Supabase ค่ะ" });
    if (v === 0) return client.replyMessage(replyToken, { type: "text", text: "✅ ยกเลิกการจำกัดงบประมาณแล้วค่ะ" });
    const bState = await checkBudget(userId);
    return client.replyMessage(replyToken, flexBudget(bState, true));
  }

  // ── RECURRING EXPENSES ───────────────────────────────────────
  // จ่ายประจำ 699 Netflix ทุกวันที่ 15
  const recMatch = text.match(/^จ่ายประจำ\s+(\d+(?:\.\d+)?)\s+(.+?)\s+ทุกวันที่\s+(\d+)$/);
  if (recMatch) {
    const amount = parseFloat(recMatch[1]);
    const description = recMatch[2].trim();
    const day = parseInt(recMatch[3]);
    if (day < 1 || day > 31) return client.replyMessage(replyToken, { type: "text", text: "❌ วันที่ไม่ถูกต้องค่ะ ใส่ 1-31 นะคะ" });
    const ok = await addRecurring(userId, description, amount, day);
    if (!ok) return client.replyMessage(replyToken, { type: "text", text: "❌ บันทึกไม่สำเร็จค่ะ กรุณาลองใหม่นะคะ" });
    return client.replyMessage(replyToken, flexWrap("เพิ่มรายจ่ายประจำ", {
      type: "bubble", size: "kilo",
      header: kawaiiHeader("🔁", "บันทึกรายจ่ายประจำแล้วค่ะ", C.blueLight, C.bluePill),
      body: {
        type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "18px", spacing: "sm",
        contents: [
          { type: "text", text: description, size: "lg", weight: "bold", color: C.textDark, align: "center" },
          sep,
          kv("💵 จำนวน", `${fmt(amount)} บาท`, C.pink),
          kv("📅 ทุกวันที่", `${day} ของเดือน`, C.blue),
          { type: "text", text: "เป๋าแพรจะเตือนเมื่อถึงกำหนดค่ะ 🌸", color: C.textLight, size: "xs", align: "center", margin: "lg" },
        ],
      },
    }));
  }
  if (["ดูรายจ่ายประจำ", "รายจ่ายประจำ", "ประจำ"].includes(text)) {
    return client.replyMessage(replyToken, await flexRecurringList(userId));
  }
  const delRecMatch = text.match(/^ลบรายจ่ายประจำ\s+(\d+)$/);
  if (delRecMatch) {
    const deleted = await deleteRecurring(userId, parseInt(delRecMatch[1]));
    if (!deleted) return client.replyMessage(replyToken, { type: "text", text: "❌ ไม่พบรายการนั้นค่ะ" });
    return client.replyMessage(replyToken, { type: "text", text: `🗑️ ลบ "${deleted.description}" เรียบร้อยแล้วค่ะ 🌸` });
  }

  // ── BILL SPLIT FLOW ──────────────────────────────────────────
  if (["หาร", "หารค่าข้าว", "หารบิล", "หารเงิน"].includes(text)) {
    await setState(userId, "split_waiting_title", {});
    return client.replyMessage(replyToken, { type: "text", text: "🍱 หารค่าอาหารเลยนะคะ!\n\n📌 ตั้งชื่อรายการนี้ก่อนนะคะ\nเช่น: หารเงิน Grab วันศุกร์\n\nพิมพ์ชื่อมาได้เลยค่ะ 💕\n(ยกเลิก เพื่อออกนะคะ)" });
  }
  if (mode === "split_waiting_title") {
    if (text.length < 2) return client.replyMessage(replyToken, { type: "text", text: "❌ ชื่อสั้นไปค่ะ ลองใหม่นะคะ 😊" });
    await setState(userId, "split_waiting_orders", { title: text });
    return client.replyMessage(replyToken, { type: "text", text: `✅ ชื่อรายการ: "${text}"\n\n📋 ส่งรายการอาหารมาได้เลยค่ะ\nรูปแบบ: ชื่อ เมนู ราคา, ...\n\nเช่น: A กะเพรา 60, B ผัดซีอิ๊ว 50\nหรือ: แบงค์ 60, มิ้น 40\n\n(ยกเลิก เพื่อออกนะคะ)` });
  }
  if (mode === "split_waiting_orders") {
    const orders = parseOrders(text);
    if (!orders) return client.replyMessage(replyToken, { type: "text", text: "❌ รูปแบบไม่ถูกต้องค่ะ\nเช่น: A กะเพรา 60, B ข้าวไข่เจียว 40" });
    const total = orders.reduce((s, o) => s + o.price, 0);
    await setState(userId, "split_waiting_discount", { ...sd, orders });
    const list = orders.map(o => `  • ${o.name} (${o.item}) = ${fmt(o.price)} บาท`).join("\n");
    return client.replyMessage(replyToken, { type: "text", text: `✅ รับรายการแล้วค่ะ\n${list}\n\nรวม: ${fmt(total)} บาท\n\n🎫 มีส่วนลดไหมคะ?\nไม่มีพิมพ์ 0 ได้เลยค่ะ\n\n(ยกเลิก เพื่อออกนะคะ)` });
  }
  if (mode === "split_waiting_discount") {
    const discount = parseFloat(text);
    if (isNaN(discount) || discount < 0) return client.replyMessage(replyToken, { type: "text", text: "❌ ใส่ตัวเลขนะคะ เช่น 30 หรือ 0 ค่ะ" });
    const { title, orders } = sd;
    const totalBefore = orders.reduce((s, o) => s + o.price, 0);
    if (discount > totalBefore) return client.replyMessage(replyToken, { type: "text", text: `❌ ส่วนลด (${fmt(discount)}) มากกว่าราคารวม (${fmt(totalBefore)}) นะคะ ลองใหม่ค่ะ` });
    const results = calcSplit(orders, discount);
    await setState(userId, "split_waiting_promptpay", { ...sd, discount, results });
    const list = results.map(r => `  • ${r.name}: ${fmt(r.finalPay)} บาท`).join("\n");
    return client.replyMessage(replyToken, { type: "text", text: `✅ คำนวณเสร็จแล้วค่ะ\n${list}\n\n💳 ต้องการ Generate QR PromptPay ไหมคะ?\nใส่เบอร์โทรที่ผูก PromptPay\nเช่น: 0812345678\n\nหรือพิมพ์ ข้าม ถ้าไม่ต้องการ QR ค่ะ\n(ยกเลิก เพื่อออกนะคะ)` });
  }
  if (mode === "split_waiting_promptpay") {
    const { title, orders, discount, results } = sd;
    const totalBefore = orders.reduce((s, o) => s + o.price, 0);
    const totalAfter = results.reduce((s, r) => s + r.finalPay, 0);
    if (text === "ข้าม") {
      await saveSession(userId, title, "split", {
        participants: results.map(r => ({ name: r.name, item: r.item, price: r.price, discountShare: r.discountShare, finalPay: r.finalPay })),
        discount, totalBefore, totalAfter,
      });
      await clearState(userId);
      return client.replyMessage(replyToken, flexSplit(title, results, discount));
    }
    const phone = text.replace(/[\s-]/g, "");
    if (!/^0\d{9}$/.test(phone)) {
      return client.replyMessage(replyToken, { type: "text", text: "❌ เบอร์โทรไม่ถูกต้องค่ะ ใส่ 10 หลัก เช่น 0812345678\nหรือพิมพ์ ข้าม ถ้าไม่ต้องการ QR นะคะ" });
    }
    if (!getPublicUrl()) {
      // ไม่มี PUBLIC_URL — บันทึกและแสดงแบบไม่มี QR
      await saveSession(userId, title, "split", {
        participants: results.map(r => ({ name: r.name, item: r.item, price: r.price, discountShare: r.discountShare, finalPay: r.finalPay })),
        discount, totalBefore, totalAfter,
      });
      await clearState(userId);
      return client.replyMessage(replyToken, flexSplit(title, results, discount));
    }
    const qrIds = results.map(r => storeQR(phone, r.finalPay));
    const sessionId = await saveSession(userId, title, "split", {
      participants: results.map(r => ({ name: r.name, item: r.item, price: r.price, discountShare: r.discountShare, finalPay: r.finalPay, paid: false })),
      discount, totalBefore, totalAfter, promptpayPhone: phone,
    });
    await clearState(userId);
    return client.replyMessage(replyToken, flexSplitWithQR(title, results, discount, phone, qrIds, sessionId));
  }

  // ── DEFAULT ──────────────────────────────────────────────────
  // ถ้า user ส่ง recurring reminder ที่ถึงกำหนด ให้แสดงใน default response ด้วย
  if (!event.source.groupId) {
    const helpText = "เป๋าแพรไม่เข้าใจคำสั่งนี้ค่ะ 😅\nพิมพ์ เมนู เพื่อดูสิ่งที่เป๋าแพรช่วยได้นะคะ 🌸";
    if (dueItems.length > 0) {
      const reminderText = dueItems.map(r => `🔔 ${r.description} — ${fmt(r.amount)} บาท (ทุกวันที่ ${r.day_of_month})`).join("\n");
      for (const r of dueItems) await markRecurringReminded(r.id);
      return client.replyMessage(replyToken, [
        { type: "text", text: helpText },
        { type: "text", text: `⏰ รายจ่ายประจำที่ถึงกำหนดค่ะ!\n\n${reminderText}\n\nบันทึกได้เลยนะคะ 🌸` }
      ]);
    }
    return client.replyMessage(replyToken, { type: "text", text: helpText });
  }
}

// ════════════════════════════════════════════════════════════════
//  POSTBACK HANDLER
// ════════════════════════════════════════════════════════════════
async function handlePostback(event) {
  if (event.type !== "postback") return;
  const replyToken = event.replyToken;
  const data = event.postback.data;

  if (data.startsWith("confirm_pay|")) {
    const parts = data.split("|");
    const sessionId = parseInt(parts[1]);
    const personIndex = parseInt(parts[2]);
    const qrId = parts[3];
    const personName = parts[4];

    const wasDeleted = qrStore.delete(qrId);
    if (!wasDeleted) {
      return client.replyMessage(replyToken, { type: "text", text: `⚠️ QR ของ ${personName} หมดอายุหรือถูกยืนยันไปแล้วค่ะ` });
    }
    try {
      const { data: session } = await supabase.from("sessions").select("summary").eq("id", sessionId).maybeSingle();
      if (session) {
        const summary = typeof session.summary === "string" ? JSON.parse(session.summary) : session.summary;
        if (summary.participants && summary.participants[personIndex]) {
          summary.participants[personIndex].paid = true;
          await supabase.from("sessions").update({ summary }).eq("id", sessionId);
        }
        const totalPeople = summary.participants.length;
        const paidCount = summary.participants.filter(p => p.paid).length;
        const allPaid = paidCount === totalPeople;
        const paidPerson = summary.participants[personIndex];
        return client.replyMessage(replyToken, flexWrap("ยืนยันจ่ายเงินแล้ว", {
          type: "bubble", size: "kilo",
          header: kawaiiHeader(allPaid ? "🎉" : "✅", allPaid ? "จ่ายครบแล้ว!" : "ยืนยันจ่ายเงิน", allPaid ? C.greenLight : C.peachLight, allPaid ? C.greenPill : C.peachPill),
          body: {
            type: "box", layout: "vertical", backgroundColor: C.white, paddingAll: "16px", spacing: "md",
            contents: [
              { type: "box", layout: "vertical", backgroundColor: C.greenLight, cornerRadius: "10px", paddingAll: "14px", contents: [{ type: "text", text: `👤 ${personName}`, color: C.textDark, size: "lg", weight: "bold", align: "center" }, { type: "text", text: `💵 จ่าย ${fmt(paidPerson.finalPay)} บาท`, color: C.green, size: "md", weight: "bold", align: "center", margin: "sm" }, { type: "text", text: "✅ เรียบร้อยแล้วค่ะ!", color: C.greenPill, size: "sm", align: "center", margin: "sm" }] },
              sep,
              ...summary.participants.map(p => ({ type: "box", layout: "horizontal", margin: "xs", contents: [{ type: "text", text: `${p.paid ? "✅" : "⏳"} ${p.name}`, color: p.paid ? C.green : C.textMid, size: "sm", flex: 3 }, { type: "text", text: `${fmt(p.finalPay)} บาท`, color: p.paid ? C.green : C.textMid, size: "sm", align: "end", flex: 2, weight: p.paid ? "bold" : "regular" }] })),
              { type: "text", text: allPaid ? "🎉 ทุกคนจ่ายครบแล้วค่ะ!" : `📊 จ่ายแล้ว ${paidCount}/${totalPeople} คน`, color: allPaid ? C.green : C.peach, size: "sm", weight: "bold", align: "center", margin: "md" },
            ],
          },
        }));
      }
    } catch (err) { console.error("Postback error:", err); }
    return client.replyMessage(replyToken, { type: "text", text: `✅ ${personName} จ่ายเรียบร้อยแล้วค่ะ! 💕` });
  }
}

// ════════════════════════════════════════════════════════════════
//  EVENT ROUTER
// ════════════════════════════════════════════════════════════════
async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "text") return handleMessage(event);
  if (event.type === "postback") return handlePostback(event);
}

// ════════════════════════════════════════════════════════════════
//  EXPRESS
// ════════════════════════════════════════════════════════════════
app.get("/qr/:id", async (req, res) => {
  try {
    const data = qrStore.get(req.params.id);
    if (!data) return res.status(404).send("QR expired or not found");
    const payload = generatePayload(data.phone, { amount: data.amount });
    const buffer = await QRCode.toBuffer(payload, { width: 400, margin: 2, color: { dark: "#3A3A4A", light: "#FFFFFF" } });
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=1800");
    res.send(buffer);
  } catch (err) {
    console.error("QR error:", err);
    res.status(500).send("Error generating QR");
  }
});

app.get("/chart/:id", (req, res) => {
  try {
    const buffer = chartStore.get(req.params.id);
    if (!buffer) return res.status(404).send("Chart expired or not found");
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=1800");
    res.send(buffer);
  } catch (err) {
    res.status(500).send("Error serving chart");
  }
});

app.post("/webhook", middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.status(200).json({ status: "ok" });
  } catch (err) {
    if (err.originalError?.response?.data) {
      console.error("LINE API error:", JSON.stringify(err.originalError.response.data, null, 2));
    }
    console.error("Webhook error:", err.message || err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (_req, res) => res.send("🌸 เป๋าแพร Line OA Bot v5 is running!"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌸 เป๋าแพร v5 running on port ${PORT}`);
  console.log(`   PUBLIC_URL: ${getPublicUrl() || "(ไม่ได้ตั้ง — pie chart ใช้ text mode)"}`);
});