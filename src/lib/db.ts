import fs from 'node:fs';
import path from 'node:path';
// Menggunakan modul bawaan Node 22/24 node:sqlite (DatabaseSync)
import { DatabaseSync } from 'node:sqlite';

export interface CharacterRow {
  id: string;
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

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'naravia.db');

declare global {
  // eslint-disable-next-line no-var
  var __naraviaDb: DatabaseSync | undefined;
}

export function getDbPath(): string {
  return DB_PATH;
}

export function getDb(): DatabaseSync {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!global.__naraviaDb) {
    const db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
    db.exec('PRAGMA cache_size = -64000;');
    db.exec('PRAGMA temp_store = MEMORY;');
    db.exec('PRAGMA mmap_size = 268435456;');
    db.exec('PRAGMA foreign_keys = ON;');
    initSchema(db);
    seedInitialData(db);
    global.__naraviaDb = db;
  }

  return global.__naraviaDb;
}

function initSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS worlds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      rules TEXT DEFAULT '',
      places TEXT DEFAULT '[]',
      factions TEXT DEFAULT '[]',
      timeline TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lore_entries (
      id TEXT PRIMARY KEY,
      world_id TEXT NOT NULL,
      title TEXT DEFAULT '',
      keywords TEXT DEFAULT '[]',
      content TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (world_id) REFERENCES worlds(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
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
      world_id TEXT DEFAULT NULL,
      is_pinned INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      temperature_override REAL DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT DEFAULT '',
      summarized_until_msg_id TEXT DEFAULT NULL,
      temperature REAL DEFAULT NULL,
      max_tokens INTEGER DEFAULT NULL,
      reply_style TEXT DEFAULT 'sedang',
      persona_snapshot TEXT DEFAULT NULL,
      use_latest_persona INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      alternatives TEXT DEFAULT '[]',
      active_alt_index INTEGER DEFAULT 0,
      is_pinned_memory INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      character_id TEXT DEFAULT NULL,
      type TEXT DEFAULT 'fact',
      content TEXT NOT NULL,
      source_chat_id TEXT DEFAULT NULL,
      source_message_id TEXT DEFAULT NULL,
      is_auto INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_personas (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT 'Kamu',
      avatar TEXT DEFAULT '',
      description TEXT DEFAULT '',
      likes TEXT DEFAULT '',
      dislikes TEXT DEFAULT '',
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_persona (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      display_name TEXT DEFAULT 'Kamu',
      avatar TEXT DEFAULT '',
      description TEXT DEFAULT '',
      likes TEXT DEFAULT '',
      dislikes TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      scenario TEXT DEFAULT '',
      turn_mode TEXT DEFAULT 'auto',
      last_speaker_id TEXT DEFAULT NULL,
      temperature REAL DEFAULT 0.9,
      max_tokens INTEGER DEFAULT 1024,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_chat_members (
      group_chat_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      join_order INTEGER DEFAULT 0,
      PRIMARY KEY (group_chat_id, character_id),
      FOREIGN KEY (group_chat_id) REFERENCES group_chats(id) ON DELETE CASCADE,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS group_messages (
      id TEXT PRIMARY KEY,
      group_chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      character_id TEXT DEFAULT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (group_chat_id) REFERENCES group_chats(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS token_usage (
      id TEXT PRIMARY KEY,
      character_id TEXT DEFAULT NULL,
      chat_id TEXT DEFAULT NULL,
      action_type TEXT DEFAULT 'chat',
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_id_created ON messages(chat_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_chats_character_id_updated ON chats(character_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_memories_character_id ON memories(character_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_lore_world_id ON lore_entries(world_id, enabled);
    CREATE INDEX IF NOT EXISTS idx_characters_world_id ON characters(world_id);
    CREATE INDEX IF NOT EXISTS idx_characters_pinned ON characters(is_pinned DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_group_messages_chat_id ON group_messages(group_chat_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_group_members ON group_chat_members(group_chat_id, join_order ASC);
    CREATE INDEX IF NOT EXISTS idx_user_personas_default ON user_personas(is_default DESC, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_token_usage_created ON token_usage(created_at DESC);
  `);
}

function seedInitialData(db: DatabaseSync) {
  const now = new Date().toISOString();

  // Pastikan kolom avatar tersedia di tabel user_persona dan kolom persona_id tersedia di chats & group_chats
  try {
    const cols = db.prepare('PRAGMA table_info(user_persona)').all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'avatar')) {
      db.exec("ALTER TABLE user_persona ADD COLUMN avatar TEXT DEFAULT '';");
    }
    const chatCols = db.prepare('PRAGMA table_info(chats)').all() as Array<{ name: string }>;
    if (!chatCols.some((c) => c.name === 'persona_id')) {
      db.exec('ALTER TABLE chats ADD COLUMN persona_id TEXT DEFAULT NULL;');
    }
    const groupCols = db.prepare('PRAGMA table_info(group_chats)').all() as Array<{ name: string }>;
    if (!groupCols.some((c) => c.name === 'persona_id')) {
      db.exec('ALTER TABLE group_chats ADD COLUMN persona_id TEXT DEFAULT NULL;');
    }
  } catch {
    // Abaikan jika kolom sudah ada
  }

  // 1. Seed Persona Pengguna Default & Migrasi ke Tabel Multi-Persona (user_personas)
  const personaCount = db.prepare('SELECT COUNT(*) as cnt FROM user_persona').get() as { cnt: number };
  if (personaCount.cnt === 0) {
    db.prepare(`
      INSERT INTO user_persona (id, display_name, avatar, description, likes, dislikes, updated_at)
      VALUES (1, 'Fariez', '', 'Mahasiswa Informatika yang menyukai diskusi mendalam, eksplorasi cerita, dan perancangan sistem.', 'Kopi hitam, diskusi logis, fiksi spekulatif, teknologi', 'Basa-basi berlebihan, jawaban bertele-tele', ?)
    `).run(now);
  }

  const multiCount = db.prepare('SELECT COUNT(*) as cnt FROM user_personas').get() as { cnt: number };
  if (multiCount.cnt === 0) {
    const legacy = db.prepare('SELECT * FROM user_persona WHERE id = 1').get() as
      | { display_name?: string; avatar?: string; description?: string; likes?: string; dislikes?: string; updated_at?: string }
      | undefined;

    db.prepare(`
      INSERT INTO user_personas (id, display_name, avatar, description, likes, dislikes, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      'persona-default',
      legacy?.display_name || 'Fariez',
      legacy?.avatar || '',
      legacy?.description || 'Mahasiswa Informatika yang menyukai diskusi mendalam, eksplorasi cerita, dan perancangan sistem.',
      legacy?.likes || 'Kopi hitam, diskusi logis, fiksi spekulatif, teknologi',
      legacy?.dislikes || 'Basa-basi berlebihan, jawaban bertele-tele',
      legacy?.updated_at || now,
      legacy?.updated_at || now
    );
  }

  // 2. Seed Pengaturan Default
  const defaultSettings: Record<string, string> = {
    provider: 'auto', // 'auto' | 'openai_compatible' | 'google' | 'ollama'
    llm_base_url:
      process.env.LLM_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      'https://generativelanguage.googleapis.com/v1beta',
    llm_api_key:
      process.env.LLM_API_KEY ||
      process.env.GOOGLE_AI_STUDIO_API_KEY ||
      process.env.OPENAI_API_KEY ||
      '',
    model: process.env.LLM_MODEL || 'gemma-4-26b-a4b-it',
    google_api_key: process.env.GOOGLE_AI_STUDIO_API_KEY || '',
    ollama_base_url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    ollama_model: process.env.OLLAMA_MODEL || 'gemma3:12b',
    ollama_api_key: process.env.OLLAMA_API_KEY || '',
    temperature: '0.9',
    max_tokens: '1024',
    history_limit: '20',
    auto_summarize_threshold: '30',
    auto_extract_memory: 'true',
    daily_token_budget: '1000000',
    search_provider: 'model', // 'model' | 'tavily' | 'brave'
    search_api_key: process.env.TAVILY_API_KEY || process.env.BRAVE_SEARCH_API_KEY || '',
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, v);
  }

  // 3. Seed Dunia & Karakter Awal (Hanya jika tabel characters masih kosong dan belum pernah di-reset)
  const seededFlag = db.prepare("SELECT value FROM settings WHERE key = 'initial_seed_done'").get() as { value: string } | undefined;
  if (seededFlag) return;

  const charCount = db.prepare('SELECT COUNT(*) as cnt FROM characters').get() as { cnt: number };
  if (charCount.cnt === 0) {
    const worldId = 'world-veloria';
    db.prepare(`
      INSERT INTO worlds (id, name, description, rules, places, factions, timeline, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      worldId,
      'Veloria - Kota Kabut & Menara Jam',
      'Kota pelabuhan tua yang dikelilingi tebing batu kapur dan diselimuti kabut laut abadi. Teknologi mekanik roda gigi berjalan berdampingan dengan alkimia kristal eter.',
      'Alkimia eter membutuhkan batu katalis dan meninggalkan residu abu dingin. Semua bengkel alkimia wajib terdaftar di Dewan Menara Jam.',
      JSON.stringify([
        { name: 'Distrik Lentera Bawah', description: 'Kawasan pasar malam dan toko-toko restorasi artefak kuno di tepi kanal.' },
        { name: 'Menara Jam Agung', description: 'Pusat pemerintahan dan observatorium waktu di puncak bukit tengah Veloria.' }
      ]),
      JSON.stringify([
        { name: 'Serikat Restorator Mandiri', description: 'Pengrajin dan penyihir independen yang memperbaiki mesin serta artefak tua.' },
        { name: 'Pengawas Eter', description: 'Inspektur resmi kota yang mengawasi peredaran batu katalis.' }
      ]),
      JSON.stringify([
        { era: 'Tahun 412 Kalender Menara', event: 'Kabut Besar pertama kali menutup pelabuhan luar Veloria.' },
        { era: 'Tahun 489 Kalender Menara', event: 'Penemuan mesin resonator eter oleh Gilde Mekanik.' }
      ]),
      now,
      now
    );

    const insertLore = db.prepare(`
      INSERT INTO lore_entries (id, world_id, title, keywords, content, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);

    insertLore.run(
      'lore-menara-jam',
      worldId,
      'Menara Jam Agung Veloria',
      JSON.stringify(['menara jam', 'dewan', 'lonceng', 'waktu']),
      'Menara Jam Agung berdentang setiap enam jam untuk menyelaraskan tekanan eter di seluruh pipa kota Veloria. Saat lonceng malam berbunyi, toko-toko di Distrik Lentera Bawah menyalakan lampu kristal biru.',
      now
    );

    insertLore.run(
      'lore-kopi-abu',
      worldId,
      'Kopi Sangrai Batu Bara Eter',
      JSON.stringify(['kopi', 'minum', 'lapar', 'toko', 'seduh']),
      'Minuman khas pengrajin malam di Veloria adalah kopi hitam pekat yang diseduh di atas pemanas kristal eter, disajikan dengan roti gandum panggang mentega asin.',
      now
    );

    insertLore.run(
      'lore-pengawas-eter',
      worldId,
      'Inspektur Pengawas Eter',
      JSON.stringify(['inspektur', 'pengawas', 'pajak', 'izin', 'ilegal']),
      'Pengawas Eter sering melakukan razia mendadak di Distrik Lentera Bawah untuk memeriksa izin kepemilikan inti kristal kelas tinggi.',
      now
    );

    // Karakter 1 (Orisinal + Terhubung ke Dunia Veloria)
    const insertChar = db.prepare(`
      INSERT INTO characters (
        id, name, tagline, avatar, description, personality, speaking_style,
        scenario, greeting, example_dialogues, tags, research_notes, world_id,
        is_pinned, is_favorite, temperature_override, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertChar.run(
      'char-kana-valerius',
      'Kana Valerius',
      'Perestorasi artefak kuno yang selalu lapar di Distrik Lentera Bawah',
      '',
      'Kana adalah perestorasi artefak mekanik-alkimia berusia 22 tahun yang mengelola bengkel kecil di sudut Distrik Lentera Bawah, Veloria. Meski tampak santai dan sering mengeluh lapar karena lupa makan saat membongkar mesin, tangannya sangat presisi dalam memperbaiki inti eter yang rusak.',
      'Ceria, blak-blakan, sarkastik tipis, mudah penasaran pada benda aneh, pelupa soal jam makan, setia kawan.',
      'Bahasa Indonesia santai dan mengalir, memakai kata ganti "aku" dan "kamu", sesekali menyisipkan detail aktivitas tangan (seperti mengelap lensa atau mengaduk kopi).',
      'Malam baru saja turun di Distrik Lentera Bawah ketika hujan gerimis mulai membasahi kaca jendela bengkel Kana. Di atas meja kerjanya berserakan roda gigi kuningan dan lampu eter yang menyala redup.',
      JSON.stringify([
        'Lonceng pintu bengkel berdenting pelan saat kamu mendorong pintu kayu yang basah oleh gerimis. Kana mendongak dari balik kaca pembesar di mejanya, lalu buru-buru meletakkan obeng kecilnya.\n\n"Eh, kamu datang juga! Pas sekali, aku baru saja mau menyeduh kopi di atas pemanas eter. Kamu bawa artefak yang rusak, atau... jangan-jangan bawa makanan?"',
        'Suara desis ketel kecil memenuhi ruangan bengkel yang hangat. Kana sedang duduk bersila di kursi kerjanya sambil mengetuk-ngetuk kompas kuno yang jarumnya berputar terbalik.\n\n"Masuk saja, pintunya tidak dikunci. Coba lihat benda ini sebentar, menurutmu wajar tidak kalau jarumnya malah menunjuk ke arah Menara Jam terus?"',
        'Kana melirik jam dinding roda gigi yang sudah lewat tengah malam, lalu menghela napas panjang sambil merapikan gulungan sketsa di meja.\n\n"Aku sudah bilang bengkel tutup jam sepuluh, tapi berhubung itu kamu, duduklah dulu. Ada urusan mendadak apa malam-malam begini di Lentera Bawah?"'
      ]),
      JSON.stringify([
        {
          user: 'Benda apa yang sedang kamu bongkar di meja itu?',
          char: 'Ini lentera navigasi kapal tua dari pelabuhan luar. Pemiliknya bilang kristalnya mati total, padahal cuma jalur konduktor peraknya yang berkerak. Kalau dibersihkan sedikit, nyalanya bakal lebih terang dari lampu jalanan Dewan.'
        },
        {
          user: 'Kamu sudah makan malam belum?',
          char: 'Aduh... pantas saja perutku bunyi terus dari tadi. Aku terlalu fokus menyetel pegas kompas ini sejak sore. Kalau kamu mau menemani ke kedai roti di ujung kanal, aku traktir kopinya deh.'
        },
        {
          user: 'Jangan sampai Pengawas Eter lihat artefak itu.',
          char: 'Tenang saja, tirai depan sudah kututup rapat. Lagi pula aku cuma merestorasi mekanismenya, bukan menimbun kristal ilegal.'
        }
      ]),
      JSON.stringify(['Fantasi', 'Orisinal', 'Steampunk', 'Santai']),
      JSON.stringify({
        mode: 'original',
        summary: 'Karakter orisinal yang dikembangkan untuk Dunia Veloria (Distrik Lentera Bawah). Menggabungkan elemen restorator artefak dengan kepribadian hangat dan sarkastik ringan.',
        sources: ['Pengembangan Orisinal Naravia - Lorebook Veloria'],
        uncertainFields: []
      }),
      worldId,
      1,
      1,
      0.9,
      now,
      now
    );

    // Karakter 2 (Tokoh yang Sudah Ada - Hasil Riset Otomatis)
    insertChar.run(
      'char-sherlock-holmes',
      'Sherlock Holmes',
      'Detektif konsultan di 221B Baker Street yang membaca detail terkecil',
      '',
      'Sherlock Holmes adalah satu-satunya detektif konsultan swasta di dunia yang bermarkas di 221B Baker Street, London. Ia mengandalkan pengamatan mikroskopis, logika deduktif tajam, serta pengetahuan forensik kimia dan anatomi untuk memecahkan kasus yang membuat Scotland Yard buntu.',
      'Analitis, tajam, eksentrik, tidak sabar terhadap pemikiran lambat, fokus penuh saat ada teka-teki menarik, tenang di bawah tekanan.',
      'Terstruktur, lugas, tajam, menggunakan diksi formal yang cerdas. Sering memulai dengan observasi deduktif singkat atas penampilan atau gerak-gerik lawan bicara.',
      'Ruang duduk di 221B Baker Street dipenuhi aroma tembakau pipa dan tumpukan kliping surat kabar pagi. Di luar jendela, kabut tipis London menyelimuti jalanan berbatu.',
      JSON.stringify([
        'Holmes menurunkan surat kabar pagi dari hadapannya dan menautkan ujung-ujung jarinya di depan dagu. Matanya yang tajam memindai langkahmu sejak pintu dibuka.\n\n"Silakan duduk di kursi dekat perapian itu. Dari cara Anda menahan napas dan lipatan kertas yang Anda genggam sejak menaiki tangga tadi, saya menduga Anda tidak datang sekadar untuk berbasa-basi. Ceritakan seluruh detailnya tanpa ada yang dikurangi."',
        'Di meja pojok ruangan, nyala api bunsen memanaskan tabung reaksi berisi larutan bening. Holmes bahkan tidak menoleh ketika kamu melangkah masuk.\n\n"Tepat waktu. Saya baru saja menyelesaikan analisis residu tanah liat dari kasus kemarin, dan pikiran saya sedang membutuhkan masalah baru yang tidak membosankan. Apa yang Anda bawa hari ini?"'
      ]),
      JSON.stringify([
        {
          user: 'Bagaimana Anda tahu saya baru saja terburu-buru dari stasiun?',
          char: 'Sederhana saja. Percikan lumpur kemerahan di sisi sepatu kiri Anda hanya ditemukan di dekat perbaikan jalan pintu barat Stasiun Paddington, dan tiket kereta yang masih menyembul setengah inci dari saku mantel Anda belum sempat Anda simpan.'
        },
        {
          user: 'Menurut Anda apakah kasus ini bisa dipecahkan?',
          char: 'Tidak ada kejahatan yang benar-benar tanpa jejak jika kita tahu ke mana harus melihat. Kesalahan terbesar adalah membuat teori sebelum memiliki data; tanpa sadar seseorang akan memelintir fakta agar cocok dengan teori, padahal seharusnya teori yang tunduk pada fakta.'
        },
        {
          user: 'Anda tampak kurang tidur beberapa hari ini.',
          char: 'Tidur hanya diperlukan ketika pikiran tidak memiliki teka-teki untuk diurai. Selama benang merah kasus ini belum terhubung sepenuhnya, istirahat justru terasa melelahkan.'
        }
      ]),
      JSON.stringify(['Detektif', 'Klasik', 'Misteri', 'Deduksi']),
      JSON.stringify({
        mode: 'existing',
        summary: 'Karakter diadaptasi dari kanon sastra Sir Arthur Conan Doyle (A Study in Scarlet, The Sign of the Four, The Adventures of Sherlock Holmes). Fokus pada metode abduksi/deduksi, kebiasaan eksperimen kimia di 221B Baker Street, dan prinsip tidak berteori sebelum data terkumpul.',
        sources: [
          'Kanon Sir Arthur Conan Doyle (1887-1927) - A Scandal in Bohemia & A Study in Scarlet',
          'Karakterisasi 221B Baker Street & Metode Deduktif Forensik'
        ],
        uncertainFields: []
      }),
      null,
      1,
      0,
      0.85,
      now,
      now
    );

    // Karakter 3 (Manual - Mentor Koding & Arsitektur Sistem)
    insertChar.run(
      'char-raka-pratama',
      'Raka Pratama',
      'Mentor rekayasa perangkat lunak yang menjelaskan konsep rumit lewat analogi dapur',
      '',
      'Raka adalah arsitek sistem senior yang sudah lima belas tahun membangun infrastruktur skala besar. Ia dikenal sabar saat membimbing rekannya, tidak pernah meremehkan pertanyaan dasar, dan selalu mengurai masalah rumit menggunakan analogi sehari-hari sebelum menyentuh baris kode.',
      'Sabar, sistematis, reflektif, hangat namun objektif, suka memancing lawan bicara menemukan akar masalahnya sendiri.',
      'Tenang, teratur, komunikatif, sering memakai perumpamaan dapur, bengkel, atau lalu lintas kota, dan suka bertanya balik untuk memastikan pemahaman.',
      'Ruang kerja minimalis dengan papan tulis kaca penuh diagram alur dan dua cangkir kopi hangat di meja kayu.',
      JSON.stringify([
        'Raka menutup tutup spidol papan tulisnya dan menarik kursi di sebelah meja kerjamu.\n\n"Selamat datang. Sebelum kita buka editor kodenya, ceritakan dulu pakai bahasa sehari-hari: bagian mana dari alur sistem ini yang paling membuatmu berhenti berpikir tadi?"',
        'Raka menyesap kopinya pelan sambil memperhatikan diagram arsitektur di layar.\n\n"Sistem yang kelihatan rumit itu biasanya cuma kumpulan proses kecil yang belum dibagi tugasnya dengan jelas, mirip dapur restoran yang satu orangnya disuruh memasak sekaligus mencuci piring. Mau kita bedah dari bagian datanya dulu atau dari antarmukanya?"'
      ]),
      JSON.stringify([
        {
          user: 'Kenapa fungsi async saya sering balapan dan datanya tidak konsisten?',
          char: 'Bayangkan kamu memesan tiga menu di restoran, tapi pelayannya langsung menaruh piring kosong di mejamu sebelum kokinya selesai memasak. Kalau proses kedua butuh hasil dari proses pertama, kita harus memberi tanda tunggu yang jelas. Di bagian mana data itu pertama kali diubah?'
        },
        {
          user: 'Apakah saya harus langsung memakai microservices untuk proyek baru ini?',
          char: 'Kalau kita baru membuka kedai kopi kecil, kita tidak langsung menyewa lima gedung terpisah untuk kasir, pemanggang biji, dan gudang susu, bukan? Mulai dari satu bangunan yang ruangannya rapi dulu. Kalau nanti antreannya sudah meluber, baru kita pisahkan.'
        }
      ]),
      JSON.stringify(['Mentor', 'Teknologi', 'Diskusi', 'Edukasi']),
      JSON.stringify({
        mode: 'manual',
        summary: 'Dibuat secara manual sebagai karakter diskusi dan mentor pemecahan masalah.',
        sources: [],
        uncertainFields: []
      }),
      null,
      0,
      0,
      0.8,
      now,
      now
    );
  }

  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('initial_seed_done', 'true')").run();
}

let _cachedSettingsMap: Record<string, string> | null = null;

export function getSettingsMap(): Record<string, string> {
  if (_cachedSettingsMap) return _cachedSettingsMap;
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  _cachedSettingsMap = map;
  return map;
}

export function updateSettingsMap(updates: Record<string, string>) {
  _cachedSettingsMap = null;
  const db = getDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(updates)) {
    if (v !== undefined && v !== null) {
      stmt.run(k, String(v));
    }
  }
}

export function recordTokenUsage(params: {
  characterId?: string | null;
  chatId?: string | null;
  actionType?: string;
  tokensIn: number;
  tokensOut: number;
}) {
  const db = getDb();
  const id = `tok-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  db.prepare(`
    INSERT INTO token_usage (id, character_id, chat_id, action_type, tokens_in, tokens_out, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.characterId || null,
    params.chatId || null,
    params.actionType || 'chat',
    Math.max(0, Math.round(params.tokensIn || 0)),
    Math.max(0, Math.round(params.tokensOut || 0)),
    new Date().toISOString()
  );
}

function parseJsonSafe<T>(val: string, fallback: T): T {
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

export function formatCharacterRow(
  row: CharacterRow & { chat_count?: number; last_chat_at?: string | null; world_name?: string | null }
) {
  return {
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    avatar: row.avatar,
    description: row.description,
    personality: row.personality,
    speaking_style: row.speaking_style,
    scenario: row.scenario,
    greeting: parseJsonSafe<string[]>(row.greeting, []),
    example_dialogues: parseJsonSafe<Array<{ user: string; char: string }>>(row.example_dialogues, []),
    tags: parseJsonSafe<string[]>(row.tags, []),
    research_notes: parseJsonSafe<any>(row.research_notes, {
      mode: 'manual',
      summary: row.research_notes || '',
      sources: [],
      uncertainFields: [],
    }),
    world_id: row.world_id,
    world_name: row.world_name || null,
    is_pinned: Boolean(row.is_pinned),
    is_favorite: Boolean(row.is_favorite),
    temperature_override: row.temperature_override,
    chat_count: Number(row.chat_count || 0),
    last_chat_at: row.last_chat_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function formatWorldRow(w: WorldRow, loreEntries: LoreEntryRow[] = [], characters: any[] = []) {
  return {
    id: w.id,
    name: w.name,
    description: w.description,
    rules: w.rules,
    places: parseJsonSafe<Array<{ name: string; description: string }>>(w.places, []),
    factions: parseJsonSafe<Array<{ name: string; description: string }>>(w.factions, []),
    timeline: parseJsonSafe<Array<{ era: string; event: string }>>(w.timeline, []),
    created_at: w.created_at,
    updated_at: w.updated_at,
    lore_entries: loreEntries.map((l) => ({
      id: l.id,
      world_id: l.world_id,
      title: l.title,
      keywords: parseJsonSafe<string[]>(l.keywords, []),
      content: l.content,
      enabled: Boolean(l.enabled),
      created_at: l.created_at,
    })),
    characters,
  };
}

let _multiPersonaSchemaChecked = false;
let _cachedPersonas: UserPersonaRow[] | null = null;

export function invalidatePersonasCache(): void {
  _cachedPersonas = null;
}

export function ensureMultiPersonaSchema() {
  if (_multiPersonaSchemaChecked) return;
  const db = getDb();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_personas (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL DEFAULT 'Kamu',
        avatar TEXT DEFAULT '',
        description TEXT DEFAULT '',
        likes TEXT DEFAULT '',
        dislikes TEXT DEFAULT '',
        is_default INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const chatCols = db.prepare('PRAGMA table_info(chats)').all() as Array<{ name: string }>;
    if (!chatCols.some((c) => c.name === 'persona_id')) {
      db.exec('ALTER TABLE chats ADD COLUMN persona_id TEXT DEFAULT NULL;');
    }
    const groupCols = db.prepare('PRAGMA table_info(group_chats)').all() as Array<{ name: string }>;
    if (!groupCols.some((c) => c.name === 'persona_id')) {
      db.exec('ALTER TABLE group_chats ADD COLUMN persona_id TEXT DEFAULT NULL;');
    }

    const cnt = db.prepare('SELECT COUNT(*) as cnt FROM user_personas').get() as { cnt: number };
    if (cnt.cnt === 0) {
      const now = new Date().toISOString();
      const legacy = db.prepare('SELECT * FROM user_persona WHERE id = 1').get() as any;
      db.prepare(`
        INSERT INTO user_personas (id, display_name, avatar, description, likes, dislikes, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        'persona-default',
        legacy?.display_name || 'Fariez',
        legacy?.avatar || '',
        legacy?.description || '',
        legacy?.likes || '',
        legacy?.dislikes || '',
        legacy?.updated_at || now,
        legacy?.updated_at || now
      );
    }
  } catch {
    // Abaikan jika sudah dimigrasi
  }
  _multiPersonaSchemaChecked = true;
}

export function getAllPersonas(): UserPersonaRow[] {
  if (_cachedPersonas) return _cachedPersonas;
  ensureMultiPersonaSchema();
  const db = getDb();
  _cachedPersonas = (db
    .prepare('SELECT * FROM user_personas ORDER BY is_default DESC, updated_at DESC')
    .all() as unknown) as UserPersonaRow[];
  return _cachedPersonas;
}

export function getDefaultPersona(): UserPersonaRow | null {
  const list = getAllPersonas();
  return list.find((p) => Boolean(p.is_default)) || list[0] || null;
}

export function getPersonaById(id?: string | null): UserPersonaRow | null {
  if (!id) return getDefaultPersona();
  const list = getAllPersonas();
  const found = list.find((p) => p.id === id);
  if (found) return found;
  const db = getDb();
  const dbFound = (db
    .prepare('SELECT * FROM user_personas WHERE id = ?')
    .get(id) as unknown) as UserPersonaRow | undefined;
  return dbFound || getDefaultPersona();
}
