#!/usr/bin/env node
// Migrasi data Naravia lama (SQLite single-user) ke PostgreSQL multi-user.
// Seluruh data lama dimasukkan sebagai milik satu akun tujuan (biasanya akun admin).
//
// Pemakaian:
//   node --env-file=.env.local scripts/migrate-sqlite-to-postgres.mjs --email admin@contoh.com [--sqlite data/naravia.db] [--dry-run]
//
// Akun tujuan harus sudah ada (daftar lewat web atau buat dengan scripts/create-admin.mjs).
// Aman dijalankan ulang: baris dengan ID yang sudah ada dilewati (ON CONFLICT DO NOTHING).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { MIGRATIONS_SQL, SCHEMA_SQL } from '../src/lib/schema.mjs';

function parseArgs(argv) {
  const args = { sqlite: 'data/naravia.db', email: '', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sqlite') args.sqlite = argv[++i];
    else if (a === '--email') args.email = String(argv[++i] || '').trim().toLowerCase();
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

const SYSTEM_KEYS = new Set([
  'provider', 'llm_base_url', 'llm_api_key', 'model', 'research_llm_base_url', 'research_llm_api_key',
  'research_model', 'google_api_key', 'ollama_base_url', 'ollama_model', 'ollama_api_key',
  'search_provider', 'search_api_key',
]);
const USER_KEYS = new Set([
  'temperature', 'max_tokens', 'default_reply_style', 'history_limit', 'auto_summarize_threshold', 'auto_extract_memory',
]);

function tableExists(sqlite, name) {
  return Boolean(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function rowsOf(sqlite, sql) {
  try {
    return sqlite.prepare(sql).all();
  } catch {
    return [];
  }
}

function ts(value) {
  // SQLite menyimpan ISO string; nilai kosong diganti waktu sekarang agar lolos NOT NULL
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function insertRows(client, table, columns, rows, stats) {
  if (rows.length === 0) return;
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
  let inserted = 0;
  for (const row of rows) {
    const res = await client.query(sql, columns.map((c) => row[c] ?? null));
    inserted += res.rowCount || 0;
  }
  stats.push({ table, read: rows.length, inserted });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email) {
    console.error('Wajib menyertakan --email <email akun tujuan>.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL belum diatur. Jalankan dengan: node --env-file=.env.local ...');
    process.exit(1);
  }
  const sqlitePath = path.resolve(args.sqlite);
  if (!fs.existsSync(sqlitePath)) {
    console.error(`File SQLite tidak ditemukan: ${sqlitePath}`);
    process.exit(1);
  }

  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const stats = [];

  try {
    await client.query(SCHEMA_SQL);
    await client.query(MIGRATIONS_SQL);
    const target = await client.query('SELECT id, email, role FROM users WHERE email = $1', [args.email]);
    if (!target.rows[0]) {
      throw new Error(`Akun ${args.email} belum ada. Daftar lewat web atau jalankan scripts/create-admin.mjs dulu.`);
    }
    const userId = target.rows[0].id;
    console.log(`Akun tujuan: ${args.email} (${target.rows[0].role})`);

    await client.query('BEGIN');

    // 1. Dunia & lore
    const worlds = rowsOf(sqlite, 'SELECT * FROM worlds').map((w) => ({
      ...w, user_id: userId, created_at: ts(w.created_at), updated_at: ts(w.updated_at),
    }));
    await insertRows(client, 'worlds',
      ['id', 'user_id', 'name', 'description', 'rules', 'places', 'factions', 'timeline', 'created_at', 'updated_at'],
      worlds, stats);

    const lore = rowsOf(sqlite, 'SELECT * FROM lore_entries').map((l) => ({ ...l, created_at: ts(l.created_at) }));
    await insertRows(client, 'lore_entries',
      ['id', 'world_id', 'title', 'keywords', 'content', 'enabled', 'created_at'], lore, stats);

    // 2. Karakter
    const characters = rowsOf(sqlite, 'SELECT * FROM characters').map((c) => ({
      ...c, user_id: userId, created_at: ts(c.created_at), updated_at: ts(c.updated_at),
    }));
    await insertRows(client, 'characters',
      ['id', 'user_id', 'name', 'tagline', 'avatar', 'description', 'personality', 'speaking_style', 'scenario',
        'greeting', 'example_dialogues', 'tags', 'research_notes', 'world_id', 'is_pinned', 'is_favorite',
        'temperature_override', 'created_at', 'updated_at'],
      characters, stats);

    // 3. Persona (tabel multi-persona; persona bawaan akun baru dipertahankan)
    const personas = tableExists(sqlite, 'user_personas')
      ? rowsOf(sqlite, 'SELECT * FROM user_personas').map((p) => ({
          ...p, user_id: userId, created_at: ts(p.created_at), updated_at: ts(p.updated_at),
        }))
      : [];
    if (personas.some((p) => p.is_default)) {
      // Persona utama lama menggantikan status utama persona bawaan akun baru
      await client.query('UPDATE user_personas SET is_default = 0 WHERE user_id = $1', [userId]);
    }
    await insertRows(client, 'user_personas',
      ['id', 'user_id', 'display_name', 'avatar', 'description', 'likes', 'dislikes', 'is_default', 'created_at', 'updated_at'],
      personas, stats);

    // 4. Percakapan & pesan
    const chats = rowsOf(sqlite, 'SELECT * FROM chats').map((c) => ({
      ...c, user_id: userId, created_at: ts(c.created_at), updated_at: ts(c.updated_at),
    }));
    await insertRows(client, 'chats',
      ['id', 'user_id', 'character_id', 'title', 'summary', 'summarized_until_msg_id', 'temperature', 'max_tokens',
        'reply_style', 'persona_id', 'persona_snapshot', 'use_latest_persona', 'created_at', 'updated_at'],
      chats, stats);

    const messages = rowsOf(sqlite, 'SELECT * FROM messages').map((m) => ({ ...m, created_at: ts(m.created_at) }));
    await insertRows(client, 'messages',
      ['id', 'chat_id', 'role', 'content', 'alternatives', 'active_alt_index', 'is_pinned_memory', 'created_at'],
      messages, stats);

    // 5. Memori
    const memories = rowsOf(sqlite, 'SELECT * FROM memories').map((m) => ({
      ...m, user_id: userId, created_at: ts(m.created_at),
    }));
    await insertRows(client, 'memories',
      ['id', 'user_id', 'character_id', 'type', 'content', 'source_chat_id', 'source_message_id', 'is_auto', 'created_at'],
      memories, stats);

    // 6. Grup chat
    const groups = rowsOf(sqlite, 'SELECT * FROM group_chats').map((g) => ({
      ...g, user_id: userId, created_at: ts(g.created_at), updated_at: ts(g.updated_at),
    }));
    await insertRows(client, 'group_chats',
      ['id', 'user_id', 'title', 'scenario', 'turn_mode', 'last_speaker_id', 'persona_id', 'temperature', 'max_tokens',
        'created_at', 'updated_at'],
      groups, stats);
    await insertRows(client, 'group_chat_members', ['group_chat_id', 'character_id', 'join_order'],
      rowsOf(sqlite, 'SELECT * FROM group_chat_members'), stats);
    const groupMessages = rowsOf(sqlite, 'SELECT * FROM group_messages').map((m) => ({ ...m, created_at: ts(m.created_at) }));
    await insertRows(client, 'group_messages',
      ['id', 'group_chat_id', 'role', 'character_id', 'content', 'created_at'], groupMessages, stats);

    // 7. Riwayat pemakaian token
    const tokens = rowsOf(sqlite, 'SELECT * FROM token_usage').map((t) => ({
      ...t, user_id: userId, created_at: ts(t.created_at),
    }));
    await insertRows(client, 'token_usage',
      ['id', 'user_id', 'character_id', 'chat_id', 'action_type', 'tokens_in', 'tokens_out', 'created_at'], tokens, stats);

    // 8. Setelan: provider AI menjadi setelan sistem, parameter percakapan menjadi setelan pribadi
    let systemCount = 0;
    let userCount = 0;
    for (const { key, value } of rowsOf(sqlite, 'SELECT key, value FROM settings')) {
      if (SYSTEM_KEYS.has(key) && String(value || '').trim()) {
        await client.query(
          `INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [key, String(value)]
        );
        systemCount++;
      } else if (USER_KEYS.has(key)) {
        await client.query(
          `INSERT INTO user_settings (user_id, key, value) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
          [userId, key, String(value)]
        );
        userCount++;
      }
    }
    stats.push({ table: 'system_settings', read: systemCount, inserted: systemCount });
    stats.push({ table: 'user_settings', read: userCount, inserted: userCount });

    // 9. Catat kepemilikan file unggahan yang dirujuk data lama
    const uploadsDir = path.resolve('data', 'uploads');
    const legacyUploadsDir = path.resolve('public', 'uploads');
    const avatars = new Set(
      [...characters, ...personas].map((r) => String(r.avatar || '')).filter((a) => a.startsWith('/uploads/'))
    );
    let uploadCount = 0;
    for (const url of avatars) {
      const filename = path.basename(url);
      const primary = path.join(uploadsDir, filename);
      const legacy = path.join(legacyUploadsDir, filename);
      const full = fs.existsSync(primary) ? primary : legacy;
      const size = fs.existsSync(full) ? fs.statSync(full).size : 0;
      const res = await client.query(
        'INSERT INTO uploads (filename, user_id, size_bytes) VALUES ($1, $2, $3) ON CONFLICT (filename) DO NOTHING',
        [filename, userId, size]
      );
      uploadCount += res.rowCount || 0;
    }
    stats.push({ table: 'uploads', read: avatars.size, inserted: uploadCount });

    if (args.dryRun) {
      await client.query('ROLLBACK');
      console.log('\nMode --dry-run: tidak ada perubahan yang disimpan.');
    } else {
      await client.query('COMMIT');
      console.log('\nMigrasi selesai dan tersimpan.');
    }
    console.table(stats);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('Migrasi gagal, semua perubahan dibatalkan:', err.message || err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
    sqlite.close();
  }
}

main();
