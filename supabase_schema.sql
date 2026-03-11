-- ================================================================
-- Line OA Bot v3 — Supabase Schema
-- วิธีใช้: Supabase → SQL Editor → วาง SQL นี้ → Run
-- ================================================================

-- ── ล้าง table เก่าถ้ามี (สำหรับ upgrade จาก v2) ──────────────
DROP TABLE IF EXISTS ledger    CASCADE;
DROP TABLE IF EXISTS bot_state CASCADE;
DROP TABLE IF EXISTS sessions  CASCADE;

-- ── 1. sessions — เก็บทุก activity พร้อม title และ summary ─────
--
--  type:
--    'income'  → รายรับ    summary: { amount, note }
--    'expense' → รายจ่าย   summary: { amount, note }
--    'split'   → หารบิล    summary: { participants:[{name,item,price,discountShare,finalPay}],
--                                      discount, totalBefore, totalAfter }
-- ──────────────────────────────────────────────────────────────
CREATE TABLE sessions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('income', 'expense', 'split')),
  summary     JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);
CREATE INDEX idx_sessions_type       ON sessions(user_id, type);

-- ── 2. bot_state — เก็บ conversation state ────────────────────
CREATE TABLE bot_state (
  user_id     TEXT        PRIMARY KEY,
  mode        TEXT,
  data        JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Row Level Security ──────────────────────────────────────
ALTER TABLE sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_sessions"   ON sessions   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_bot_state"  ON bot_state  FOR ALL USING (true) WITH CHECK (true);
