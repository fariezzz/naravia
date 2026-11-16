#!/usr/bin/env node
// Membuat akun admin baru, atau menjadikan akun yang sudah ada sebagai admin.
//
// Pemakaian:
//   node --env-file=.env.local scripts/create-admin.mjs --email admin@contoh.com --name "Admin"
// Kata sandi diminta secara interaktif (tidak ditampilkan, tidak tersimpan di riwayat shell).
// Untuk otomasi, kata sandi bisa diberikan lewat variabel lingkungan ADMIN_PASSWORD.
import { randomBytes, scrypt } from 'node:crypto';
import readline from 'node:readline';
import pg from 'pg';
import { MIGRATIONS_SQL, SCHEMA_SQL } from '../src/lib/schema.mjs';

function parseArgs(argv) {
  const args = { email: '', name: 'Admin' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--email') args.email = String(argv[++i] || '').trim().toLowerCase();
    else if (argv[i] === '--name') args.name = String(argv[++i] || '').trim() || 'Admin';
  }
  return args;
}

// Format hash harus identik dengan src/lib/password.ts
function hashPassword(password) {
  const cost = 16384;
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: cost, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => {
      if (err) reject(err);
      else resolve(`scrypt$${cost}$${salt.toString('base64')}$${key.toString('base64')}`);
    });
  });
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (str) => {
      if (str.includes(question)) rl.output.write(str);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`;
}

async function main() {
  const { email, name } = parseArgs(process.argv.slice(2));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Wajib menyertakan --email dengan format yang valid.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL belum diatur. Jalankan dengan: node --env-file=.env.local ...');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(SCHEMA_SQL);
    await pool.query(MIGRATIONS_SQL);
    const existing = await pool.query('SELECT id, role FROM users WHERE email = $1', [email]);

    if (existing.rows[0]) {
      await pool.query("UPDATE users SET role = 'admin', is_active = 1, updated_at = now() WHERE id = $1", [existing.rows[0].id]);
      console.log(`Akun ${email} sekarang berperan sebagai admin.`);
      return;
    }

    const password = process.env.ADMIN_PASSWORD || (await promptHidden('Kata sandi admin baru: '));
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      console.error('Kata sandi minimal 8 karakter dan harus mengandung huruf serta angka.');
      process.exitCode = 1;
      return;
    }

    const userId = newId('user');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (id, email, password_hash, display_name, role) VALUES ($1, $2, $3, $4, 'admin')`,
        [userId, email, await hashPassword(password), name]
      );
      await client.query(
        'INSERT INTO user_personas (id, user_id, display_name, is_default) VALUES ($1, $2, $3, 1)',
        [newId('persona'), userId, name]
      );
      await client.query(
        "INSERT INTO audit_logs (user_id, actor_email, action, detail) VALUES ($1, $2, 'admin_buat_akun', 'via CLI')",
        [userId, email]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    console.log(`Akun admin ${email} berhasil dibuat.`);
  } catch (err) {
    console.error('Gagal membuat admin:', err.message || err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
