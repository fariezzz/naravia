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
  -- 'private' hanya pemilik, 'public' bisa dilihat siapa pun termasuk tamu
  visibility TEXT NOT NULL DEFAULT 'private',
  allow_remix INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS character_bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, character_id)
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
  -- Dibiarkan NULL saat karakternya dihapus: riwayat percakapan tetap bisa dibaca,
  -- tetapi tidak bisa menerima pesan baru lagi
  character_id TEXT DEFAULT NULL REFERENCES characters(id) ON DELETE SET NULL,
  -- Definisi karakter saat percakapan ini dibuat; suntingan pemilik setelahnya
  -- tidak mengubah percakapan yang sudah berjalan
  character_snapshot TEXT DEFAULT NULL,
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
  embedding TEXT DEFAULT NULL,
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
  story_id TEXT DEFAULT NULL,
  action_type TEXT DEFAULT 'chat',
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  synopsis TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  genre TEXT DEFAULT 'Bebas',
  tags TEXT DEFAULT '[]',
  world_id TEXT DEFAULT NULL REFERENCES worlds(id) ON DELETE SET NULL,
  pov TEXT NOT NULL DEFAULT 'third_limited',
  tone TEXT NOT NULL DEFAULT 'sinematik',
  writing_style_notes TEXT DEFAULT '',
  authors_note TEXT DEFAULT '',
  temperature DOUBLE PRECISION DEFAULT 0.85,
  length_preset TEXT NOT NULL DEFAULT 'sedang',
  status TEXT NOT NULL DEFAULT 'ongoing',
  visibility TEXT NOT NULL DEFAULT 'private',
  published_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS story_cast (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  character_id TEXT DEFAULT NULL REFERENCES characters(id) ON DELETE SET NULL,
  character_snapshot TEXT DEFAULT NULL,
  name TEXT NOT NULL,
  role_in_story TEXT NOT NULL DEFAULT 'pendukung',
  bio TEXT DEFAULT '',
  current_state TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS story_chapters (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  outline_notes TEXT DEFAULT '',
  word_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS story_revisions (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES story_chapters(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'append_variants',
  base_content TEXT DEFAULT '',
  variants TEXT DEFAULT '[]',
  active_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS story_bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, story_id)
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

// Migrasi untuk database yang tabelnya sudah ada sebelumnya.
// CREATE TABLE IF NOT EXISTS tidak menambahkan kolom baru pada tabel lama, jadi
// perubahan kolom harus dinyatakan terpisah. Seluruh pernyataan di sini wajib
// idempoten karena dijalankan setiap kali aplikasi tersambung ke database.
export const MIGRATIONS_SQL = `
-- Visibilitas karakter (fitur karakter publik)
ALTER TABLE characters ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';
ALTER TABLE characters ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ DEFAULT NULL;

-- Definisi karakter dibekukan per percakapan
ALTER TABLE chats ADD COLUMN IF NOT EXISTS character_snapshot TEXT DEFAULT NULL;

-- Riwayat percakapan harus tetap ada walau karakternya dihapus pemiliknya.
-- Tabel lama memakai NOT NULL + ON DELETE CASCADE, jadi keduanya diubah.
ALTER TABLE chats ALTER COLUMN character_id DROP NOT NULL;

DO $$
DECLARE
  nama_constraint TEXT;
BEGIN
  SELECT con.conname INTO nama_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = con.conkey[1]
  WHERE rel.relname = 'chats'
    AND con.contype = 'f'
    AND att.attname = 'character_id'
    AND con.confdeltype <> 'n'
  LIMIT 1;

  IF nama_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE chats DROP CONSTRAINT %I', nama_constraint);
    ALTER TABLE chats
      ADD CONSTRAINT chats_character_id_fkey
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_characters_public
  ON characters(published_at DESC) WHERE visibility = 'public';

-- Kolom vektor embedding opsional untuk pencarian memori semantik
ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding TEXT DEFAULT NULL;

-- Izin remix untuk karakter publik & tabel bookmark karakter publik
ALTER TABLE characters ADD COLUMN IF NOT EXISTS allow_remix INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS character_bookmarks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, character_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON character_bookmarks(user_id, created_at DESC);

-- Fitur Storytelling Studio (Novel & Prosa)
ALTER TABLE token_usage ADD COLUMN IF NOT EXISTS story_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_stories_user ON stories(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_public ON stories(published_at DESC) WHERE visibility = 'public';
CREATE INDEX IF NOT EXISTS idx_story_cast_story ON story_cast(story_id, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_story_chapters_story ON story_chapters(story_id, chapter_number ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_story_revisions_chapter ON story_revisions(chapter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_bookmarks_user ON story_bookmarks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_story ON token_usage(story_id) WHERE story_id IS NOT NULL;
`;
