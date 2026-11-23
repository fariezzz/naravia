import type { PoolClient } from 'pg';
import {
  APP_TIMEZONE,
  CharacterRow,
  ChatRow,
  execute,
  GroupChatRow,
  LoreEntryRow,
  MessageRow,
  query,
  queryOne,
  UserPersonaRow,
  WorldRow,
} from './db';
import { decryptSecret, encryptSecret } from './crypto';
import { parseJsonSafe } from './format';
import { HttpError } from './http';
import { newId } from './ids';
import { SECRET_SETTING_KEYS, SYSTEM_SETTING_KEYS, USER_SETTING_DEFAULTS } from './settingsKeys';

// ===================== Setelan =====================

let _systemSettingsCache: { data: Record<string, string>; at: number } | null = null;
const SYSTEM_CACHE_MS = 15_000;

export async function getSystemSettings(): Promise<Record<string, string>> {
  if (_systemSettingsCache && Date.now() - _systemSettingsCache.at < SYSTEM_CACHE_MS) {
    return _systemSettingsCache.data;
  }
  const rows = await query<{ key: string; value: string }>('SELECT key, value FROM system_settings');
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = SECRET_SETTING_KEYS.has(r.key) ? decryptSecret(r.value) : r.value;
  }
  _systemSettingsCache = { data: map, at: Date.now() };
  return map;
}

export async function updateSystemSettings(updates: Record<string, string>): Promise<void> {
  const allowed = new Set<string>(SYSTEM_SETTING_KEYS);
  for (const [k, v] of Object.entries(updates)) {
    if (!allowed.has(k) || v === undefined || v === null) continue;
    const rawVal = String(v);
    const storedVal = SECRET_SETTING_KEYS.has(k) && rawVal ? encryptSecret(rawVal) : rawVal;
    await execute(
      `INSERT INTO system_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [k, storedVal]
    );
  }
  _systemSettingsCache = null;
}

export async function getUserSettings(userId: string): Promise<Record<string, string>> {
  const rows = await query<{ key: string; value: string }>(
    'SELECT key, value FROM user_settings WHERE user_id = $1',
    [userId]
  );
  const map: Record<string, string> = { ...USER_SETTING_DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export async function updateUserSettings(userId: string, updates: Record<string, string>): Promise<void> {
  for (const [k, v] of Object.entries(updates)) {
    if (!(k in USER_SETTING_DEFAULTS) || v === undefined || v === null) continue;
    await execute(
      `INSERT INTO user_settings (user_id, key, value) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [userId, k, String(v)]
    );
  }
}

// Gabungan setelan global + pribadi. Hanya untuk dipakai di server; jangan dikirim utuh ke klien.
export async function getSettingsMap(userId: string): Promise<Record<string, string>> {
  const [system, user] = await Promise.all([getSystemSettings(), getUserSettings(userId)]);
  return { ...system, ...user };
}

// ===================== Kuota Token =====================

export async function recordTokenUsage(params: {
  userId: string;
  characterId?: string | null;
  chatId?: string | null;
  actionType?: string;
  tokensIn: number;
  tokensOut: number;
}) {
  await execute(
    `INSERT INTO token_usage (id, user_id, character_id, chat_id, action_type, tokens_in, tokens_out)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      newId('tok'),
      params.userId,
      params.characterId || null,
      params.chatId || null,
      params.actionType || 'chat',
      Math.max(0, Math.round(params.tokensIn || 0)),
      Math.max(0, Math.round(params.tokensOut || 0)),
    ]
  );
}

// Awal hari ini menurut zona waktu aplikasi (bukan UTC), agar kuota reset tengah malam waktu lokal
const TODAY_START_SQL = `(date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2)`;

export async function getTodayTokenUsage(userId: string): Promise<{ used: number; calls: number }> {
  const row = await queryOne<{ used: number; calls: number }>(
    `SELECT COALESCE(SUM(tokens_in + tokens_out), 0) AS used, COUNT(*) AS calls
     FROM token_usage WHERE user_id = $1 AND created_at >= ${TODAY_START_SQL}`,
    [userId, APP_TIMEZONE]
  );
  return { used: Number(row?.used || 0), calls: Number(row?.calls || 0) };
}

// null = ikut kuota bawaan sistem, 0 = tanpa batas. Admin tidak dibatasi.
export async function getEffectiveDailyBudget(userId: string): Promise<number> {
  const user = await queryOne<{ role: string; daily_token_budget: number | null }>(
    'SELECT role, daily_token_budget FROM users WHERE id = $1',
    [userId]
  );
  if (!user) throw new HttpError(401, 'Akun tidak ditemukan.');
  if (user.role === 'admin') return 0;
  if (user.daily_token_budget !== null && user.daily_token_budget !== undefined) {
    return Math.max(0, Number(user.daily_token_budget));
  }
  const system = await getSystemSettings();
  return Math.max(0, parseInt(system.default_daily_token_budget || '0', 10) || 0);
}

export async function assertTokenBudget(userId: string): Promise<void> {
  const budget = await getEffectiveDailyBudget(userId);
  if (budget <= 0) return;
  const { used } = await getTodayTokenUsage(userId);
  if (used >= budget) {
    throw new HttpError(
      429,
      `Kuota token harian kamu sudah habis (${used.toLocaleString('id-ID')} dari ${budget.toLocaleString('id-ID')}). Kuota akan diperbarui besok.`
    );
  }
}

// ===================== Persona =====================

export async function getAllPersonas(userId: string, client?: PoolClient): Promise<UserPersonaRow[]> {
  return query<UserPersonaRow>(
    'SELECT * FROM user_personas WHERE user_id = $1 ORDER BY is_default DESC, updated_at DESC',
    [userId],
    client
  );
}

export async function getDefaultPersona(userId: string): Promise<UserPersonaRow | null> {
  const list = await getAllPersonas(userId);
  return list.find((p) => Boolean(p.is_default)) || list[0] || null;
}

// Mengembalikan persona milik pengguna; ID milik orang lain diperlakukan sebagai tidak ada
export async function getPersonaById(userId: string, id?: string | null): Promise<UserPersonaRow | null> {
  if (!id) return getDefaultPersona(userId);
  const found = await queryOne<UserPersonaRow>(
    'SELECT * FROM user_personas WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return found || getDefaultPersona(userId);
}

export function formatPersona(p: UserPersonaRow | null) {
  if (!p) return null;
  const { user_id: _omit, ...rest } = p;
  return { ...rest, is_default: Boolean(p.is_default) };
}

export async function resolveChatPersona(userId: string, chat: ChatRow): Promise<UserPersonaRow | null> {
  if (chat.persona_id) return getPersonaById(userId, chat.persona_id);
  if (chat.use_latest_persona || !chat.persona_snapshot) return getDefaultPersona(userId);
  try {
    return JSON.parse(chat.persona_snapshot) as UserPersonaRow;
  } catch {
    return getDefaultPersona(userId);
  }
}

// ===================== Kepemilikan Data =====================
// Setiap pengambilan berdasarkan ID wajib menyertakan user_id agar data pengguna lain tidak bisa diakses.

export async function getOwnedCharacter(userId: string, id: string, client?: PoolClient) {
  return queryOne<CharacterRow>('SELECT * FROM characters WHERE id = $1 AND user_id = $2', [id, userId], client);
}

export async function requireOwnedCharacter(userId: string, id: string, client?: PoolClient) {
  const row = await getOwnedCharacter(userId, id, client);
  if (!row) throw new HttpError(404, 'Karakter tidak ditemukan.');
  return row;
}

export async function requireOwnedChat(userId: string, id: string, client?: PoolClient) {
  const row = await queryOne<ChatRow>('SELECT * FROM chats WHERE id = $1 AND user_id = $2', [id, userId], client);
  if (!row) throw new HttpError(404, 'Percakapan tidak ditemukan.');
  return row;
}

// ===================== Karakter Publik =====================

export type VisibleCharacter = CharacterRow & {
  creator_name: string;
  world_name: string | null;
  is_owner: boolean;
};

/**
 * Mengambil karakter yang boleh dilihat pemanggil: miliknya sendiri, atau milik
 * siapa pun yang visibilitasnya 'public'. userId null berarti tamu tanpa akun.
 * Karakter privat milik orang lain tetap diperlakukan sebagai tidak ada (404).
 */
export async function getVisibleCharacter(
  userId: string | null,
  id: string,
  client?: PoolClient
): Promise<VisibleCharacter | null> {
  const row = await queryOne<CharacterRow & { creator_name: string; world_name: string | null }>(
    `SELECT c.*, u.display_name AS creator_name, w.name AS world_name
     FROM characters c
     JOIN users u ON u.id = c.user_id
     LEFT JOIN worlds w ON w.id = c.world_id
     WHERE c.id = $1 AND (c.visibility = 'public' OR c.user_id = $2)`,
    [id, userId],
    client
  );
  if (!row) return null;
  return { ...row, is_owner: Boolean(userId) && row.user_id === userId };
}

export async function requireVisibleCharacter(
  userId: string | null,
  id: string,
  client?: PoolClient
): Promise<VisibleCharacter> {
  const row = await getVisibleCharacter(userId, id, client);
  if (!row) throw new HttpError(404, 'Karakter tidak ditemukan.');
  return row;
}

/**
 * Definisi karakter yang dipakai sebuah percakapan. Snapshot dibuat saat percakapan
 * dimulai, jadi suntingan pemilik setelahnya tidak mengubah percakapan yang sudah
 * berjalan, dan percakapan tetap bisa dibaca walau karakter aslinya sudah dihapus.
 */
export async function resolveChatCharacter(
  chat: ChatRow,
  client?: PoolClient
): Promise<{ character: CharacterRow; isDeleted: boolean }> {
  const snapshot = chat.character_snapshot
    ? parseJsonSafe<CharacterRow | null>(chat.character_snapshot, null)
    : null;

  if (snapshot?.id) {
    // Karakter dianggap terhapus hanya jika tautannya sudah lepas
    return { character: snapshot, isDeleted: !chat.character_id };
  }

  // Percakapan lama (sebelum fitur snapshot) masih memakai definisi terbaru
  if (chat.character_id) {
    const live = await queryOne<CharacterRow>('SELECT * FROM characters WHERE id = $1', [chat.character_id], client);
    if (live) return { character: live, isDeleted: false };
  }

  throw new HttpError(410, 'Karakter percakapan ini sudah dihapus, jadi pesan baru tidak bisa dikirim.');
}

/**
 * Dipakai jalur yang MENGHASILKAN pesan baru (kirim, regenerate, swipe).
 * Berbeda dengan resolveChatCharacter yang hanya membaca: begitu karakternya
 * dihapus, percakapan menjadi arsip baca-saja dan permintaan ditolak 410.
 */
export async function requireLiveChatCharacter(chat: ChatRow, client?: PoolClient): Promise<CharacterRow> {
  const { character, isDeleted } = await resolveChatCharacter(chat, client);
  if (isDeleted) {
    throw new HttpError(410, 'Karakter percakapan ini sudah dihapus, jadi pesan baru tidak bisa dikirim.');
  }
  return character;
}

export async function requireOwnedMessage(userId: string, id: string, client?: PoolClient) {
  const row = await queryOne<MessageRow>(
    `SELECT m.* FROM messages m JOIN chats c ON c.id = m.chat_id WHERE m.id = $1 AND c.user_id = $2`,
    [id, userId],
    client
  );
  if (!row) throw new HttpError(404, 'Pesan tidak ditemukan.');
  return row;
}

export async function requireOwnedWorld(userId: string, id: string, client?: PoolClient) {
  const row = await queryOne<WorldRow>('SELECT * FROM worlds WHERE id = $1 AND user_id = $2', [id, userId], client);
  if (!row) throw new HttpError(404, 'Dunia tidak ditemukan.');
  return row;
}

export async function requireOwnedLore(userId: string, id: string, client?: PoolClient) {
  const row = await queryOne<LoreEntryRow>(
    `SELECT l.* FROM lore_entries l JOIN worlds w ON w.id = l.world_id WHERE l.id = $1 AND w.user_id = $2`,
    [id, userId],
    client
  );
  if (!row) throw new HttpError(404, 'Entri lore tidak ditemukan.');
  return row;
}

export async function requireOwnedGroupChat(userId: string, id: string, client?: PoolClient) {
  const row = await queryOne<GroupChatRow>(
    'SELECT * FROM group_chats WHERE id = $1 AND user_id = $2',
    [id, userId],
    client
  );
  if (!row) throw new HttpError(404, 'Grup chat tidak ditemukan.');
  return row;
}

// Validasi world_id opsional dari input: harus milik pengguna atau dikosongkan
export async function resolveOwnedWorldId(userId: string, worldId: unknown): Promise<string | null> {
  const id = worldId ? String(worldId).trim() : '';
  if (!id) return null;
  const world = await queryOne<{ id: string }>('SELECT id FROM worlds WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!world) throw new HttpError(400, 'Dunia yang dipilih tidak ditemukan.');
  return world.id;
}

// ===================== Audit Log =====================

export async function logAudit(params: {
  userId?: string | null;
  actorEmail?: string;
  action: string;
  detail?: string;
  ip?: string;
}) {
  await execute(
    `INSERT INTO audit_logs (user_id, actor_email, action, detail, ip) VALUES ($1, $2, $3, $4, $5)`,
    [params.userId || null, params.actorEmail || '', params.action, (params.detail || '').slice(0, 500), params.ip || '']
  ).catch((err) => console.error('[audit] gagal mencatat', err));
}

// ===================== Unggahan =====================

export async function registerUpload(filename: string, userId: string, sizeBytes: number) {
  await execute(
    `INSERT INTO uploads (filename, user_id, size_bytes) VALUES ($1, $2, $3)
     ON CONFLICT (filename) DO NOTHING`,
    [filename, userId, sizeBytes]
  );
}

export async function getUploadOwner(filename: string): Promise<string | null> {
  const row = await queryOne<{ user_id: string | null }>('SELECT user_id FROM uploads WHERE filename = $1', [filename]);
  return row?.user_id || null;
}
