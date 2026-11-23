# Naravia

Platform percakapan dan roleplay karakter AI multi-pengguna berbasis **Next.js 15 (App Router)**, **React 19**, dan **PostgreSQL**. Setiap pengguna punya akun sendiri. Karakter, percakapan, persona, dunia, dan memori bersifat privat per akun, kecuali karakter yang sengaja diterbitkan pemiliknya.

---

## Fitur Utama

### Akun dan Keamanan

- **Akun & Sesi Per Pengguna**: daftar, masuk, keluar, ganti kata sandi, keluar dari perangkat lain. Kata sandi di-hash dengan scrypt, sesi disimpan di PostgreSQL (cookie `httpOnly`, `secure` di produksi).
- **Isolasi Data**: setiap query disaring berdasarkan pemilik. ID milik akun lain selalu dibalas 404, bukan 403, agar keberadaan datanya tidak terbocorkan.
- **Peran Admin**: Panel Admin (`/admin`) untuk mengelola pengguna (buat, ubah peran, nonaktifkan, reset kata sandi, cabut sesi, hapus), mengatur provider AI dan kunci API global, membuka atau menutup pendaftaran, mengatur kuota token, serta melihat statistik dan log audit. Isi percakapan pengguna tidak pernah ditampilkan ke admin.
- **Kuota Token Harian**: ditegakkan di server, bukan hanya ditampilkan. Bisa diatur bawaan sistem atau per akun. Admin tidak dibatasi.
- **Pembatas Laju**: percobaan masuk, pendaftaran, panggilan model AI, riset, dan unggahan dibatasi per IP atau akun.
- **Otorisasi File Per Berkas**: avatar karakter publik bisa dimuat siapa pun, avatar privat hanya oleh pemiliknya (dan arsip percakapan terkait). Berkas disimpan di `data/uploads/` (di luar `public/`) sehingga 100% permintaan wajib melewati route otorisasi `/uploads/*`.
- **Enkripsi API Key & Manajemen Sesi Perangkat**: kunci API di `system_settings` otomatis dienkripsi dengan AES-256-GCM bila `SETTINGS_ENCRYPTION_KEY` diisi, sesi kedaluwarsa dibersihkan berkala, dan pengguna bisa melihat serta mencabut sesi per perangkat di Pengaturan Akun.

### Karakter

- **Pembuat & Pengimpor Karakter**: riset otomatis berbasis AI atau pencarian web, dan impor kartu SillyTavern (PNG/JSON).
- **Visibilitas Pribadi atau Publik + Bookmark & Remix**: karakter baru selalu privat sampai pemiliknya menerbitkannya. Karakter publik tampil di katalog `/jelajah` dengan filter multi-tag, bookmark/simpan, dan opsi **Remix** (bila diizinkan pembuat) tanpa membocorkan catatan riset atau email pembuat.
- **Ekspor & Impor Kartu SillyTavern V2**: mendukung impor dan ekspor kartu karakter dalam format JSON maupun PNG (chunk `tEXt chara`).
- **Sumber Riset Terkurasi**: tautan dinormalkan, parameter pelacak dibuang, duplikat dihapus, dan sumber yang tidak membahas karakternya disaring. Daftar sumber hanya tampil di tempat peninjauan dalam keadaan terlipat.
- **Arsip Baca-Saja**: bila pembuat menghapus karakternya, percakapan yang sudah ada tetap bisa dibaca lewat snapshot karakter, tetapi pesan baru ditolak.

### Percakapan

- **Streaming balasan** di chat 1-on-1 maupun **Grup Chat** dengan tombol berhenti, paginasi riwayat pesan, swipe & regenerate, pintasan keyboard desktop (`Esc`, `Alt+←/→`), dan pembacaan suara opsional (TTS).
- **Cabangkan Cerita (Fork) & Mundur (Rewind)**: cabangkan percakapan dari pesan mana pun untuk mencoba alur cerita alternatif tanpa menghapus timeline asli, atau mundur untuk menghapus pesan beserta ingatan turunannya dalam satu transaksi.
- **Inspektor Konteks & Memori Hibrida**: panel inspektor menampilkan estimasi token prompt, lorebook yang terpicu (pencocokan batas kata Unicode + batas karakter), sisa kuota harian, serta memori yang dipilih lewat peringkat hibrida (embedding semantik cosine similarity + relevansi leksikal & recency).
- **Multi-Persona**, grup chat multi-karakter, lorebook berbasis kata kunci, dan judul chat otomatis.
- **Dukungan Universal LLM + Auto-Fallback**: OpenAI-compatible (OpenRouter, Groq, DeepSeek, 9Router, Ollama, dan lainnya) serta Google AI Studio, dilengkapi timeout request, model riset terpisah, model embedding opsional, dan provider cadangan otomatis bila provider utama error/rate-limit.
- **Ekspor & Pulihkan Cadangan Penuh**: setiap pengguna bisa mengunduh seluruh datanya dalam format JSON dan memulihkannya kembali di tab Pengaturan → Data.
- **Tema Terang dan Gelap**: dipilih di Pengaturan, tab Preferensi Chat, dan berlaku per perangkat.

---

## Struktur Direktori

```
naravia/
├── public/
│   ├── landing/           # Foto suasana untuk halaman perkenalan
│   └── uploads/           # File avatar karakter dan persona
├── scripts/               # CLI: create-admin.mjs, migrate-sqlite-to-postgres.mjs
├── src/
│   ├── app/
│   │   ├── api/           # Endpoint backend (auth, admin, characters, chats, messages, health, dll.)
│   │   ├── admin/         # Panel Admin (khusus peran admin)
│   │   ├── login/, register/
│   │   ├── jelajah/       # Katalog karakter publik
│   │   ├── characters/, chat/[id]/, groups/, worlds/, settings/
│   │   ├── uploads/       # Route penyaji berkas dengan otorisasi per berkas
│   │   └── fonts/         # Font yang di-host sendiri (tanpa permintaan ke Google Fonts)
│   ├── components/        # Komponen UI (Navbar, AuthForm, AccountPanel, admin/*, dll.)
│   ├── lib/               # db (pool PostgreSQL), schema.mjs, auth, store, llm, rateLimit, dll.
│   └── middleware.ts      # Gerbang kasar: pengalihan halaman tanpa sesi ke /login
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

Buka `http://localhost:3002`. Tabel database dibuat otomatis saat koneksi pertama. **Akun pertama yang mendaftar otomatis menjadi admin.** Admin juga bisa dibuat lewat `ADMIN_EMAIL` dan `ADMIN_PASSWORD` di `.env.local`, atau lewat CLI:

```bash
node --env-file=.env.local scripts/create-admin.mjs --email admin@contoh.com --name "Admin"
```

Perintah lain yang tersedia:

```bash
npm run typecheck   # Pemeriksaan tipe TypeScript
npm run test        # Jalankan unit test Vitest
npm run lint        # Pemeriksaan kode dengan Biome
npm run build       # Build produksi
npm run start       # Jalankan hasil build
```

> Catatan: nilai environment hanya dibaca saat server start. Setelah mengubah `.env.local`, jalankan ulang `npm run dev`.

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

Compose menjalankan dua service: `db` (PostgreSQL 16, volume `naravia-pgdata`, port tidak dibuka ke luar) dan `naravia` (aplikasi di port 3002). Unggahan avatar disimpan di `./public/uploads`. Healthcheck container memakai endpoint `/api/health`, yang hanya memeriksa koneksi database dan tidak mengembalikan data apa pun.

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

- Selalu akses lewat **HTTPS** (misalnya Cloudflare Tunnel). Cookie sesi hanya dikirim lewat HTTPS saat `NODE_ENV=production`. Isi `COOKIE_SECURE=false` hanya bila produksi memang diakses lewat HTTP di jaringan lokal.
- Tutup pendaftaran (`REGISTRATION_MODE=closed` atau dari Panel Admin) jika aplikasi hanya untuk orang tertentu, agar kuota API provider tidak dipakai orang asing.
- Kosongkan kembali `ADMIN_PASSWORD` di file environment setelah akun admin dibuat.
- Pembatas laju disimpan di memori, cukup untuk satu instance server. Untuk banyak instance, pindahkan ke Redis.
- Jalankan server dari dalam direktori proyek. Penyaji dan pembersih berkas unggahan memakai direktori kerja proses, sehingga menjalankannya dari tempat lain membuat avatar dicari di lokasi yang salah.
- Pastikan `DATABASE_URL` menunjuk ke database yang benar sebelum memakai pembersih aset di Panel Admin. Pembersih menghapus berdasarkan catatan di tabel `uploads`, jadi menunjuk ke database kosong berarti tidak ada berkas yang dianggap terpakai.

---

## Cadangan Data

Tiga hal yang perlu dicadangkan terpisah:

1. **Database**: `pg_dump` seperti contoh di atas.
2. **Berkas unggahan**: direktori `data/uploads`.
3. **Data per pengguna**: ekspor JSON dari halaman Pengaturan, tab Data.
