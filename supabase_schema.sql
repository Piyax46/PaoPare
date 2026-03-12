-- ================================================================
-- Line OA Bot v5 — Supabase Schema (Updated)
-- วิธีใช้: Supabase → SQL Editor → วาง SQL นี้ → Run
-- ⚠️ DROP แล้วสร้างใหม่ทั้งหมด (ข้อมูลเก่าจะหาย)
-- ================================================================

-- ── ล้าง table เก่า ──────────────────────────────────────────
DROP TABLE IF EXISTS recurring_expenses CASCADE;
DROP TABLE IF EXISTS user_categories     CASCADE;
DROP TABLE IF EXISTS user_budgets        CASCADE;
DROP TABLE IF EXISTS bot_state          CASCADE;
DROP TABLE IF EXISTS sessions           CASCADE;
DROP TABLE IF EXISTS ledger             CASCADE;

-- ── 1. sessions ─────────────────────────────────────────────────
--  type: 'income' | 'expense' | 'split'
--  summary.category — เก็บ category name สำหรับ expense
CREATE TABLE sessions (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     TEXT         NOT NULL,
  title       TEXT         NOT NULL,
  type        TEXT         NOT NULL CHECK (type IN ('income', 'expense', 'split')),
  summary     JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessions_user_id    ON sessions(user_id);
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);
CREATE INDEX idx_sessions_type       ON sessions(user_id, type);

-- ── 2. bot_state ────────────────────────────────────────────────
CREATE TABLE bot_state (
  user_id     TEXT         PRIMARY KEY,
  mode        TEXT,
  data        JSONB        NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 3. user_budgets ─────────────────────────────────────────────
CREATE TABLE user_budgets (
  user_id     TEXT         PRIMARY KEY,
  amount      NUMERIC      NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 4. user_categories ──────────────────────────────────────────
--  ให้ user เพิ่มหมวดหมู่เองได้ พร้อม keyword binding
CREATE TABLE user_categories (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     TEXT         NOT NULL,
  name        TEXT         NOT NULL,
  keywords    JSONB        NOT NULL DEFAULT '[]',
  color       TEXT         DEFAULT '#B898D8',
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- ── 5. recurring_expenses ────────────────────────────────────────
--  รายจ่ายประจำ — remind อัตโนมัติทุกเดือน
--  day_of_month: 1-31 (วันที่จ่าย)
--  last_reminded: เดือนล่าสุดที่ remind แล้ว
CREATE TABLE recurring_expenses (
  id              BIGSERIAL    PRIMARY KEY,
  user_id         TEXT         NOT NULL,
  description     TEXT         NOT NULL,
  amount          NUMERIC      NOT NULL,
  day_of_month    INTEGER      NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
  last_reminded   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX idx_recurring_user ON recurring_expenses(user_id);

-- ── Row Level Security ──────────────────────────────────────────
ALTER TABLE sessions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_state          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_budgets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_sessions"    ON sessions           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_bot_state"   ON bot_state          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_budgets"     ON user_budgets       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_categories"  ON user_categories    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_recurring"   ON recurring_expenses FOR ALL USING (true) WITH CHECK (true);

-- ── ตรวจสอบ: ดู tables ที่สร้างสำเร็จ ─────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;