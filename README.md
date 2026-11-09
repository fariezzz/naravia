# Naravia

Platform percakapan karakter AI lokal (*local-first*) berbasis **Next.js 15 (App Router)**, **React 19**, dan database bawaan **Node.js 22 (`node:sqlite`)**. Dirancang dengan performa tinggi, UI bersih (*clean & lightweight*), serta fleksibilitas penuh untuk berbagai provider LLM.

---

## Fitur Utama

- **Local-First & Tanpa Dependensi Berat Eksternal**:
  - Menggunakan modul bawaan `node:sqlite` dari Node.js 22 tanpa kompilasi C++ tambahan (`node-gyp`).
  - Dilengkapi SQLite WAL mode, memory-mapped I/O (mmap), dan indeks query untuk latensi sub-50ms.
- **Dukungan Universal LLM Provider**:
  - Kompatibel dengan format **OpenAI-compatible** (OpenRouter, Groq, DeepSeek, 9Router, Together, Chutes, Ollama, dll.) maupun **Google AI Studio (Gemini Native)**.
  - Base URL dan nama model bebas dikonfigurasi melalui antarmuka Pengaturan, lengkap dengan fitur deteksi model otomatis dari URL.
- **Sistem Multi-Persona Fleksibel**:
  - Pengguna dapat membuat dan mengelola banyak profil persona (nama, foto profil, deskripsi, suka, tidak suka).
  - Persona dapat diganti secara dinamis per ruang chat individu maupun grup chat tanpa saling menimpa.
- **Crop Foto Profil Interaktif 1:1**:
  - Pemotongan foto profil persegi 1:1 dengan kontrol geser (drag), pembesar (zoom), dan reset.
  - Gambar diproses via HTML5 Canvas (512x512 PNG) dan ditampilkan dalam bentuk lingkaran (`rounded-full`) di seluruh aplikasi.
- **Ruang Percakapan Intuitif**:
  - Tampilan input chat *sticky/fixed* di bagian bawah layar.
  - *Optimistic rendering*: Pesan pengguna langsung tampil di layar seketika tanpa menunggu respons jaringan.
  - Gaya balasan AI dapat disesuaikan (singkat, sedang, deskriptif).
  - Ekstraksi dan injeksi memori karakter otomatis serta Lorebook berdasarkan kata kunci percakapan.
- **Grup Chat Multi-Karakter**:
  - Obrolan bersama banyak karakter dalam satu alur skenario.
- **Pembuat & Pengimpor Karakter**:
  - Generator karakter otomatis berbasis riset web dan AI.
  - Importer kartu karakter SillyTavern (format PNG dengan metadata tersemat atau JSON V2).
- **Client Cache (SWR)**:
  - Navigasi antar halaman instan tanpa jeda blank/skeleton berulang.

---

## Struktur Direktori

```
naravia/
├── data/                  # Direktori penyimpanan database SQLite (naravia.db)
├── public/
│   └── uploads/           # File gambar avatar karakter dan persona pengguna
├── src/
│   ├── app/               # Next.js App Router (Halaman dan API endpoints)
│   │   ├── api/           # Endpoint backend (characters, chats, persona, settings, dll.)
│   │   ├── characters/    # Halaman pembuatan dan profil karakter
│   │   ├── chat/[id]/     # Ruang percakapan 1-on-1
│   │   ├── groups/        # Ruang dan daftar grup chat
│   │   ├── settings/      # Halaman pengaturan provider LLM & manajemen persona
│   │   └── worlds/        # Pengelolaan dunia dan lorebook
│   ├── components/        # Komponen UI (Navbar, CharacterAvatar, ImageCropModal, dll.)
│   └── lib/               # Utility core (db, llm, clientCache, character, lore, dll.)
├── Dockerfile             # Multi-stage Docker build berbasis Node 22 Alpine
├── docker-compose.yml     # Konfigurasi container service Naravia
├── next.config.mjs        # Konfigurasi Next.js (Standalone mode & dev origins)
└── PANDUAN_DEPLOY_PROXMOX.md # Panduan deployment ke Proxmox LXC + Docker
```

---

## Kebutuhan Sistem

- **Node.js**: Versi 22.12.0 atau lebih baru (wajib untuk modul bawaan `node:sqlite`).
- **NPM**: Versi 10 atau lebih baru.
- *(Opsional)* **Docker & Docker Compose**: Jika ingin menjalankan aplikasi di dalam container.

---

## Menjalankan Secara Lokal

### 1. Salin Repositori & Pasang Dependensi
```bash
git clone <URL_REPOSITORY>
cd naravia
npm install
```

### 2. Siapkan File Environment
Salin template konfigurasi:
```bash
cp .env.local.example .env.local
```
Sesuaikan nilai di dalam `.env.local`:
```env
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta
LLM_API_KEY=kunci_api_anda
LLM_MODEL=gemma-4-26b-a4b-it

# Opsional: Jika ingin melindungi akses aplikasi dengan sandi
NARAVIA_ACCESS_KEY=
```
*(Pengaturan ini juga dapat diubah kapan saja langsung melalui halaman menu **Pengaturan** di dalam aplikasi).*

### 3. Jalankan Aplikasi

- **Mode Pengembangan (Development)**:
  ```bash
  npm run dev
  ```
  Akses di browser melalui: `http://localhost:3000`

- **Mode Produksi (Disarankan untuk Performa Terbaik)**:
  ```bash
  npm run build
  npm run start
  ```

---

## Deployment Menggunakan Docker

Aplikasi ini sudah menyertakan konfigurasi `Dockerfile` (multi-stage standalone Next.js) dan `docker-compose.yml`.

Jalankan satu perintah berikut:
```bash
docker compose up -d --build
```

Container akan otomatis:
- Mem-build aplikasi dalam image mandiri yang ringan (~130 MB).
- Menghubungkan database persisten ke folder lokal `./data`.
- Menyimpan unggahan avatar ke folder lokal `./public/uploads`.
- Menjalankan healthcheck internal di port `3000`.

Untuk mematikan container:
```bash
docker compose down
```

---

## Deployment ke Proxmox VE (LXC)

Jika Anda ingin mendeploy Naravia ke server homelab Proxmox VE:
1. Buat LXC Container (Debian 12 / Ubuntu 24.04).
2. Aktifkan fitur **Nesting** (`nesting=1`) dan **keyctl** (`keyctl=1`) di menu **Options -> Features**.
3. Pasang Docker Engine di dalam LXC.
4. Clone repo dan jalankan `docker compose up -d --build`.

Langkah-langkah terperinci dan panduan menghubungkan ke **Cloudflare Tunnel** tersedia di:
👉 **[PANDUAN_DEPLOY_PROXMOX.md](./PANDUAN_DEPLOY_PROXMOX.md)**

---

## Lisensi & Catatan

Dibuat untuk penggunaan pribadi dan komunitas roleplay AI lokal. Seluruh data percakapan dan profil karakter tersimpan sepenuhnya di perangkat Anda secara aman.
