# Naravia

Platform percakapan dan roleplay karakter AI multi-pengguna berbasis **Next.js 15 (App Router)**, **React 19**, dan **PostgreSQL**. Setiap pengguna punya akun sendiri, dan seluruh karakter, percakapan, persona, dunia, serta memori bersifat privat per akun.

---

## Fitur Utama

- **Akun & Sesi Per Pengguna**: daftar, masuk, keluar, ganti kata sandi, keluar dari perangkat lain. Kata sandi di-hash dengan scrypt, sesi disimpan di PostgreSQL (cookie `httpOnly`, `secure` di produksi).
- **Isolasi Data**: setiap query disaring berdasarkan pemilik. ID milik akun lain selalu dibalas 404.
- **Peran Admin**: Panel Admin (`/admin`) untuk mengelola pengguna (buat, ubah peran, nonaktifkan, reset kata sandi, cabut sesi, hapus), mengatur provider AI dan kunci API global, membuka atau menutup pendaftaran, mengatur kuota token, serta melihat statistik dan log audit. Isi percakapan pengguna tidak ditampilkan ke admin.
- **Kuota Token Harian**: ditegakkan di server, bukan hanya ditampilkan. Bisa diatur bawaan sistem atau per akun. Admin tidak dibatasi.
- **Pembatas Laju**: percobaan masuk, pendaftaran, panggilan model AI, riset, dan unggahan dibatasi per IP atau akun.
- **Dukungan Universal LLM**: OpenAI-compatible (OpenRouter, Groq, DeepSeek, 9Router, Ollama, dll.) dan Google AI Studio, dengan model riset terpisah opsional.
- **Percakapan**: streaming balasan dengan tombol berhenti, swipe/regenerate, multi-persona, grup chat multi-karakter, lorebook, memori jangka panjang, judul chat otomatis, dan dark mode.
- **Pembuat & Pengimpor Karakter**: riset otomatis berbasis AI/web dan impor kartu SillyTavern (PNG/JSON).
- **Ekspor Data**: setiap pengguna bisa mengunduh seluruh datanya dalam format JSON.

---

## Struktur Direktori

```
naravia/
├── public/uploads/        # File avatar karakter dan persona
├── scripts/               # CLI: create-admin.mjs, migrate-sqlite-to-postgres.mjs
├── src/
│   ├── app/
│   │   ├── api/           # Endpoint backend (auth, admin, characters, chats, messages, dll.)
│   │   ├── admin/         # Panel Admin (khusus peran admin)
│   │   ├── login/, register/
│   │   ├── characters/, chat/[id]/, groups/, worlds/, settings/
│   ├── components/        # Komponen UI (Navbar, AuthForm, AccountPanel, admin/*, dll.)
│   ├── lib/               # db (pool PostgreSQL), schema.mjs, auth, store, llm, rateLimit, dll.
│   └── middleware.ts      # Pengalihan halaman tanpa sesi ke /login
├── Dockerfile
├── docker-compose.yml     # Service db (PostgreSQL 16) + naravia
└── PANDUAN_DEPLOY_PROXMOX.md
```

---

## Kebutuhan Sistem

- **Node.js** 22 atau lebih baru.
- **PostgreSQL** 14 atau lebih baru (atau jalankan lewat Docker Compose).

---

## Menjalankan Secara Lokal

```bash
npm install
cp .env.local.example .env.local
# Isi DATABASE_URL di .env.local
npm run dev
```

Buka `http://localhost:3000`. Tabel database dibuat otomatis saat koneksi pertama. **Akun pertama yang mendaftar otomatis menjadi admin.** Admin juga bisa dibuat lewat `ADMIN_EMAIL` + `ADMIN_PASSWORD` di `.env.local`, atau lewat CLI:

```bash
node --env-file=.env.local scripts/create-admin.mjs --email admin@contoh.com --name "Admin"
```

---

## Migrasi dari Versi SQLite Lama

Data lama di `data/naravia.db` bisa dipindahkan menjadi milik satu akun (biasanya akun admin):

```bash
# 1. Buat akun tujuan dulu (daftar lewat web atau create-admin.mjs)
# 2. Uji tanpa menyimpan
node --env-file=.env.local scripts/migrate-sqlite-to-postgres.mjs --email admin@contoh.com --dry-run
# 3. Jalankan sungguhan
node --env-file=.env.local scripts/migrate-sqlite-to-postgres.mjs --email admin@contoh.com
```

Setelan provider AI lama menjadi setelan sistem, parameter percakapan menjadi setelan pribadi akun tersebut. Skrip aman dijalankan ulang karena baris yang sudah ada dilewati.

---

## Deployment dengan Docker Compose

```bash
cp .env.local.example .env
# Isi POSTGRES_PASSWORD dan (opsional) ADMIN_EMAIL/ADMIN_PASSWORD di .env
docker compose up -d --build
```

Compose menjalankan dua service: `db` (PostgreSQL 16, volume `naravia-pgdata`, port tidak dibuka ke luar) dan `naravia` (aplikasi di port 3000). Unggahan avatar disimpan di `./public/uploads`.

Migrasi data SQLite lama di dalam container:

```bash
docker compose exec naravia node scripts/migrate-sqlite-to-postgres.mjs --email admin@contoh.com
```

Cadangan database:

```bash
docker compose exec db pg_dump -U naravia naravia > naravia-$(date +%F).sql
```

Panduan Proxmox LXC dan Cloudflare Tunnel ada di [PANDUAN_DEPLOY_PROXMOX.md](./PANDUAN_DEPLOY_PROXMOX.md).

---

## Catatan Keamanan Produksi

- Selalu akses lewat **HTTPS** (misalnya Cloudflare Tunnel). Cookie sesi hanya dikirim lewat HTTPS saat `NODE_ENV=production`.
- Tutup pendaftaran (`REGISTRATION_MODE=closed` atau dari Panel Admin) jika aplikasi hanya untuk orang tertentu, agar kuota API provider tidak dipakai orang asing.
- Kosongkan kembali `ADMIN_PASSWORD` di file environment setelah akun admin dibuat.
- Pembatas laju disimpan di memori, cukup untuk satu instance server. Untuk banyak instance, pindahkan ke Redis.
