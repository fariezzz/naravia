import { Pool, PoolClient, QueryResultRow, types } from 'pg';
import { SCHEMA_SQL } from './schema.mjs';
import { systemDefaultsFromEnv } from './settingsKeys';
import { insertUserRecords } from './userRecords';

// Kembalikan TIMESTAMPTZ sebagai string ISO (frontend mengandalkan string, bukan objek Date)
types.setTypeParser(1184, (v: string) => new Date(v).toISOString());
types.setTypeParser(1114, (v: string) => new Date(`${v}Z`).toISOString());
// COUNT/SUM (bigint/numeric) dikembalikan sebagai number agar konsisten dengan perilaku lama
types.setTypeParser(20, (v: string) => parseInt(v, 10));
types.setTypeParser(1700, (v: string) => parseFloat(v));

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  role: 'user' | 'admin';
  is_active: number;
  daily_token_budget: number | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CharacterRow {
  id: string;
  user_id?: string;
  name: string;
  tagline: string;
  avatar: string;
  description: string;
  personality: string;
  speaking_style: string;
  scenario: string;
  greeting: string; // JSON string[]
  example_dialogues: string; // JSON Array<{user: string, char: string}>
  tags: string; // JSON string[]
  research_notes: string; // JSON atau teks catatan riset
  world_id: string | null;
  is_pinned: number;
  is_favorite: number;
  temperature_override: number | null;
  created_at: string;
  updated_at: string;
}

export interface ChatRow {
  id: string;
  user_id: string;
  character_id: string;
  title: string;
  summary: string;
  summarized_until_msg_id: string | null;
  temperature: number | null;
  max_tokens: number | null;
  reply_style: string; // 'pendek' | 'sedang' | 'panjang'
  persona_id: string | null;
  persona_snapshot: string | null;
  use_latest_persona: number;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  chat_id: string;
  role: 'user' | 'character';
  content: string;
  alternatives: string; // JSON string[] untuk fitur swipe
  active_alt_index: number;
  is_pinned_memory: number;
  created_at: string;
}

export interface MemoryRow {
  id: string;
  user_id?: string;
  character_id: string | null;
  type: 'fact' | 'preference' | 'event';
  content: string;
  source_chat_id: string | null;
  source_message_id: string | null;
  is_auto: number;
  created_at: string;
}

export interface UserPersonaRow {
  id: string;
  user_id?: string;
  display_name: string;
  avatar: string;
  description: string;
  likes: string;
  dislikes: string;
  is_default: number;
  created_at?: string;
  updated_at: string;
}

export interface WorldRow {
  id: string;
  user_id?: string;
  name: string;
  description: string;
  rules: string;
  places: string; // JSON Array<{name: string, description: string}>
  factions: string; // JSON Array<{name: string, description: string}>
  timeline: string; // JSON Array<{era: string, event: string}>
  created_at: string;
  updated_at: string;
}

export interface LoreEntryRow {
  id: string;
  world_id: string;
  title: string;
  keywords: string; // JSON string[]
  content: string;
  enabled: number;
  created_at: string;
}

export interface GroupChatRow {
  id: string;
  user_id: string;
  title: string;
  scenario: string;
  turn_mode: 'auto' | 'mentioned' | 'round_robin';
  last_speaker_id: string | null;
  persona_id: string | null;
  temperature: number;
  max_tokens: number;
  created_at: string;
  updated_at: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __naraviaPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __naraviaInit: Promise<void> | undefined;
}

function getPool(): Pool {
  if (!global.__naraviaPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL belum diatur. Isi koneksi PostgreSQL di file .env.local.');
    }
    global.__naraviaPool = new Pool({
      connectionString,
      max: parseInt(process.env.DATABASE_POOL_MAX || '10', 10) || 10,
      idleTimeoutMillis: 30000,
    });
  }
  return global.__naraviaPool;
}

async function ensureDb(): Promise<void> {
  if (!global.__naraviaInit) {
    global.__naraviaInit = initializeDatabase().catch((err) => {
      // Izinkan percobaan ulang pada request berikutnya jika inisialisasi gagal
      global.__naraviaInit = undefined;
      throw err;
    });
  }
  return global.__naraviaInit;
}

export async function query<T extends QueryResultRow = any>(
  sql: string,
  params: unknown[] = [],
  client?: PoolClient
): Promise<T[]> {
  await ensureDb();
  const res = await (client || getPool()).query<T>(sql, params as any[]);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = any>(
  sql: string,
  params: unknown[] = [],
  client?: PoolClient
): Promise<T | null> {
  const rows = await query<T>(sql, params, client);
  return rows[0] || null;
}

export async function execute(sql: string, params: unknown[] = [], client?: PoolClient): Promise<number> {
  await ensureDb();
  const res = await (client || getPool()).query(sql, params as any[]);
  return res.rowCount || 0;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  await ensureDb();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export function nowIso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

// Zona waktu untuk batas "hari ini" pada kuota token harian
export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Jakarta';

async function initializeDatabase(): Promise<void> {
  const client = await getPool().connect();
  try {
    // Kunci advisory mencegah dua instance menjalankan migrasi skema bersamaan
    await client.query('SELECT pg_advisory_lock(7240311)');
    await client.query(SCHEMA_SQL);

    const defaults = systemDefaultsFromEnv();
    for (const [k, v] of Object.entries(defaults)) {
      await client.query(
        'INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
        [k, v]
      );
    }

    await bootstrapAdminFromEnv(client);
  } finally {
    await client.query('SELECT pg_advisory_unlock(7240311)').catch(() => undefined);
    client.release();
  }
}

// Membuat (atau mempromosikan) akun admin dari ADMIN_EMAIL + ADMIN_PASSWORD bila diisi
async function bootstrapAdminFromEnv(client: PoolClient): Promise<void> {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) return;

  const existing = await client.query<{ id: string; role: string }>(
    'SELECT id, role FROM users WHERE email = $1',
    [email]
  );
  if (existing.rows[0]) {
    if (existing.rows[0].role !== 'admin') {
      await client.query("UPDATE users SET role = 'admin', updated_at = now() WHERE id = $1", [existing.rows[0].id]);
    }
    return;
  }

  await client.query('BEGIN');
  try {
    await insertUserRecords(client, {
      email,
      password,
      displayName: (process.env.ADMIN_NAME || 'Admin').trim() || 'Admin',
      role: 'admin',
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}
