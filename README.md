# 🤖 Line OA Daily Bot  v3  — Session History Edition

บันทึกรายรับรายจ่าย + หารค่าอาหาร พร้อมระบบประวัติแบบถาวร (Supabase)

---

## ✨ ฟีเจอร์ทั้งหมด

### 💚 รายรับ / ❤️ รายจ่าย (บันทึกด่วน)
```
+5000 เงินเดือนมีนาคม
-60 ข้าวกลางวัน
-1200 ค่าไฟ
```
→ บันทึกทันที พร้อมบันทึกลงประวัติอัตโนมัติ

### 🍱 หารค่าอาหาร (4-step flow)
```
Step 1  คุณ: หาร
Step 2  Bot: ตั้งชื่อรายการ?
        คุณ: หารเงิน Lineman ออฟฟิศวันศุกร์
Step 3  Bot: ส่งรายการ...
        คุณ: A กะเพรา 60, B ข้าวไข่เจียว 40, C ผัดซีอิ๊ว 50
Step 4  Bot: มีส่วนลดเท่าไหร่?
        คุณ: 30   (หรือ 0 ถ้าไม่มี)
        Bot: 💳 ผลการหาร + บันทึกในประวัติ ✓
```

### 📚 ประวัติการใช้งาน
```
ประวัติ            → 10 รายการล่าสุด
ประวัติ 20         → 20 รายการล่าสุด
ประวัติหาร         → เฉพาะรายการหารบิล
ประวัติรายรับ      → เฉพาะรายรับ
ประวัติรายจ่าย     → เฉพาะรายจ่าย
```

**ตัวอย่างผลลัพธ์:**
```
📚 ประวัติการใช้งาน
━━━━━━━━━━━━━━━━
1. 🍱 หารเงิน Lineman ออฟฟิศวันศุกร์
   📅 11 มี.ค. 2568  •  หารบิล
   👤 A(กะเพรา) → 48.00 บาท
   👤 B(ข้าวไข่เจียว) → 32.00 บาท
   👤 C(ผัดซีอิ๊ว) → 40.00 บาท
   🎫 ส่วนลด: -30.00 บาท
   ✅ รวมสุทธิ: 120.00 บาท

2. 💚 เงินเดือนมีนาคม
   📅 10 มี.ค. 2568  •  รายรับ
   💵 +5,000.00 บาท

3. ❤️ ค่าไฟ
   📅 9 มี.ค. 2568  •  รายจ่าย
   💵 -1,200.00 บาท
━━━━━━━━━━━━━━━━
รวม 3 รายการล่าสุด
```

### 📊 สรุปรายรับรายจ่าย
```
สรุป   → แสดงรายการทั้งหมด + ยอดคงเหลือ
```

---

## 🗄️ ตั้งค่า Supabase

### 1. สร้าง Project
- https://supabase.com → New Project
- Region: Southeast Asia (Singapore)
- รอ ~2 นาที

### 2. รัน SQL Schema
- SQL Editor → New Query
- วางเนื้อหาจาก `supabase_schema.sql` → Run

> ⚠️ **ถ้า upgrade จาก v2**: SQL จะ DROP tables เก่าก่อน ข้อมูลเก่าจะหาย

### 3. เอา API Keys
Project Settings → API:
- `SUPABASE_URL`      = Project URL
- `SUPABASE_ANON_KEY` = anon public key

---

## 🚀 Deploy (Railway — ฟรี)

1. Push ขึ้น GitHub
2. railway.app → New Project → Deploy from GitHub
3. เพิ่ม Environment Variables:

| Key | Value |
|-----|-------|
| `LINE_CHANNEL_ACCESS_TOKEN` | จาก LINE Console |
| `LINE_CHANNEL_SECRET` | จาก LINE Console |
| `SUPABASE_URL` | จาก Supabase |
| `SUPABASE_ANON_KEY` | จาก Supabase |

4. LINE Console → Webhook URL = `https://xxx.railway.app/webhook`
5. เปิด Use webhook ✅  ปิด Auto-reply ❌

---

## 📂 โครงสร้างไฟล์

```
line-oa-bot/
├── index.js              ← bot ทั้งหมด (v3)
├── supabase_schema.sql   ← SQL สร้าง 2 tables (sessions, bot_state)
├── package.json
└── .env.example
```

---

## 🗃️ Database Schema

```
sessions
  id          BIGSERIAL PK
  user_id     TEXT          ← LINE userId หรือ groupId
  title       TEXT          ← ชื่อที่ user ตั้ง / note
  type        TEXT          ← 'income' | 'expense' | 'split'
  summary     JSONB         ← ข้อมูล (amount, participants, etc.)
  created_at  TIMESTAMPTZ

bot_state
  user_id     TEXT PK
  mode        TEXT          ← state ปัจจุบันของ flow
  data        JSONB         ← ข้อมูลชั่วคราวระหว่าง flow
  updated_at  TIMESTAMPTZ
```
