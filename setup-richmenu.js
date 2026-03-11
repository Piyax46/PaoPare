// ═══════════════════════════════════════════════════════════════
//  setup-richmenu.js
//  รัน script นี้ครั้งเดียวเพื่อสร้าง Rich Menu ใน LINE OA
//  คำสั่ง: node setup-richmenu.js
// ═══════════════════════════════════════════════════════════════
require("dotenv").config();
const axios = require("axios");
const fs    = require("fs");

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const BASE  = "https://api.line.me/v2/bot/richmenu";
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

// ════════════════════════════════════════════════════════════════
//  Rich Menu Layout  (2 แถว × 3 คอลัมน์ = 6 ปุ่ม)
//
//  ┌─────────────┬─────────────┬─────────────┐
//  │  💚 รายรับ  │ ❤️ รายจ่าย  │  📊 สรุป   │
//  ├─────────────┼─────────────┼─────────────┤
//  │  🍱 หารบิล  │ 📚 ประวัติ  │  🤖 เมนู   │
//  └─────────────┴─────────────┴─────────────┘
//
//  ขนาด canvas: 2500 × 1686 px  (มาตรฐาน LINE Full Size)
// ════════════════════════════════════════════════════════════════

const RICH_MENU = {
  size: { width: 2500, height: 1686 },
  selected: true,
  name: "Daily Bot Menu",
  chatBarText: "📋 เมนู",
  areas: [
    // แถว 1
    {
      bounds: { x: 0,    y: 0, width: 833, height: 843 },
      action: { type: "message", text: "บันทึกรายรับ" },
    },
    {
      bounds: { x: 833,  y: 0, width: 834, height: 843 },
      action: { type: "message", text: "บันทึกรายจ่าย" },
    },
    {
      bounds: { x: 1667, y: 0, width: 833, height: 843 },
      action: { type: "message", text: "สรุป" },
    },
    // แถว 2
    {
      bounds: { x: 0,    y: 843, width: 833, height: 843 },
      action: { type: "message", text: "หาร" },
    },
    {
      bounds: { x: 833,  y: 843, width: 834, height: 843 },
      action: { type: "message", text: "ประวัติ" },
    },
    {
      bounds: { x: 1667, y: 843, width: 833, height: 843 },
      action: { type: "message", text: "เมนู" },
    },
  ],
};

// ════════════════════════════════════════════════════════════════
//  MAIN
// ════════════════════════════════════════════════════════════════
async function main() {
  // ── Step 1: ลบ Rich Menu เก่าทั้งหมด ──────────────────────
  console.log("🗑️  ลบ Rich Menu เก่า...");
  try {
    const { data: existing } = await axios.get(BASE + "/list", { headers: HEADERS });
    for (const menu of existing.richmenus || []) {
      await axios.delete(`${BASE}/${menu.richMenuId}`, { headers: HEADERS });
      console.log(`   ลบแล้ว: ${menu.richMenuId}`);
    }
  } catch (e) {
    console.log("   ไม่มี Rich Menu เก่า หรือ error:", e.message);
  }

  // ── Step 2: สร้าง Rich Menu ใหม่ ──────────────────────────
  console.log("\n✨ สร้าง Rich Menu ใหม่...");
  const { data: created } = await axios.post(BASE, RICH_MENU, { headers: HEADERS });
  const richMenuId = created.richMenuId;
  console.log(`   Rich Menu ID: ${richMenuId}`);

  // ── Step 3: Upload รูปภาพ ─────────────────────────────────
  // ถ้ามีไฟล์ richmenu.png ใน folder เดียวกัน ให้ upload
  const imgPath = "./richmenu.png";
  if (fs.existsSync(imgPath)) {
    console.log("\n🖼️  Upload รูป Rich Menu...");
    const imgBuffer = fs.readFileSync(imgPath);
    await axios.post(
      `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`,
      imgBuffer,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "image/png",
        },
      }
    );
    console.log("   Upload สำเร็จ ✅");
  } else {
    console.log("\n⚠️  ไม่พบ richmenu.png");
    console.log("   → Rich Menu จะมีแค่ areas แต่ไม่มีรูปพื้นหลัง");
    console.log("   → ดูวิธีสร้างรูปด้านล่าง README");
  }

  // ── Step 4: ตั้งเป็น default ──────────────────────────────
  console.log("\n🔗 ตั้งเป็น Default Rich Menu...");
  await axios.post(
    `${BASE}/default/${richMenuId}`,
    {},
    { headers: HEADERS }
  );
  console.log("   ✅ เสร็จแล้ว! Rich Menu พร้อมใช้งาน\n");
  console.log(`   Rich Menu ID: ${richMenuId}`);
  console.log("   เปิดแชท LINE OA ดูได้เลยครับ 🎉");
}

main().catch((err) => {
  console.error("❌ Error:", err.response?.data || err.message);
  process.exit(1);
});
