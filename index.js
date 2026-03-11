// ═══════════════════════════════════════════════════════════════
//  เป๋าแพร — Line OA Daily Bot  v3
//  ผู้ช่วยส่วนตัวสำหรับบันทึกรายรับรายจ่าย และหารค่าอาหาร 🌸
// ═══════════════════════════════════════════════════════════════
require("dotenv").config();
const express = require("express");
const { Client, middleware } = require("@line/bot-sdk");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// ── LINE config ──────────────────────────────────────────────
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const client = new Client(config);

// ── Supabase client ──────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ════════════════════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════════════════════
function fmt(amount) {
  return Number(amount).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(isoString) {
  return new Date(isoString).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ════════════════════════════════════════════════════════════════
//  STATE (bot_state table)
// ════════════════════════════════════════════════════════════════
async function getState(userId) {
  const { data, error } = await supabase
    .from("bot_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) console.error("getState error:", error);
  if (!data) return { mode: null, data: {} };
  return {
    mode: data.mode,
    data: typeof data.data === "string" ? JSON.parse(data.data) : (data.data || {}),
  };
}

async function setState(userId, mode, data = {}) {
  const { error } = await supabase.from("bot_state").upsert(
    { user_id: userId, mode, data, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
  if (error) console.error("setState error:", error);
}

async function clearState(userId) {
  const { error } = await supabase.from("bot_state").delete().eq("user_id", userId);
  if (error) console.error("clearState error:", error);
}

// ════════════════════════════════════════════════════════════════
//  SESSIONS (sessions table)
// ════════════════════════════════════════════════════════════════
async function saveSession(userId, title, type, summary) {
  const { data, error } = await supabase
    .from("sessions")
    .insert({ user_id: userId, title, type, summary })
    .select("id")
    .single();
  if (error) {
    console.error("saveSession error:", error);
    throw error;
  }
  return data.id;
}

async function getSessions(userId, type = null, limit = 10) {
  let q = supabase
    .from("sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (type) q = q.eq("type", type);
  const { data, error } = await q;
  if (error) console.error("getSessions error:", error);
  return data || [];
}

// ════════════════════════════════════════════════════════════════
//  BILL SPLIT HELPERS
// ════════════════════════════════════════════════════════════════
function calcSplit(orders, totalDiscount) {
  const totalBefore = orders.reduce((s, o) => s + o.price, 0);
  if (totalBefore === 0) return [];
  return orders.map((o) => {
    const share = totalDiscount * (o.price / totalBefore);
    const finalPay = o.price - share;
    return { ...o, discountShare: share, finalPay };
  });
}

function parseOrders(text) {
  const orders = [];
  for (const part of text.split(",").map((s) => s.trim())) {
    const m = part.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const words = m[1].trim().split(/\s+/);
    orders.push({
      name: words[0],
      item: words.slice(1).join(" ") || "รายการ",
      price: parseFloat(m[2]),
    });
  }
  return orders.length > 0 ? orders : null;
}

// ════════════════════════════════════════════════════════════════
//  TEXT BUILDERS
// ════════════════════════════════════════════════════════════════
async function buildLedgerSummary(userId) {
  const sessions = await getSessions(userId, null, 200);
  const incomes = sessions.filter((s) => s.type === "income");
  const expenses = sessions.filter((s) => s.type === "expense");

  const totalIn = incomes.reduce((s, r) => s + Number(r.summary.amount), 0);
  const totalOut = expenses.reduce((s, r) => s + Number(r.summary.amount), 0);
  const balance = totalIn - totalOut;

  let msg = "📊 สรุปรายรับรายจ่ายนะคะ\n━━━━━━━━━━━━━━━━\n";

  if (incomes.length > 0) {
    msg += "💚 รายรับ\n";
    incomes.slice().reverse().forEach((s) => {
      msg += `  +${fmt(s.summary.amount)}  ${s.title}  (${fmtDate(s.created_at)})\n`;
    });
    msg += `  รวม: +${fmt(totalIn)} บาท\n\n`;
  } else {
    msg += "💚 รายรับ: ยังไม่มีรายการค่ะ\n\n";
  }

  if (expenses.length > 0) {
    msg += "❤️ รายจ่าย\n";
    expenses.slice().reverse().forEach((s) => {
      msg += `  -${fmt(s.summary.amount)}  ${s.title}  (${fmtDate(s.created_at)})\n`;
    });
    msg += `  รวม: -${fmt(totalOut)} บาท\n\n`;
  } else {
    msg += "❤️ รายจ่าย: ยังไม่มีรายการค่ะ\n\n";
  }

  msg += "━━━━━━━━━━━━━━━━\n";
  if (balance >= 0) {
    msg += `✅ คงเหลือ: +${fmt(balance)} บาทนะคะ 😊`;
  } else {
    msg += `⚠️ ติดลบ: ${fmt(balance)} บาทนะคะ ระวังด้วยนะคะ`;
  }
  return msg;
}

function renderSession(s, index) {
  const icon = { income: "💚", expense: "❤️", split: "🍱" }[s.type] || "📌";
  const typeLabel = { income: "รายรับ", expense: "รายจ่าย", split: "หารบิล" }[s.type];
  let msg = `${index}. ${icon} ${s.title}\n`;
  msg += `   📅 ${fmtDate(s.created_at)}  •  ${typeLabel}\n`;

  if (s.type === "income") {
    msg += `   💵 +${fmt(s.summary.amount)} บาท\n`;
  } else if (s.type === "expense") {
    msg += `   💵 -${fmt(s.summary.amount)} บาท\n`;
  } else if (s.type === "split") {
    const p = s.summary.participants || [];
    p.forEach((r) => {
      msg += `   👤 ${r.name}(${r.item}) → ${fmt(r.finalPay)} บาท\n`;
    });
    if (s.summary.discount > 0) {
      msg += `   🎫 ส่วนลด: -${fmt(s.summary.discount)} บาท\n`;
    }
    msg += `   ✅ รวมสุทธิ: ${fmt(s.summary.totalAfter)} บาท\n`;
  }

  return msg;
}

async function buildHistory(userId, filterType = null, limit = 10) {
  const sessions = await getSessions(userId, filterType, limit);
  if (sessions.length === 0) {
    const label = filterType
      ? { income: "รายรับ", expense: "รายจ่าย", split: "หารบิล" }[filterType]
      : "การใช้งาน";
    return `📭 เป๋าแพรยังไม่พบประวัติ${label}เลยค่ะ ลองใช้งานก่อนนะคะ 🌸`;
  }

  const typeHeader = filterType
    ? ` (${({ income: "รายรับ", expense: "รายจ่าย", split: "หารบิล" }[filterType])})`
    : "";
  let msg = `📚 ประวัติการใช้งาน${typeHeader}\n━━━━━━━━━━━━━━━━\n`;
  sessions.forEach((s, i) => {
    msg += renderSession(s, i + 1) + "\n";
  });
  msg += `━━━━━━━━━━━━━━━━\n`;
  msg += `รวม ${sessions.length} รายการล่าสุดนะคะ\n`;
  msg += `ดูเพิ่มเติมได้เลยค่ะ 💕\nพิมพ์: ประวัติ 20 | ประวัติหาร | ประวัติรายรับ | ประวัติรายจ่าย`;
  return msg;
}

function buildSplitResult(title, results, discount) {
  const totalAfter = results.reduce((s, r) => s + r.finalPay, 0);
  let msg = `💳 ${title}\n━━━━━━━━━━━━━━━━\n`;
  results.forEach((r) => {
    msg += `👤 ${r.name} (${r.item})\n`;
    msg += `   ราคา: ${fmt(r.price)} บาท\n`;
    if (discount > 0) msg += `   ส่วนลด: -${fmt(r.discountShare)} บาท\n`;
    msg += `   💵 จ่าย: ${fmt(r.finalPay)} บาท\n\n`;
  });
  msg += "━━━━━━━━━━━━━━━━\n";
  if (discount > 0) msg += `🎫 ส่วนลดรวม: -${fmt(discount)} บาท\n`;
  msg += `✅ รวมสุทธิ: ${fmt(totalAfter)} บาทนะคะ\n`;
  msg += `\n💾 เป๋าแพรบันทึกไว้ในประวัติเรียบร้อยแล้วค่ะ 🌸`;
  return msg;
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

  // ─────────────────────────────────────────────────────────────
  //  GLOBAL COMMANDS
  // ─────────────────────────────────────────────────────────────

  // MENU
  if (["เมนู", "help", "ช่วยด้วย", "menu", "สวัสดี", "หวัดดี"].includes(text.toLowerCase())) {
    return client.replyMessage(replyToken, {
      type: "text",
      text:
        "สวัสดีค่ะ 🌸 เป๋าแพรยินดีช่วยเลยนะคะ\n━━━━━━━━━━━━━━━━\n" +
        "💚 บันทึกรายรับ\n  +[จำนวน] [หัวข้อ]\n  เช่น: +5000 เงินเดือน\n\n" +
        "❤️ บันทึกรายจ่าย\n  -[จำนวน] [หัวข้อ]\n  เช่น: -60 ข้าวกลางวัน\n\n" +
        "📊 ดูสรุปรายรับ-จ่าย: สรุป\n\n" +
        "🍱 หารค่าอาหาร: หาร\n\n" +
        "📚 ดูประวัติ: ประวัติ\n" +
        "   ├ ประวัติหาร\n" +
        "   ├ ประวัติรายรับ\n" +
        "   ├ ประวัติรายจ่าย\n" +
        "   └ ประวัติ 20  (เพิ่มจำนวนได้ค่ะ)\n\n" +
        "↩️ ยกเลิก / ออกจากขั้นตอน: ยกเลิก\n\n" +
        "มีอะไรให้เป๋าแพรช่วยบอกได้เลยนะคะ 💕",
    });
  }

  // CANCEL
  if (text === "ยกเลิก") {
    await clearState(userId);
    return client.replyMessage(replyToken, {
      type: "text",
      text: "✅ ยกเลิกแล้วนะคะ มีอะไรให้ช่วยอีกบอกได้เลยค่ะ 😊",
    });
  }

  // QUICK INCOME & EXPENSE GUIDE
  if (text === "บันทึกรายรับ") {
    return client.replyMessage(replyToken, {
      type: "text",
      text: "💚 บันทึกรายรับ\nพิมพ์บวก (+) ตามด้วยจำนวนเงินและหัวข้อนะคะ\nเช่น: +5000 เงินเดือน\nหรือพิมพ์: บันทึกรายรับ 5000 เงินเดือน",
    });
  }
  if (text === "บันทึกรายจ่าย") {
    return client.replyMessage(replyToken, {
      type: "text",
      text: "❤️ บันทึกรายจ่าย\nพิมพ์ลบ (-) ตามด้วยจำนวนเงินและหัวข้อนะคะ\nเช่น: -60 ข้าวกลางวัน\nหรือพิมพ์: บันทึกรายจ่าย 60 ข้าวกลางวัน",
    });
  }

  // QUICK INCOME
  let matchIncome = text.match(/^(?:\+|บันทึกรายรับ\s*)(\d+(?:\.\d+)?)\s*(.*)/);
  if (matchIncome) {
    const amount = parseFloat(matchIncome[1]);
    let title = matchIncome[2].replace(/^บาท\s*/, '').trim() || "รายรับ";
    await saveSession(userId, title, "income", { amount, note: title });
    return client.replyMessage(replyToken, {
      type: "text",
      text: `✅ เป๋าแพรบันทึกรายรับให้แล้วนะคะ 🌸\n💚 +${fmt(amount)} บาท\n📌 "${title}"\n💾 อยู่ในประวัติแล้วค่ะ`,
    });
  }

  // QUICK EXPENSE
  let matchExpense = text.match(/^(?:\-|บันทึกรายจ่าย\s*)(\d+(?:\.\d+)?)\s*(.*)/);
  if (matchExpense) {
    const amount = parseFloat(matchExpense[1]);
    let title = matchExpense[2].replace(/^บาท\s*/, '').trim() || "รายจ่าย";
    await saveSession(userId, title, "expense", { amount, note: title });
    return client.replyMessage(replyToken, {
      type: "text",
      text: `✅ เป๋าแพรบันทึกรายจ่ายให้แล้วนะคะ\n❤️ -${fmt(amount)} บาท\n📌 "${title}"\n💾 อยู่ในประวัติแล้วค่ะ`,
    });
  }

  // SUMMARY
  if (text === "สรุป" || text === "summary") {
    return client.replyMessage(replyToken, {
      type: "text",
      text: await buildLedgerSummary(userId),
    });
  }

  // HISTORY
  if (text.startsWith("ประวัติ") || text === "history") {
    let filterType = null;
    let limit = 10;

    if (text.includes("หาร")) filterType = "split";
    else if (text.includes("รายรับ") || text.includes("income")) filterType = "income";
    else if (text.includes("รายจ่าย") || text.includes("expense")) filterType = "expense";

    const numMatch = text.match(/(\d+)/);
    if (numMatch) limit = Math.min(parseInt(numMatch[1]), 50);

    return client.replyMessage(replyToken, {
      type: "text",
      text: await buildHistory(userId, filterType, limit),
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  BILL SPLIT FLOW
  // ─────────────────────────────────────────────────────────────

  // STEP 1 — trigger
  if (["หาร", "หารค่าข้าว", "หารบิล", "หารเงิน"].includes(text)) {
    await setState(userId, "split_waiting_title", {});
    return client.replyMessage(replyToken, {
      type: "text",
      text:
        "🍱 หารค่าอาหารเลยนะคะ!\n━━━━━━━━━━━━━━━━\n" +
        "📌 ก่อนอื่นขอตั้งชื่อรายการนี้ก่อนนะคะ\nจะได้บันทึกในประวัติได้ถูกต้องค่ะ\n\n" +
        "ตัวอย่างชื่อรายการ:\n" +
        "• หารเงิน Lineman ออฟฟิศวันศุกร์\n" +
        "• ข้าวเย็นกลุ่มเพื่อน\n" +
        "• หารค่าแกร็บ 11 มี.ค.\n\n" +
        "พิมพ์ชื่อรายการมาได้เลยค่ะ 💕\n(พิมพ์ ยกเลิก เพื่อออกนะคะ)",
    });
  }

  // STEP 2 — รับ title
  if (mode === "split_waiting_title") {
    if (text.length < 2) {
      return client.replyMessage(replyToken, {
        type: "text",
        text: "❌ ชื่อสั้นไปนิดนึงค่ะ ลองพิมพ์ใหม่อีกทีนะคะ 😊",
      });
    }
    await setState(userId, "split_waiting_orders", { title: text });
    return client.replyMessage(replyToken, {
      type: "text",
      text:
        `✅ โอเคค่ะ ชื่อรายการ: "${text}"\n━━━━━━━━━━━━━━━━\n` +
        "📋 ตอนนี้ส่งรายการอาหารมาได้เลยนะคะ\nรูปแบบ: [ชื่อ] [เมนู] [ราคา], ...\n\n" +
        "ตัวอย่างเช่น:\n" +
        "A กะเพรา 60, B ข้าวไข่เจียว 40, C ผัดซีอิ๊ว 50\n\n" +
        "หรือแบบไม่มีชื่อเมนูก็ได้ค่ะ:\n" +
        "แบงค์ 60, มิ้น 40, เจน 50\n\n" +
        "(พิมพ์ ยกเลิก เพื่อออกนะคะ)",
    });
  }

  // STEP 3 — รับ orders
  if (mode === "split_waiting_orders") {
    const orders = parseOrders(text);
    if (!orders) {
      return client.replyMessage(replyToken, {
        type: "text",
        text: "❌ รูปแบบไม่ถูกต้องค่ะ ลองใหม่นะคะ\nเช่น: A กะเพรา 60, B ข้าวไข่เจียว 40",
      });
    }
    const total = orders.reduce((s, o) => s + o.price, 0);
    await setState(userId, "split_waiting_discount", { ...sd, orders });
    const list = orders.map((o) => `  ${o.name} (${o.item}) = ${fmt(o.price)} บาท`).join("\n");
    return client.replyMessage(replyToken, {
      type: "text",
      text:
        `✅ เป๋าแพรรับรายการแล้วนะคะ\n━━━━━━━━━━━━━━━━\n${list}\n\n` +
        `รวมก่อนส่วนลด: ${fmt(total)} บาทค่ะ\n\n` +
        "🎫 มีส่วนลดไหมคะ? ถ้ามีใส่จำนวนมาได้เลยนะคะ\n" +
        "(ถ้าไม่มีส่วนลดพิมพ์ 0 ได้เลยค่ะ)\n\n" +
        "(พิมพ์ ยกเลิก เพื่อออกนะคะ)",
    });
  }

  // STEP 4 — รับ discount → คำนวณ + บันทึก
  if (mode === "split_waiting_discount") {
    const discount = parseFloat(text);
    if (isNaN(discount) || discount < 0) {
      return client.replyMessage(replyToken, {
        type: "text",
        text: "❌ ระบุเป็นตัวเลขนะคะ เช่น 30 หรือ 0 ค่ะ",
      });
    }

    const { title, orders } = sd;
    const totalBefore = orders.reduce((s, o) => s + o.price, 0);

    if (discount > totalBefore) {
      return client.replyMessage(replyToken, {
        type: "text",
        text: `❌ ส่วนลด (${fmt(discount)} บาท) มากกว่าราคารวม (${fmt(totalBefore)} บาท) อยู่นะคะ ลองใส่ใหม่ได้เลยค่ะ`,
      });
    }

    const results = calcSplit(orders, discount);
    const totalAfter = results.reduce((s, r) => s + r.finalPay, 0);

    await saveSession(userId, title, "split", {
      participants: results.map((r) => ({
        name: r.name,
        item: r.item,
        price: r.price,
        discountShare: r.discountShare,
        finalPay: r.finalPay,
      })),
      discount,
      totalBefore,
      totalAfter,
    });

    await clearState(userId);
    return client.replyMessage(replyToken, {
      type: "text",
      text: buildSplitResult(title, results, discount),
    });
  }

  // ─────────────────────────────────────────────────────────────
  //  DEFAULT
  // ─────────────────────────────────────────────────────────────
  if (!event.source.groupId) {
    return client.replyMessage(replyToken, {
      type: "text",
      text: "เป๋าแพรไม่เข้าใจคำสั่งนี้ค่ะ 😅\nพิมพ์ เมนู เพื่อดูสิ่งที่เป๋าแพรช่วยได้นะคะ 🌸",
    });
  }
}

// ════════════════════════════════════════════════════════════════
//  EXPRESS ROUTES
// ════════════════════════════════════════════════════════════════
app.post("/webhook", middleware(config), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleMessage));
    res.status(200).json({ status: "ok" });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (_req, res) => res.send("🌸 เป๋าแพร Line OA Bot is running!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌸 เป๋าแพร Server on port ${PORT}`));
