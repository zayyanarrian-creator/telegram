# Bot Telegram + Gemini

Bot Telegram yang menjawab pesan memakai Google Gemini, lengkap dengan halaman admin untuk mengatur semuanya tanpa menyentuh kode. Dibuat dengan Next.js, dijalankan di Vercel, datanya disimpan di Upstash Redis.

## Fitur

- **Jawaban AI** dari Gemini, dengan riwayat percakapan per pengguna (bisa dihapus lewat `/reset`).
- **Rotasi hingga 5 API key Gemini.** Key dipakai bergantian. Kalau satu key kena batas atau ditolak, bot otomatis pindah ke key berikutnya.
- **Status tiap key** di halaman admin: siap atau tidak, sisa waktu istirahat, jumlah berhasil dan gagal, permintaan hari ini, kapan terakhir dipakai, dan error terakhir.
- **Batas pesan per pengguna**, supaya satu orang tidak menghabiskan kuota semua key.
- **Percakapan Telegram** di halaman admin: admin bisa melihat isi chat setiap pengguna (pertanyaan dan balasan bot) dalam bentuk percakapan.
- **Log pesan** di halaman admin: siapa bertanya apa, jawabannya, key mana yang dipakai, dan berapa lama.
- **Pengaturan lewat `/admin`**: token bot, webhook, model, system prompt, jumlah riwayat, pesan sambutan, pesan cadangan.
- **Tes balasan** langsung dari halaman admin tanpa lewat Telegram.
- Token bot dan API key disimpan **terenkripsi** (AES-256-GCM). Password admin disimpan sebagai hash scrypt.

## Cara pasang

### 1. Deploy ke Vercel

1. Unggah proyek ini ke repositori GitHub, lalu impor ke Vercel.
2. Di project Vercel, buka tab **Storage**, pilih **Upstash Redis** dari Marketplace, lalu hubungkan ke project. Variabel koneksi terisi otomatis.
3. (Disarankan) Di **Settings → Environment Variables**, isi `SETUP_CODE` dengan kode rahasia buatanmu sendiri. Tanpa ini, siapa pun yang membuka `/admin` lebih dulu bisa membuat password admin.
4. Klik **Redeploy** supaya variabel terbaca.

### 2. Buat password admin

Buka `https://domainmu.vercel.app/admin`, masukkan kode setup (kalau tadi diisi), lalu buat password minimal 8 karakter.

### 3. Hubungkan bot Telegram

1. Di Telegram, buka [@BotFather](https://t.me/BotFather), kirim `/newbot`, ikuti langkahnya, lalu salin token yang diberikan.
2. Di `/admin`, tempel token di bagian **Token bot** lalu simpan.
3. Di bagian **Webhook**, klik **Pasang webhook**. Lakukan ini dari **domain utama**, bukan dari alamat preview Vercel. Status harus berubah menjadi **Aktif**.

### 4. Tambah API key Gemini

1. Buat key di [Google AI Studio](https://aistudio.google.com/apikey).
2. Tempel di bagian **Kunci API Gemini** lalu klik **Tambah key**. Bot memeriksa dulu ke Google bahwa key-nya valid.
3. Untuk kuota terpisah, buat tiap key di **proyek Google yang berbeda**, karena batas pemakaian dihitung per proyek, bukan per key.

Lalu coba **Tes balasan**, dan kirim pesan ke bot di Telegram.

## Memakai halaman admin

### Status key

Tiap key menampilkan:

| Info | Arti |
| --- | --- |
| **Siap** | Key dipakai seperti biasa. |
| **Kena batas, siap lagi ±N** | Google membalas 429 (kuota habis). Key dilewati sampai waktu istirahat selesai, dan dicoba paling akhir kalau semua key sedang kena batas. |
| **Ditolak Google** | Key tidak valid atau dicabut (401/403). Key dilewati selama 1 jam. Periksa atau ganti key-nya. |
| Berhasil / Gagal | Total sejak key ditambahkan. |
| Hari ini | Jumlah permintaan hari ini menurut jam WIB. Ini hitungan bot sendiri, bukan angka resmi dari Google, dan hari di Google bisa berganti di jam yang berbeda. |
| Error terakhir | Pesan error terakhir dari Google (key disamarkan). |

Tombol **Reset status key** menghapus waktu istirahat semua key supaya langsung dicoba lagi. Statistik berhasil dan gagal tidak ikut terhapus.

### Batas pesan per pengguna

Atur **jumlah pesan** dan **rentang menit**. Bawaannya 20 pesan per 60 menit.

- Hitungan dimulai dari pesan pertama pengguna, lalu direset setelah rentang waktu habis (jendela tetap).
- Yang dihitung hanya pesan yang diteruskan ke AI. `/start` dan `/reset` tidak dihitung.
- Saat batas tercapai, bot mengirim pesan pemberitahuan **sekali saja**. Pesan berikutnya dari orang itu diabaikan tanpa balasan sampai rentang waktu habis. `{sisa}` di teks pemberitahuan diganti sisa menit.
- Isi jumlah pesan `0` untuk mematikan batas.
- Kalau Redis sedang bermasalah, pengguna tetap dilayani (batas tidak diberlakukan).

### Log pesan

Menampilkan 50 pesan terakhir dengan waktu (WIB), nama pengirim, status (**Dibalas**, **Gagal**, **Kena batas**), key yang dipakai, dan lama menjawab.

- Maksimal 200 entri tersimpan, tiap pesan dan jawaban dipotong 300 karakter.
- Hilang otomatis 30 hari setelah pesan terakhir, atau kapan saja lewat tombol **Hapus semua log**.
- Teks yang mirip API key Google atau token bot disamarkan sebelum disimpan.
- **Log berisi isi percakapan pengguna.** Kalau bot dipakai orang lain, beri tahu mereka, dan hapus log kalau sudah tidak diperlukan.

## Perintah bot

| Perintah | Fungsi |
| --- | --- |
| `/start` | Menampilkan pesan sambutan (`{nama}` diganti nama depan pengirim). |
| `/reset` | Menghapus riwayat percakapan pengguna itu. |
| teks lain | Dijawab oleh Gemini. |

## Variabel lingkungan

Semuanya opsional. Token bot dan API key diisi lewat `/admin`, bukan lewat variabel lingkungan.

| Variabel | Fungsi |
| --- | --- |
| `SETUP_CODE` | Kode sekali pakai agar hanya kamu yang bisa membuat password admin pertama kali. |
| `APP_SECRET` | Kunci enkripsi token dan API key. Kalau kosong, dibuat otomatis dan disimpan di Redis. Kalau diisi, **jangan diubah** setelah ada token atau key tersimpan, karena data lama tidak akan bisa dibaca lagi. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Terisi otomatis oleh integrasi Upstash. Nama `KV_REST_API_URL` dan `KV_REST_API_TOKEN` (serta yang berawalan) juga dikenali. |

## Menjalankan di komputer sendiri

```bash
npm install
cp .env.example .env.local   # isi koneksi Redis (Upstash)
npm run dev
```

Buka `http://localhost:3000/admin`. Telegram hanya bisa mengirim webhook ke alamat HTTPS publik, jadi untuk mencoba bot secara lokal kamu perlu tunnel (misalnya ngrok), atau cukup tes lewat bagian **Tes balasan**.

## Struktur proyek

```
app/
  page.js                  halaman depan publik (hanya tautan ke bot)
  admin/page.js            halaman admin
  api/telegram/route.js    penerima webhook Telegram
  api/admin/
    auth/                  setup, masuk, keluar
    state/                 status setup dan sesi
    settings/              token dan pengaturan bot
    keys/                  kelola API key dan statusnya
    chats/                 daftar dan isi percakapan Telegram
    logs/                  baca dan hapus log pesan
    webhook/               pasang, lepas, cek webhook
    test/                  tes balasan
lib/
  server.js                Redis, enkripsi, sesi, helper Telegram
  gemini.js                panggilan Gemini, rotasi key, statistik key, riwayat
  activity.js              log pesan dan batas pesan per pengguna
```

## Data di Redis

| Key | Isi | Masa simpan |
| --- | --- | --- |
| `cfg:passhash`, `cfg:appkey` | Hash password admin, kunci enkripsi otomatis | Tetap |
| `cfg:bot` | Token (terenkripsi), secret webhook, semua pengaturan | Tetap |
| `cfg:keys` | API key Gemini (terenkripsi), slot 1 sampai 5 | Tetap |
| `kcool:{slot}` | Penanda key sedang istirahat | Sesuai waktu istirahat |
| `kstat:{slot}` | Statistik berhasil, gagal, dan error terakhir | Tetap sampai key dihapus |
| `kday:{slot}:{tanggal}` | Jumlah permintaan per hari | 2 hari |
| `rot:idx` | Penghitung rotasi key | Tetap |
| `hist:{chatId}` | Riwayat percakapan | 7 hari tanpa percakapan |
| `rl:u:{userId}` | Hitungan batas pesan | Sepanjang rentang waktu batas |
| `conv:idx`, `conv:meta:{chatId}`, `conv:msgs:{chatId}` | Percakapan Telegram untuk admin (maks. 500 chat, 200 pesan per chat) | 30 hari setelah pesan terakhir |
| `log:msgs` | Log pesan | 30 hari setelah pesan terakhir |
| `upd:{id}` | Penanda update Telegram yang sudah diproses | 10 menit |
| `rl:login:{ip}` | Hitungan percobaan masuk admin | 10 menit |

## Pemecahan masalah

| Gejala | Penyebab dan solusi |
| --- | --- |
| `/admin` bilang variabel Redis tidak ditemukan | Hubungkan Upstash Redis di tab Storage Vercel, lalu **Redeploy**. |
| Bot tidak membalas sama sekali | Cek bagian Webhook: harus **Aktif**. Lihat juga "Error terakhir dari Telegram". Pasang ulang dari domain utama. |
| Bot membalas dengan pesan cadangan | Buka **Log pesan**, baca kolom Keterangan pada entri berstatus **Gagal**. Biasanya key habis kuota, key ditolak, atau belum ada key. |
| "Model … tidak ditemukan" | Ganti nama model di **Perilaku AI** dengan nama yang ada di [ai.google.dev](https://ai.google.dev). |
| Semua key "Kena batas" | Kuota gratis habis. Tunggu waktu istirahat, tambah key dari proyek Google lain, atau kecilkan batas pesan per pengguna. |
| Pengguna bilang "kena batas" padahal baru mulai | Hitungan batas berlaku sepanjang rentang menit. Naikkan jumlah pesan atau kecilkan rentang di **Batas pesan per pengguna**. |
| Token atau key "tidak bisa dibaca" | `APP_SECRET` berubah setelah data disimpan. Kembalikan nilai lamanya, atau simpan ulang token dan key. |
| Terkunci karena salah password | Tunggu 10 menit (maksimal 10 percobaan per alamat IP). |

## Keamanan

- Webhook hanya menerima permintaan dengan secret token yang cocok dengan milik Telegram.
- Cookie sesi admin `httpOnly`, `sameSite=strict`, berlaku 7 hari, dan ditandatangani.
- Percobaan masuk dibatasi 10 kali per 10 menit per alamat IP.
- Jangan pernah menaruh token bot atau API key di repositori. Semuanya diisi lewat `/admin`.
