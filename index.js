// ═══════════════════════════════════════════════════════════════
//  เป๋าแพร — Line OA Daily Bot  v4  (Flex Message Edition)
//  ผู้ช่วยส่วนตัวสำหรับบันทึกรายรับรายจ่าย และหารค่าอาหาร 🌸
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
//  THEME
// ════════════════════════════════════════════════════════════════
const C = {
  // Pastel Kawaii — ตรงธีม Rich Menu
  green: "#72C472",  // รายรับ - mint green
  greenLight: "#D8F2D8",
  greenPill: "#5AB55A",

  pink: "#E87EA0",  // รายจ่าย - pink
  pinkLight: "#FFE0EC",
  pinkPill: "#D4607E",

  blue: "#7AAFC8",  // สรุป - blue-gray
  blueLight: "#D8EEF8",
  bluePill: "#5A96B4",

  peach: "#F0BC6A",  // หารบิล - peach
  peachLight: "#FFF0D0",
  peachPill: "#D89A44",

  lavender: "#B898D8",  // ประวัติ - lavender
  lavenderLight: "#EDE0FF",
  lavenderPill: "#9878C0",

  coral: "#F08888",  // เมนู/ลบ - coral
  coralLight: "#FFE0E0",
  coralPill: "#D86868",

  bgPage: "#EAF2FF",
  white: "#FFFFFF",
  textDark: "#3A3A4A",
  textMid: "#7A7A8A",
  textLight: "#AAAABC",
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

// ════════════════════════════════════════════════════════════════
//  DATABASE
// ════════════════════════════════════════════════════════════════
async function getState(userId) {
  const { data } = await supabase.from("bot_state").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return { mode: null, data: {} };
  return { mode: data.mode, data: typeof data.data === "string" ? JSON.parse(data.data) : (data.data || {}) };
}
async function setState(userId, mode, data = {}) {
  await supabase.from("bot_state").upsert({ user_id: userId, mode, data, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
}
async function clearState(userId) {
  await supabase.from("bot_state").delete().eq("user_id", userId);
}
async function saveSession(userId, title, type, summary) {
  const { data, error } = await supabase.from("sessions").insert({ user_id: userId, title, type, summary }).select("id").single();
  if (error) throw error;
  return data.id;
}
async function getSessions(userId, type = null, limit = 10) {
  let q = supabase.from("sessions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  if (type) q = q.eq("type", type);
  const { data } = await q;
  return data || [];
}
async function deleteSession(userId, sessionId) {
  const { data } = await supabase.from("sessions").select("id,title,type").eq("user_id", userId).eq("id", sessionId).maybeSingle();
  if (!data) return null;
  await supabase.from("sessions").delete().eq("user_id", userId).eq("id", sessionId);
  return data;
}

// ════════════════════════════════════════════════════════════════
//  BILL SPLIT
// ════════════════════════════════════════════════════════════════
function calcSplit(orders, totalDiscount) {
  const totalBefore = orders.reduce((s, o) => s + o.price, 0);
  if (totalBefore === 0) return [];
  return orders.map((o) => {
    const share = totalDiscount * (o.price / totalBefore);
    return { ...o, discountShare: share, finalPay: o.price - share };
  });
}
function parseOrders(text) {
  const orders = [];
  for (const part of text.split(",").map((s) => s.trim())) {
    const m = part.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const words = m[1].trim().split(/\s+/);
    orders.push({ name: words[0], item: words.slice(1).join(" ") || "รายการ", price: parseFloat(m[2]) });
  }
  return orders.length > 0 ? orders : null;
}

// ════════════════════════════════════════════════════════════════
//  FLEX HELPERS  — Pastel Kawaii Style
// ════════════════════════════════════════════════════════════════
const sep = { type: "separator", margin: "md", color: "#E8E8F0" };

function flexWrap(altText, bubble) {
  return { type: "flex", altText, contents: bubble };
}

// pill label เหมือน Rich Menu
function pill(text, bgColor) {
  return {
    type: "box", layout: "vertical",
    backgroundColor: bgColor, cornerRadius: "20px",
    paddingTop: "5px", paddingBottom: "5px",
    paddingStart: "14px", paddingEnd: "14px",
    contents: [{ type: "text", text, color: C.white, size: "sm", weight: "bold", align: "center" }],
  };
}

// header แบบ kawaii — สีพาสเทลพร้อม emoji icon
function kawaiiHeader(icon, label, bgColor, pillColor) {
  return {
    type: "box", layout: "vertical",
    backgroundColor: bgColor,
    paddingTop: "18px", paddingBottom: "14px",
    paddingStart: "16px", paddingEnd: "16px",
    spacing: "sm",
    contents: [
      { type: "text", text: icon, size: "3xl", align: "center" },
      {
        type: "box", layout: "vertical", alignItems: "center", margin: "sm",
        contents: [pill(label, pillColor)],
      },
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
function flexSuccess(type, amount, title) {
  const isIn = type === "income";
  const color = isIn ? C.green : C.pink;
  const bgLight = isIn ? C.greenLight : C.pinkLight;
  const pillCol = isIn ? C.greenPill : C.pinkPill;
  const sign = isIn ? "+" : "-";
  const icon = isIn ? "💰" : "🛍️";
  const label = isIn ? "รายรับ" : "รายจ่าย";

  return flexWrap(`บันทึก${label}แล้วค่ะ`, {
    type: "bubble", size: "kilo",
    header: kawaiiHeader(icon, `บันทึก${label}`, bgLight, pillCol),
    body: {
      type: "box", layout: "vertical",
      backgroundColor: C.white, paddingAll: "18px", spacing: "sm",
      contents: [
        {
          type: "text", text: `${sign}${fmt(amount)} บาท`,
          size: "xxl", weight: "bold", color: color, align: "center"
        },
        sep,
        kv("📌 หัวข้อ", title),
        {
          type: "text", text: "✨ บันทึกในประวัติแล้วค่ะ",
          color: C.textLight, size: "xs", align: "center", margin: "lg"
        },
      ],
    },
  });
}

// ── 2. SUMMARY ────────────────────────────────────────────────
async function flexSummary(userId) {
  const sessions = await getSessions(userId, null, 200);
  const incomes = sessions.filter((s) => s.type === "income");
  const expenses = sessions.filter((s) => s.type === "expense");
  const totalIn = incomes.reduce((s, r) => s + Number(r.summary.amount), 0);
  const totalOut = expenses.reduce((s, r) => s + Number(r.summary.amount), 0);
  const balance = totalIn - totalOut;
  const pos = balance >= 0;

  const makeRows = (list, sign, color) =>
    list.length > 0
      ? list.slice(0, 5).reverse().map((s) => ({
        type: "box", layout: "horizontal", margin: "xs",
        contents: [
          { type: "text", text: s.title, color: C.textMid, size: "xs", flex: 3, wrap: true },
          { type: "text", text: `${sign}${fmt(s.summary.amount)}`, color, size: "xs", flex: 2, align: "end", weight: "bold" },
        ],
      }))
      : [{ type: "text", text: "ยังไม่มีรายการค่ะ", color: C.textLight, size: "xs", margin: "xs" }];

  return flexWrap("สรุปรายรับรายจ่าย", {
    type: "bubble", size: "mega",
    header: kawaiiHeader("📊", "สรุปรายรับรายจ่าย", C.blueLight, C.bluePill),
    body: {
      type: "box", layout: "vertical",
      backgroundColor: C.white, paddingAll: "16px", spacing: "md",
      contents: [
        // รายรับ
        {
          type: "box", layout: "vertical",
          backgroundColor: C.greenLight, cornerRadius: "12px", paddingAll: "12px",
          contents: [
            {
              type: "box", layout: "horizontal", contents: [
                {
                  type: "box", layout: "vertical", alignItems: "flex-start", flex: 1,
                  contents: [pill("💚 รายรับ", C.greenPill)]
                },
                {
                  type: "text", text: `+${fmt(totalIn)} บาท`, weight: "bold",
                  color: C.green, size: "sm", align: "end", flex: 2
                },
              ]
            },
            sep,
            ...makeRows(incomes, "+", C.green),
          ],
        },
        // รายจ่าย
        {
          type: "box", layout: "vertical",
          backgroundColor: C.pinkLight, cornerRadius: "12px", paddingAll: "12px",
          contents: [
            {
              type: "box", layout: "horizontal", contents: [
                {
                  type: "box", layout: "vertical", alignItems: "flex-start", flex: 1,
                  contents: [pill("❤️ รายจ่าย", C.pinkPill)]
                },
                {
                  type: "text", text: `-${fmt(totalOut)} บาท`, weight: "bold",
                  color: C.pink, size: "sm", align: "end", flex: 2
                },
              ]
            },
            sep,
            ...makeRows(expenses, "-", C.pink),
          ],
        },
        // คงเหลือ
        {
          type: "box", layout: "vertical",
          backgroundColor: pos ? C.greenLight : C.pinkLight,
          cornerRadius: "12px", paddingAll: "14px",
          contents: [
            {
              type: "box", layout: "vertical", alignItems: "center", margin: "xs",
              contents: [pill(pos ? "✅ คงเหลือ" : "⚠️ ติดลบ", pos ? C.greenPill : C.pinkPill)]
            },
            {
              type: "text", text: `${pos ? "+" : ""}${fmt(balance)} บาท`,
              color: pos ? C.green : C.pink, size: "xl", weight: "bold", align: "center", margin: "sm"
            },
          ],
        },
      ],
    },
    footer: {
      type: "box", layout: "vertical",
      backgroundColor: C.blueLight, paddingAll: "10px",
      contents: [{
        type: "text", text: "พิมพ์ ประวัติ เพื่อดูรายละเอียดทั้งหมดนะคะ 💕",
        color: C.bluePill, size: "xs", align: "center"
      }],
    },
  });
}

// ── 3. HISTORY (carousel + ปุ่มลบ) ──────────────────────────
async function flexHistory(userId, filterType = null, limit = 10) {
  const sessions = await getSessions(userId, filterType, limit);

  if (sessions.length === 0) {
    const label = filterType
      ? ({ income: "รายรับ", expense: "รายจ่าย", split: "หารบิล" }[filterType]) : "การใช้งาน";
    return flexWrap("ไม่พบประวัติ", {
      type: "bubble", size: "kilo",
      body: {
        type: "box", layout: "vertical",
        backgroundColor: C.bgPage, paddingAll: "28px", spacing: "sm",
        contents: [
          { type: "text", text: "📭", size: "3xl", align: "center" },
          {
            type: "text", text: `ยังไม่มีประวัติ${label}ค่ะ`,
            color: C.textMid, align: "center", margin: "md"
          },
          {
            type: "box", layout: "vertical", alignItems: "center", margin: "md",
            contents: [pill("ลองใช้งานก่อนนะคะ 🌸", C.lavenderPill)]
          },
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
      detailRows = [kv("💵 จำนวน", `${sign}${fmt(s.summary.amount)} บาท`, cfg.color)];
    } else if (s.type === "split") {
      const p = s.summary.participants || [];
      detailRows = [
        ...p.map((r) => kv(`👤 ${r.name} (${r.item})`, `${fmt(r.finalPay)} บาท`, cfg.color)),
        ...(s.summary.discount > 0 ? [kv("🎫 ส่วนลด", `-${fmt(s.summary.discount)} บาท`, C.peach)] : []),
        kv("✅ รวมสุทธิ", `${fmt(s.summary.totalAfter)} บาท`, cfg.color),
      ];
    }

    return {
      type: "bubble", size: "kilo",
      header: {
        type: "box", layout: "vertical",
        backgroundColor: cfg.bg, paddingAll: "14px", spacing: "sm",
        contents: [
          {
            type: "box", layout: "horizontal", contents: [
              {
                type: "box", layout: "vertical", alignItems: "flex-start", flex: 1,
                contents: [pill(`${cfg.icon} ${cfg.label}`, cfg.pill)]
              },
              { type: "text", text: `#${i + 1}`, color: C.textLight, size: "xs", align: "end" },
            ]
          },
          {
            type: "text", text: s.title, color: C.textDark, size: "sm",
            weight: "bold", margin: "sm", wrap: true
          },
          {
            type: "text", text: `📅 ${fmtDate(s.created_at)}`,
            color: C.textMid, size: "xs", margin: "xs"
          },
        ],
      },
      body: {
        type: "box", layout: "vertical",
        backgroundColor: C.white, paddingAll: "14px", spacing: "xs",
        contents: detailRows,
      },
      footer: {
        type: "box", layout: "vertical",
        backgroundColor: C.coralLight, paddingAll: "10px",
        contents: [{
          type: "button", style: "primary", color: C.coral, height: "sm",
          action: { type: "message", label: "🗑️ ลบรายการนี้", text: `ลบประวัติ ${s.id}` },
        }],
      },
    };
  });

  const hdrLabel = filterType ? (typeCfg[filterType]?.label || "") : "ทั้งหมด";
  return flexWrap(`ประวัติ${hdrLabel}`, { type: "carousel", contents: bubbles });
}

// ── 4. SPLIT RESULT ───────────────────────────────────────────
function flexSplit(title, results, discount) {
  const totalAfter = results.reduce((s, r) => s + r.finalPay, 0);

  const personCards = results.map((r) => ({
    type: "box", layout: "vertical",
    backgroundColor: C.peachLight, cornerRadius: "10px", paddingAll: "12px", margin: "sm",
    contents: [
      {
        type: "box", layout: "horizontal", contents: [
          {
            type: "box", layout: "vertical", alignItems: "flex-start", flex: 1,
            contents: [pill(`👤 ${r.name}`, C.peachPill)]
          },
          { type: "text", text: r.item, color: C.textMid, size: "xs", align: "end" },
        ]
      },
      ...(discount > 0 ? [{
        type: "box", layout: "horizontal", margin: "sm",
        contents: [
          { type: "text", text: `ราคา: ${fmt(r.price)} บาท`, color: C.textMid, size: "xs", flex: 1 },
          { type: "text", text: `-${fmt(r.discountShare)} บาท`, color: C.peach, size: "xs", align: "end" },
        ],
      }] : []),
      {
        type: "text", text: `💵  ${fmt(r.finalPay)} บาท`,
        color: C.peach, size: "lg", weight: "bold", align: "center", margin: "sm"
      },
    ],
  }));

  return flexWrap(`หารบิล: ${title}`, {
    type: "bubble", size: "mega",
    header: kawaiiHeader("🍱", title, C.peachLight, C.peachPill),
    body: {
      type: "box", layout: "vertical",
      backgroundColor: C.white, paddingAll: "14px", spacing: "xs",
      contents: [
        ...personCards,
        sep,
        ...(discount > 0 ? [{
          type: "box", layout: "horizontal", margin: "sm",
          contents: [
            { type: "text", text: "🎫 ส่วนลดรวม", color: C.peach, size: "sm", flex: 1 },
            { type: "text", text: `-${fmt(discount)} บาท`, color: C.peach, weight: "bold", size: "sm", align: "end" },
          ],
        }] : []),
        {
          type: "box", layout: "vertical",
          backgroundColor: C.peachLight, cornerRadius: "10px", paddingAll: "12px", margin: "sm",
          contents: [
            {
              type: "box", layout: "vertical", alignItems: "center",
              contents: [pill("✅ รวมสุทธิ", C.peachPill)]
            },
            {
              type: "text", text: `${fmt(totalAfter)} บาท`,
              color: C.peach, size: "xl", weight: "bold", align: "center", margin: "sm"
            },
          ],
        },
      ],
    },
    footer: {
      type: "box", layout: "vertical",
      backgroundColor: C.lavenderLight, paddingAll: "10px",
      contents: [{
        type: "text", text: "💾 เป๋าแพรบันทึกไว้ในประวัติแล้วค่ะ 🌸",
        color: C.lavenderPill, size: "xs", align: "center"
      }],
    },
  });
}

// ── 5. SPLIT RESULT + QR CODE ─────────────────────────────────
// In-memory QR store — auto-expire หลัง 30 นาที
const qrStore = new Map();
const QR_EXPIRE_MS = 30 * 60 * 1000;

function storeQR(phone, amount) {
  const id = crypto.randomBytes(8).toString("hex");
  qrStore.set(id, { phone, amount });
  setTimeout(() => qrStore.delete(id), QR_EXPIRE_MS);
  return id;
}

function getPublicUrl() {
  // ใช้ PUBLIC_URL จาก env หรือ fallback เป็น localhost
  return (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");
}

function flexSplitWithQR(title, results, discount, phone, qrIds, sessionId) {
  const totalAfter = results.reduce((s, r) => s + r.finalPay, 0);
  const baseUrl = getPublicUrl();

  // ── Bubble 1: สรุปผลลัพธ์ (คล้าย flexSplit เดิม) ────────
  const personCards = results.map((r) => ({
    type: "box", layout: "vertical",
    backgroundColor: C.peachLight, cornerRadius: "10px", paddingAll: "12px", margin: "sm",
    contents: [
      {
        type: "box", layout: "horizontal", contents: [
          {
            type: "box", layout: "vertical", alignItems: "flex-start", flex: 1,
            contents: [pill(`👤 ${r.name}`, C.peachPill)]
          },
          { type: "text", text: r.item, color: C.textMid, size: "xs", align: "end" },
        ]
      },
      ...(discount > 0 ? [{
        type: "box", layout: "horizontal", margin: "sm",
        contents: [
          { type: "text", text: `ราคา: ${fmt(r.price)} บาท`, color: C.textMid, size: "xs", flex: 1 },
          { type: "text", text: `-${fmt(r.discountShare)} บาท`, color: C.peach, size: "xs", align: "end" },
        ],
      }] : []),
      {
        type: "text", text: `💵  ${fmt(r.finalPay)} บาท`,
        color: C.peach, size: "lg", weight: "bold", align: "center", margin: "sm"
      },
    ],
  }));

  const summaryBubble = {
    type: "bubble", size: "mega",
    header: kawaiiHeader("🍱", title, C.peachLight, C.peachPill),
    body: {
      type: "box", layout: "vertical",
      backgroundColor: C.white, paddingAll: "14px", spacing: "xs",
      contents: [
        ...personCards,
        sep,
        ...(discount > 0 ? [{
          type: "box", layout: "horizontal", margin: "sm",
          contents: [
            { type: "text", text: "🎫 ส่วนลดรวม", color: C.peach, size: "sm", flex: 1 },
            { type: "text", text: `-${fmt(discount)} บาท`, color: C.peach, weight: "bold", size: "sm", align: "end" },
          ],
        }] : []),
        {
          type: "box", layout: "vertical",
          backgroundColor: C.peachLight, cornerRadius: "10px", paddingAll: "12px", margin: "sm",
          contents: [
            {
              type: "box", layout: "vertical", alignItems: "center",
              contents: [pill("✅ รวมสุทธิ", C.peachPill)]
            },
            {
              type: "text", text: `${fmt(totalAfter)} บาท`,
              color: C.peach, size: "xl", weight: "bold", align: "center", margin: "sm"
            },
          ],
        },
      ],
    },
    footer: {
      type: "box", layout: "vertical",
      backgroundColor: C.lavenderLight, paddingAll: "10px",
      contents: [{
        type: "text", text: "💾 บันทึกในประวัติแล้ว | เลื่อนขวาดู QR 💳",
        color: C.lavenderPill, size: "xs", align: "center"
      }],
    },
  };

  // ── Bubble 2-N: QR code ต่อคน ─────────────────────────────
  const phoneFmt = phone.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  const qrBubbles = results.map((r, i) => {
    const qrUrl = `${baseUrl}/qr/${qrIds[i]}`;
    const postbackData = `confirm_pay|${sessionId}|${i}|${qrIds[i]}|${r.name}`;
    return {
      type: "bubble", size: "kilo",
      header: {
        type: "box", layout: "vertical",
        backgroundColor: C.peachLight, paddingAll: "14px", spacing: "xs",
        contents: [
          {
            type: "box", layout: "vertical", alignItems: "center",
            contents: [pill("💳 PromptPay QR", C.peachPill)]
          },
          { type: "text", text: `👤 ${r.name}`, color: C.textDark, size: "md", weight: "bold", align: "center", margin: "sm" },
          { type: "text", text: r.item, color: C.textMid, size: "xs", align: "center" },
        ],
      },
      hero: {
        type: "image", url: qrUrl,
        size: "full", aspectMode: "fit", aspectRatio: "1:1",
        backgroundColor: "#FFFFFF",
      },
      body: {
        type: "box", layout: "vertical",
        backgroundColor: C.white, paddingAll: "14px", spacing: "sm",
        contents: [
          {
            type: "text", text: `${fmt(r.finalPay)} บาท`,
            color: C.peach, size: "xl", weight: "bold", align: "center"
          },
          sep,
          { type: "text", text: `📱 PromptPay: ${phoneFmt}`, color: C.textMid, size: "xs", align: "center", margin: "sm" },
          { type: "text", text: "สแกน QR ด้วยแอปธนาคาร", color: C.textLight, size: "xxs", align: "center" },
        ],
      },
      footer: {
        type: "box", layout: "vertical",
        backgroundColor: C.greenLight, paddingAll: "10px", spacing: "sm",
        contents: [
          {
            type: "button", style: "primary", color: C.green, height: "sm",
            action: { type: "postback", label: "✅ จ่ายแล้ว", data: postbackData, displayText: `✅ ${r.name} จ่ายแล้ว!` },
          },
          {
            type: "text", text: `💵 จ่ายให้ ${phoneFmt} จำนวน ${fmt(r.finalPay)} บาท`,
            color: C.textMid, size: "xxs", align: "center", wrap: true
          },
        ],
      },
    };
  });

  return flexWrap(`หารบิล: ${title} + QR`, {
    type: "carousel", contents: [summaryBubble, ...qrBubbles],
  });
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

  // ── MENU ────────────────────────────────────────────────────
  if (["เมนู", "help", "menu", "สวัสดี", "หวัดดี", "ช่วยด้วย"].includes(text.toLowerCase())) {
    await clearState(userId);
    return client.replyMessage(replyToken, flexWrap("เมนูเป๋าแพร", {
      type: "bubble", size: "mega",
      header: kawaiiHeader("🌸", "สวัสดีค่ะ! เป๋าแพรยินดีช่วยเลยนะคะ", C.pinkLight, C.pinkPill),
      body: {
        type: "box", layout: "vertical",
        backgroundColor: C.bgPage, paddingAll: "14px", spacing: "sm",
        contents: [
          {
            type: "box", layout: "horizontal",
            backgroundColor: C.greenLight, cornerRadius: "12px", paddingAll: "14px",
            action: { type: "message", label: "รายรับ", text: "บันทึกรายรับ" },
            contents: [
              { type: "text", text: "💰", size: "xxl", flex: 0 },
              {
                type: "box", layout: "vertical", margin: "md", flex: 1, spacing: "xs",
                contents: [
                  {
                    type: "box", layout: "vertical", alignItems: "flex-start",
                    contents: [pill("รายรับ", C.greenPill)]
                  },
                  { type: "text", text: "+ จำนวน หมายเหตุ", color: C.textMid, size: "xs" },
                ]
              },
            ],
          },
          {
            type: "box", layout: "horizontal",
            backgroundColor: C.pinkLight, cornerRadius: "12px", paddingAll: "14px",
            action: { type: "message", label: "รายจ่าย", text: "บันทึกรายจ่าย" },
            contents: [
              { type: "text", text: "🛍️", size: "xxl", flex: 0 },
              {
                type: "box", layout: "vertical", margin: "md", flex: 1, spacing: "xs",
                contents: [
                  {
                    type: "box", layout: "vertical", alignItems: "flex-start",
                    contents: [pill("รายจ่าย", C.pinkPill)]
                  },
                  { type: "text", text: "- จำนวน หมายเหตุ", color: C.textMid, size: "xs" },
                ]
              },
            ],
          },
          {
            type: "box", layout: "horizontal", spacing: "sm",
            contents: [
              {
                type: "box", layout: "vertical", flex: 1,
                backgroundColor: C.blueLight, cornerRadius: "12px", paddingAll: "14px",
                action: { type: "message", label: "สรุป", text: "สรุป" },
                contents: [
                  { type: "text", text: "📊", size: "xxl", align: "center" },
                  {
                    type: "box", layout: "vertical", alignItems: "center", margin: "sm",
                    contents: [pill("สรุป", C.bluePill)]
                  },
                  { type: "text", text: "รายรับ-รายจ่าย", color: C.textMid, size: "xxs", align: "center" },
                ],
              },
              {
                type: "box", layout: "vertical", flex: 1,
                backgroundColor: C.lavenderLight, cornerRadius: "12px", paddingAll: "14px",
                action: { type: "message", label: "ประวัติ", text: "ประวัติ" },
                contents: [
                  { type: "text", text: "📚", size: "xxl", align: "center" },
                  {
                    type: "box", layout: "vertical", alignItems: "center", margin: "sm",
                    contents: [pill("ประวัติ", C.lavenderPill)]
                  },
                  { type: "text", text: "ดูบันทึกทั้งหมด", color: C.textMid, size: "xxs", align: "center" },
                ],
              },
            ],
          },
          {
            type: "box", layout: "horizontal",
            backgroundColor: C.peachLight, cornerRadius: "12px", paddingAll: "14px",
            action: { type: "message", label: "หาร", text: "หาร" },
            contents: [
              { type: "text", text: "🍱", size: "xxl", flex: 0 },
              {
                type: "box", layout: "vertical", margin: "md", flex: 1, spacing: "xs",
                contents: [
                  {
                    type: "box", layout: "vertical", alignItems: "flex-start",
                    contents: [pill("หารบิล", C.peachPill)]
                  },
                  { type: "text", text: "หารค่าอาหาร พร้อมส่วนลด", color: C.textMid, size: "xs" },
                ]
              },
            ],
          },
        ],
      },
      footer: {
        type: "box", layout: "vertical",
        backgroundColor: C.lavenderLight, paddingAll: "10px",
        contents: [{
          type: "text", text: "พิมพ์ ยกเลิก เพื่อออกจากขั้นตอนนะคะ 💕",
          color: C.lavenderPill, size: "xs", align: "center"
        }],
      },
    }));
  }

  // ── CANCEL ───────────────────────────────────────────────────
  if (text === "ยกเลิก") {
    await clearState(userId);
    return client.replyMessage(replyToken, { type: "text", text: "✅ ยกเลิกแล้วนะคะ มีอะไรให้ช่วยอีกบอกได้เลยค่ะ 😊" });
  }

  // ── ปุ่ม Rich Menu → เปิด flow ──────────────────────────────
  if (text === "บันทึกรายรับ") {
    await setState(userId, "waiting_income", {});
    return client.replyMessage(replyToken, {
      type: "text",
      text: "💚 บันทึกรายรับค่ะ\nพิมพ์มาได้เลยนะคะ\n\nเช่น: +5000 เงินเดือน\nหรือ: 5000 เงินเดือน\n\n(พิมพ์ ยกเลิก เพื่อออกนะคะ)"
    });
  }
  if (text === "บันทึกรายจ่าย") {
    await setState(userId, "waiting_expense", {});
    return client.replyMessage(replyToken, {
      type: "text",
      text: "❤️ บันทึกรายจ่ายค่ะ\nพิมพ์มาได้เลยนะคะ\n\nเช่น: -60 ข้าวกลางวัน\nหรือ: 60 ข้าวกลางวัน\n\n(พิมพ์ ยกเลิก เพื่อออกนะคะ)"
    });
  }

  // ── FLOW: รอรับรายรับ ────────────────────────────────────────
  if (mode === "waiting_income") {
    const clean = text.startsWith("+") ? text : "+" + text;
    const m = clean.match(/^\+(\d+(?:\.\d+)?)\s*(.*)/);
    if (!m) return client.replyMessage(replyToken, { type: "text", text: "❌ ลองใหม่นะคะ เช่น: 5000 เงินเดือน ค่ะ" });
    const amount = parseFloat(m[1]);
    const title = m[2].trim() || "รายรับ";
    await saveSession(userId, title, "income", { amount, note: title });
    await clearState(userId);
    return client.replyMessage(replyToken, flexSuccess("income", amount, title));
  }

  // ── FLOW: รอรับรายจ่าย ───────────────────────────────────────
  if (mode === "waiting_expense") {
    const clean = text.startsWith("-") ? text : "-" + text;
    const m = clean.match(/^-(\d+(?:\.\d+)?)\s*(.*)/);
    if (!m) return client.replyMessage(replyToken, { type: "text", text: "❌ ลองใหม่นะคะ เช่น: 60 ข้าวกลางวัน ค่ะ" });
    const amount = parseFloat(m[1]);
    const title = m[2].trim() || "รายจ่าย";
    await saveSession(userId, title, "expense", { amount, note: title });
    await clearState(userId);
    return client.replyMessage(replyToken, flexSuccess("expense", amount, title));
  }

  // ── QUICK +/- ────────────────────────────────────────────────
  if (/^\+\d/.test(text)) {
    const m = text.match(/^\+(\d+(?:\.\d+)?)\s*(.*)/);
    if (!m) return client.replyMessage(replyToken, { type: "text", text: "❌ เช่น: +5000 เงินเดือน" });
    const amount = parseFloat(m[1]); const title = m[2].trim() || "รายรับ";
    await saveSession(userId, title, "income", { amount, note: title });
    return client.replyMessage(replyToken, flexSuccess("income", amount, title));
  }
  if (/^-\d/.test(text)) {
    const m = text.match(/^-(\d+(?:\.\d+)?)\s*(.*)/);
    if (!m) return client.replyMessage(replyToken, { type: "text", text: "❌ เช่น: -60 ข้าวกลางวัน" });
    const amount = parseFloat(m[1]); const title = m[2].trim() || "รายจ่าย";
    await saveSession(userId, title, "expense", { amount, note: title });
    return client.replyMessage(replyToken, flexSuccess("expense", amount, title));
  }

  // ── SUMMARY ──────────────────────────────────────────────────
  if (text === "สรุป" || text === "summary") {
    return client.replyMessage(replyToken, await flexSummary(userId));
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

  // ── ลบประวัติ [id] ──────────────────────────────────────────
  const delMatch = text.match(/^ลบประวัติ\s+(\d+)$/);
  if (delMatch) {
    const deleted = await deleteSession(userId, parseInt(delMatch[1]));
    if (!deleted) {
      return client.replyMessage(replyToken, { type: "text", text: "❌ ไม่พบรายการนั้นค่ะ หรือถูกลบไปแล้วนะคะ 🌸" });
    }
    const lbl = { income: "รายรับ", expense: "รายจ่าย", split: "หารบิล" }[deleted.type] || "";
    return client.replyMessage(replyToken, {
      type: "text",
      text: `🗑️ ลบแล้วนะคะ\n📌 "${deleted.title}" (${lbl})\n\nพิมพ์ ประวัติ เพื่อดูรายการที่เหลือได้เลยค่ะ 🌸`
    });
  }

  // ── BILL SPLIT FLOW ──────────────────────────────────────────
  if (["หาร", "หารค่าข้าว", "หารบิล", "หารเงิน"].includes(text)) {
    await setState(userId, "split_waiting_title", {});
    return client.replyMessage(replyToken, {
      type: "text",
      text: "🍱 หารค่าอาหารเลยนะคะ!\n\n📌 ตั้งชื่อรายการนี้ก่อนนะคะ\nเช่น: หารเงิน Grab วันศุกร์\n\nพิมพ์ชื่อมาได้เลยค่ะ 💕\n(ยกเลิก เพื่อออกนะคะ)"
    });
  }
  if (mode === "split_waiting_title") {
    if (text.length < 2) return client.replyMessage(replyToken, { type: "text", text: "❌ ชื่อสั้นไปค่ะ ลองใหม่นะคะ 😊" });
    await setState(userId, "split_waiting_orders", { title: text });
    return client.replyMessage(replyToken, {
      type: "text",
      text: `✅ ชื่อรายการ: "${text}"\n\n📋 ส่งรายการอาหารมาได้เลยค่ะ\nรูปแบบ: ชื่อ เมนู ราคา, ...\n\nเช่น: A กะเพรา 60, B ผัดซีอิ๊ว 50\nหรือ: แบงค์ 60, มิ้น 40\n\n(ยกเลิก เพื่อออกนะคะ)`
    });
  }
  if (mode === "split_waiting_orders") {
    const orders = parseOrders(text);
    if (!orders) return client.replyMessage(replyToken, { type: "text", text: "❌ รูปแบบไม่ถูกต้องค่ะ\nเช่น: A กะเพรา 60, B ข้าวไข่เจียว 40" });
    const total = orders.reduce((s, o) => s + o.price, 0);
    await setState(userId, "split_waiting_discount", { ...sd, orders });
    const list = orders.map((o) => `  • ${o.name} (${o.item}) = ${fmt(o.price)} บาท`).join("\n");
    return client.replyMessage(replyToken, {
      type: "text",
      text: `✅ รับรายการแล้วค่ะ\n${list}\n\nรวม: ${fmt(total)} บาท\n\n🎫 มีส่วนลดไหมคะ?\nไม่มีพิมพ์ 0 ได้เลยค่ะ\n\n(ยกเลิก เพื่อออกนะคะ)`
    });
  }
  if (mode === "split_waiting_discount") {
    const discount = parseFloat(text);
    if (isNaN(discount) || discount < 0) return client.replyMessage(replyToken, { type: "text", text: "❌ ใส่ตัวเลขนะคะ เช่น 30 หรือ 0 ค่ะ" });
    const { title, orders } = sd;
    const totalBefore = orders.reduce((s, o) => s + o.price, 0);
    if (discount > totalBefore) return client.replyMessage(replyToken, {
      type: "text",
      text: `❌ ส่วนลด (${fmt(discount)}) มากกว่าราคารวม (${fmt(totalBefore)}) นะคะ ลองใหม่ค่ะ`
    });
    const results = calcSplit(orders, discount);
    await setState(userId, "split_waiting_promptpay", { ...sd, discount, results });
    const list = results.map((r) => `  • ${r.name}: ${fmt(r.finalPay)} บาท`).join("\n");
    return client.replyMessage(replyToken, {
      type: "text",
      text: `✅ คำนวณเสร็จแล้วค่ะ\n${list}\n\n💳 ต้องการ Generate QR PromptPay ไหมคะ?\nใส่เบอร์โทรที่ผูก PromptPay ของคนออกเงินค่ะ\nเช่น: 0812345678\n\nหรือพิมพ์ ข้าม ถ้าไม่ต้องการ QR ค่ะ\n(ยกเลิก เพื่อออกนะคะ)`
    });
  }

  // ── FLOW: รอเบอร์ PromptPay ──────────────────────────────────
  if (mode === "split_waiting_promptpay") {
    const { title, orders, discount, results } = sd;
    const totalBefore = orders.reduce((s, o) => s + o.price, 0);
    const totalAfter = results.reduce((s, r) => s + r.finalPay, 0);

    if (text === "ข้าม") {
      // บันทึกและแสดงผลแบบเดิม (ไม่มี QR)
      await saveSession(userId, title, "split", {
        participants: results.map((r) => ({ name: r.name, item: r.item, price: r.price, discountShare: r.discountShare, finalPay: r.finalPay })),
        discount, totalBefore, totalAfter,
      });
      await clearState(userId);
      return client.replyMessage(replyToken, flexSplit(title, results, discount));
    }

    // validate เบอร์โทร
    const phone = text.replace(/[\s-]/g, "");
    if (!/^0\d{9}$/.test(phone)) {
      return client.replyMessage(replyToken, {
        type: "text",
        text: "❌ เบอร์โทรไม่ถูกต้องค่ะ ใส่ 10 หลัก เช่น 0812345678\nหรือพิมพ์ ข้าม ถ้าไม่ต้องการ QR นะคะ"
      });
    }

    // Generate QR IDs สำหรับแต่ละคน
    const qrIds = results.map((r) => storeQR(phone, r.finalPay));

    // บันทึก session (ต้องได้ sessionId เพื่อใส่ใน postback)
    const sessionId = await saveSession(userId, title, "split", {
      participants: results.map((r) => ({ name: r.name, item: r.item, price: r.price, discountShare: r.discountShare, finalPay: r.finalPay, paid: false })),
      discount, totalBefore, totalAfter, promptpayPhone: phone,
    });
    await clearState(userId);
    return client.replyMessage(replyToken, flexSplitWithQR(title, results, discount, phone, qrIds, sessionId));
  }

  // ── DEFAULT ──────────────────────────────────────────────────
  if (!event.source.groupId) {
    return client.replyMessage(replyToken, {
      type: "text",
      text: "เป๋าแพรไม่เข้าใจคำสั่งนี้ค่ะ 😅\nพิมพ์ เมนู เพื่อดูสิ่งที่เป๋าแพรช่วยได้นะคะ 🌸"
    });
  }
}

// ════════════════════════════════════════════════════════════════
//  POSTBACK HANDLER — ยืนยันจ่ายเงิน
// ════════════════════════════════════════════════════════════════
async function handlePostback(event) {
  if (event.type !== "postback") return;

  const replyToken = event.replyToken;
  const data = event.postback.data;

  // format: confirm_pay|sessionId|personIndex|qrId|personName
  if (data.startsWith("confirm_pay|")) {
    const parts = data.split("|");
    const sessionId = parseInt(parts[1]);
    const personIndex = parseInt(parts[2]);
    const qrId = parts[3];
    const personName = parts[4];

    // ลบ QR ออกจาก store (หมดอายุทันที)
    const wasDeleted = qrStore.delete(qrId);

    if (!wasDeleted) {
      return client.replyMessage(replyToken, {
        type: "text",
        text: `⚠️ QR ของ ${personName} หมดอายุหรือถูกยืนยันไปแล้วค่ะ`
      });
    }

    // อัพเดท session — mark คนนี้ว่าจ่ายแล้ว
    try {
      const { data: session } = await supabase.from("sessions").select("summary").eq("id", sessionId).maybeSingle();
      if (session) {
        const summary = typeof session.summary === "string" ? JSON.parse(session.summary) : session.summary;
        if (summary.participants && summary.participants[personIndex]) {
          summary.participants[personIndex].paid = true;
          await supabase.from("sessions").update({ summary }).eq("id", sessionId);
        }

        // นับว่ากี่คนจ่ายแล้ว
        const totalPeople = summary.participants.length;
        const paidCount = summary.participants.filter((p) => p.paid).length;
        const allPaid = paidCount === totalPeople;

        // แสดง Flex ยืนยัน
        const paidPerson = summary.participants[personIndex];
        return client.replyMessage(replyToken, flexWrap("ยืนยันจ่ายเงินแล้ว", {
          type: "bubble", size: "kilo",
          header: kawaiiHeader(
            allPaid ? "🎉" : "✅",
            allPaid ? "จ่ายครบแล้ว!" : "ยืนยันจ่ายเงิน",
            allPaid ? C.greenLight : C.peachLight,
            allPaid ? C.greenPill : C.peachPill
          ),
          body: {
            type: "box", layout: "vertical",
            backgroundColor: C.white, paddingAll: "16px", spacing: "md",
            contents: [
              {
                type: "box", layout: "vertical",
                backgroundColor: C.greenLight, cornerRadius: "10px", paddingAll: "14px",
                contents: [
                  { type: "text", text: `👤 ${personName}`, color: C.textDark, size: "lg", weight: "bold", align: "center" },
                  { type: "text", text: `💵 จ่าย ${fmt(paidPerson.finalPay)} บาท`, color: C.green, size: "md", weight: "bold", align: "center", margin: "sm" },
                  { type: "text", text: "✅ เรียบร้อยแล้วค่ะ!", color: C.greenPill, size: "sm", align: "center", margin: "sm" },
                ],
              },
              sep,
              // แสดงสถานะทุกคน
              ...summary.participants.map((p) => ({
                type: "box", layout: "horizontal", margin: "xs",
                contents: [
                  { type: "text", text: `${p.paid ? "✅" : "⏳"} ${p.name}`, color: p.paid ? C.green : C.textMid, size: "sm", flex: 3 },
                  { type: "text", text: `${fmt(p.finalPay)} บาท`, color: p.paid ? C.green : C.textMid, size: "sm", align: "end", flex: 2, weight: p.paid ? "bold" : "regular" },
                ],
              })),
              {
                type: "text",
                text: allPaid ? "🎉 ทุกคนจ่ายครบแล้วค่ะ!" : `📊 จ่ายแล้ว ${paidCount}/${totalPeople} คน`,
                color: allPaid ? C.green : C.peach, size: "sm", weight: "bold", align: "center", margin: "md"
              },
            ],
          },
        }));
      }
    } catch (err) {
      console.error("Postback error:", err);
    }

    return client.replyMessage(replyToken, {
      type: "text",
      text: `✅ ${personName} จ่ายเรียบร้อยแล้วค่ะ! 💕`
    });
  }
}

// ════════════════════════════════════════════════════════════════
//  EVENT ROUTER
// ════════════════════════════════════════════════════════════════
async function handleEvent(event) {
  if (event.type === "message" && event.message.type === "text") {
    return handleMessage(event);
  }
  if (event.type === "postback") {
    return handlePostback(event);
  }
}

// ════════════════════════════════════════════════════════════════
//  EXPRESS
// ════════════════════════════════════════════════════════════════

// ── QR Code Image Endpoint ────────────────────────────────────
app.get("/qr/:id", async (req, res) => {
  try {
    const data = qrStore.get(req.params.id);
    if (!data) return res.status(404).send("QR expired or not found");
    const payload = generatePayload(data.phone, { amount: data.amount });
    const buffer = await QRCode.toBuffer(payload, {
      width: 400,
      margin: 2,
      color: { dark: "#3A3A4A", light: "#FFFFFF" },
    });
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "public, max-age=1800");
    res.send(buffer);
  } catch (err) {
    console.error("QR generation error:", err);
    res.status(500).send("Error generating QR");
  }
});

app.post("/webhook", middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.status(200).json({ status: "ok" });
  } catch (err) {
    // แสดง error detail จาก LINE API
    if (err.originalError?.response?.data) {
      console.error("LINE API error details:", JSON.stringify(err.originalError.response.data, null, 2));
    }
    console.error("Webhook error:", err.message || err);
    res.status(500).json({ error: err.message });
  }
});
app.get("/", (_req, res) => res.send("🌸 เป๋าแพร Line OA Bot v4 is running!"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌸 เป๋าแพร Server on port ${PORT}`));
