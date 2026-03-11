// ═══════════════════════════════════════════════════════════════
//  generate-richmenu-image.js
//  สร้างรูป richmenu.png ขนาด 2500×1686 พร้อม upload
//  คำสั่ง: node generate-richmenu-image.js
// ═══════════════════════════════════════════════════════════════
const { createCanvas } = require("@napi-rs/canvas");
const fs = require("fs");

const W = 2500;
const H = 1686;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

// ── สี palette ──────────────────────────────────────────────
const COLORS = {
  bg:          "#1A1A2E",   // พื้นหลังหลัก (navy dark)
  panel:       "#16213E",   // พื้นหลัง card
  accent1:     "#0F3460",   // border card
  green:       "#4ADE80",   // income
  red:         "#F87171",   // expense
  blue:        "#60A5FA",   // summary
  orange:      "#FB923C",   // split
  purple:      "#C084FC",   // history
  gray:        "#94A3B8",   // menu
  text:        "#F1F5F9",   // ข้อความหลัก
  subtext:     "#94A3B8",   // ข้อความรอง
  divider:     "#334155",   // เส้นแบ่ง
  highlight:   "#E2E8F0",
};

// ── ปุ่มทั้ง 6 ──────────────────────────────────────────────
const BUTTONS = [
  // แถว 1
  { x: 0,    y: 0,   w: 833, h: 843, icon: "💚", label: "รายรับ",   sub: "+จำนวน หมายเหตุ", color: COLORS.green  },
  { x: 833,  y: 0,   w: 834, h: 843, icon: "❤️",  label: "รายจ่าย", sub: "-จำนวน หมายเหตุ", color: COLORS.red    },
  { x: 1667, y: 0,   w: 833, h: 843, icon: "📊",  label: "สรุป",    sub: "รายรับ-รายจ่าย",  color: COLORS.blue   },
  // แถว 2
  { x: 0,    y: 843, w: 833, h: 843, icon: "🍱",  label: "หารบิล",  sub: "หารค่าอาหาร",     color: COLORS.orange },
  { x: 833,  y: 843, w: 834, h: 843, icon: "📚",  label: "ประวัติ", sub: "ดูบันทึกทั้งหมด", color: COLORS.purple },
  { x: 1667, y: 843, w: 833, h: 843, icon: "🤖",  label: "เมนู",    sub: "คำสั่งทั้งหมด",   color: COLORS.gray   },
];

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── พื้นหลัง ────────────────────────────────────────────────
ctx.fillStyle = COLORS.bg;
ctx.fillRect(0, 0, W, H);

// เส้นแบ่งกลาง (แนวนอน)
ctx.strokeStyle = COLORS.divider;
ctx.lineWidth = 4;
ctx.beginPath();
ctx.moveTo(0, 843);
ctx.lineTo(W, 843);
ctx.stroke();

// เส้นแบ่งแนวตั้ง
for (const xPos of [833, 1667]) {
  ctx.beginPath();
  ctx.moveTo(xPos, 0);
  ctx.lineTo(xPos, H);
  ctx.stroke();
}

// ── วาดแต่ละปุ่ม ─────────────────────────────────────────────
BUTTONS.forEach((btn) => {
  const cx = btn.x + btn.w / 2;
  const cy = btn.y + btn.h / 2;
  const pad = 30;

  // Card background
  ctx.fillStyle = COLORS.panel;
  drawRoundRect(ctx, btn.x + pad, btn.y + pad, btn.w - pad * 2, btn.h - pad * 2, 40);
  ctx.fill();

  // Colored top accent bar
  ctx.fillStyle = btn.color + "33"; // 20% opacity
  drawRoundRect(ctx, btn.x + pad, btn.y + pad, btn.w - pad * 2, btn.h - pad * 2, 40);
  ctx.fill();

  // Border glow
  ctx.strokeStyle = btn.color + "88";
  ctx.lineWidth = 5;
  drawRoundRect(ctx, btn.x + pad, btn.y + pad, btn.w - pad * 2, btn.h - pad * 2, 40);
  ctx.stroke();

  // Colored circle behind icon
  ctx.fillStyle = btn.color + "22";
  ctx.beginPath();
  ctx.arc(cx, cy - 90, 130, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = btn.color + "66";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy - 90, 130, 0, Math.PI * 2);
  ctx.stroke();

  // Icon (emoji)
  ctx.font = "180px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(btn.icon, cx, cy - 90);

  // Label
  ctx.fillStyle = COLORS.text;
  ctx.font = "bold 110px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(btn.label, cx, cy + 115);

  // Sub text
  ctx.fillStyle = btn.color;
  ctx.font = "60px sans-serif";
  ctx.fillText(btn.sub, cx, cy + 245);
});

// ── บันทึกไฟล์ ───────────────────────────────────────────────
const buffer = canvas.toBuffer("image/png");
fs.writeFileSync("./richmenu.png", buffer);
console.log("✅ สร้าง richmenu.png สำเร็จ (2500×1686 px)");
console.log("   ต่อไปรัน: node setup-richmenu.js");
