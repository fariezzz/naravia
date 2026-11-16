// Skema PostgreSQL Naravia (multi-pengguna).
// Seluruh data milik pengguna terikat ke kolom user_id dan ikut terhapus saat akun dihapus.
// File .mjs agar bisa dipakai bersama oleh aplikasi Next.js dan skrip migrasi Node biasa.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_active INTEGER NOT NULL DEFAULT 1,
  daily_token_budget INTEGER DEFAULT NULL,
  last_login_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  rules TEXT DEFAULT '',
  places TEXT DEFAULT '[]',
  factions TEXT DEFAULT '[]',
  timeline TEXT DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lore_entries (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  title TEXT DEFAULT '',
  keywords TEXT DEFAULT '[]',
  content TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tagline TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  description TEXT DEFAULT '',
  personality TEXT DEFAULT '',
  speaking_style TEXT DEFAULT '',
  scenario TEXT DEFAULT '',
  greeting TEXT DEFAULT '[]',
  example_dialogues TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',
  research_notes TEXT DEFAULT '',
  world_id TEXT DEFAULT NULL REFERENCES worlds(id) ON DELETE SET NULL,
  is_pinned INTEGER DEFAULT 0,
  is_favorite INTEGER DEFAULT 0,
  temperature_override DOUBLE PRECISION DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_personas (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Kamu',
  avatar TEXT DEFAULT '',
  description TEXT DEFAULT '',
  likes TEXT DEFAULT '',
  dislikes TEXT DEFAULT '',
  is_default INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT DEFAULT '',
  summarized_until_msg_id TEXT DEFAULT NULL,
  temperature DOUBLE PRECISION DEFAULT NULL,
  max_tokens INTEGER DEFAULT NULL,
  reply_style TEXT DEFAULT 'sedang',
  persona_id TEXT DEFAULT NULL,
  persona_snapshot TEXT DEFAULT NULL,
  use_latest_persona INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  alternatives TEXT DEFAULT '[]',
  active_alt_index INTEGER DEFAULT 0,
  is_pinned_memory INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id TEXT DEFAULT NULL REFERENCES characters(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'fact',
  content TEXT NOT NULL,
  source_chat_id TEXT DEFAULT NULL,
  source_message_id TEXT DEFAULT NULL,
  is_auto INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  scenario TEXT DEFAULT '',
  turn_mode TEXT DEFAULT 'auto',
  last_speaker_id TEXT DEFAULT NULL,
  persona_id TEXT DEFAULT NULL,
  temperature DOUBLE PRECISION DEFAULT 0.9,
  max_tokens INTEGER DEFAULT 1024,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_chat_members (
  group_chat_id TEXT NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  join_order INTEGER DEFAULT 0,
  PRIMARY KEY (group_chat_id, character_id)
);

CREATE TABLE IF NOT EXISTS group_messages (
  id TEXT PRIMARY KEY,
  group_chat_id TEXT NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  character_id TEXT DEFAULT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS token_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  character_id TEXT DEFAULT NULL,
  chat_id TEXT DEFAULT NULL,
  action_type TEXT DEFAULT 'chat',
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS uploads (
  filename TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  size_bytes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT DEFAULT NULL,
  actor_email TEXT DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_worlds_user ON worlds(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lore_world_id ON lore_entries(world_id, enabled);
CREATE INDEX IF NOT EXISTS idx_characters_user ON characters(user_id, is_pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_characters_world_id ON characters(world_id);
CREATE INDEX IF NOT EXISTS idx_personas_user ON user_personas(user_id, is_default DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chats_character ON chats(character_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_memories_user_character ON memories(user_id, character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_chats_user ON group_chats(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_members ON group_chat_members(group_chat_id, join_order ASC);
CREATE INDEX IF NOT EXISTS idx_group_messages_chat ON group_messages(group_chat_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_token_usage_user_created ON token_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
`;
