# Multi-cabang POS — temuan audit dan status perbaikan

Tanggal: 9 Oktober 2026
Target kerja: `fix/multi-cabang-audit-20261009`
Batasan: perubahan ini berada di branch kerja. Jangan merge/deploy ke produksi sebelum hasil audit dan migrasi disetujui.

## Yang diperbaiki di frontend

- Identitas kasir sekarang dirender sebagai `Kasir: Nama · ID_CABANG (Nama Cabang)`.
- Label yang sama digunakan setelah login, saat sesi dipulihkan dari localStorage, dan pada struk.
- Label kasir menerima beberapa alias properti ID/nama cabang (`id_cabang`/`idCabang`, `nama_cabang`/`namaCabang`/`cabang_nama`) untuk kompatibilitas format respons.
- Jika role akun `OWNER` dan `id_cabang` kosong, layar menampilkan `OWNER / SEMUA CABANG`. Jika akun non-OWNER tidak memiliki `id_cabang`, layar menampilkan `ID CABANG BELUM DIATUR`.
- Pengambilan lima kelompok data tambahan saat sinkronisasi manual kini berjalan paralel, sedangkan penulisan IndexedDB tetap berurutan.
- Master Barang lokal tidak dihapus sebelum respons batch pertama diterima. Jika batch berikutnya gagal, pemulihan cache lama secara penuh masih menjadi pekerjaan lanjutan.
- Payload transaksi dan antrean offline menyertakan `id_cabang`, `nama_cabang`, `email_kasir`, dan `role_kasir` untuk kebutuhan validasi backend berikutnya. Field dari browser belum boleh dianggap tepercaya oleh backend.

## Temuan backend yang menghalangi multi-cabang penuh

1. `prosesLogin()` sudah membaca `id_cabang` dari sheet `User` dan mencari nama cabang dari sheet `Cabang`.
2. `Penjualan` belum memiliki skema cabang yang lengkap dalam definisi awalnya; `simpanTransaksi()` menyimpan kolom transaksi tetap dan belum menyimpan identitas cabang ke baris penjualan.
3. `getPenjualan()` dan `getDashboardData()` membaca transaksi lintas cabang tanpa filter otorisasi cabang.
4. `Barang` menyimpan satu nilai stok global; `simpanTransaksi()`, `tambahStokMasuk()`, dan retur mengubah stok global. Ini belum mendukung stok independen per cabang.
5. `Stok_Masuk` dan `Retur_Barang` belum menyimpan `id_cabang`; operasi baca/tulis belum difilter berdasarkan cabang.
6. Payload dari browser tidak boleh menjadi sumber otorisasi. Backend harus memvalidasi identitas kasir terhadap data `User` dan menentukan cabang/role dari data server.
7. Belum ditemukan alur transfer antar-cabang dengan status pengiriman, penerimaan, selisih, dan idempotensi.

## Aturan bisnis yang harus dipertahankan untuk implementasi

- Cabang: `PV001 — Pam MIM`, `TV002 — Toko Miko`, `PV002 — Pam Miko`.
- Stok lama dialokasikan ke `TV002` saat migrasi awal, tanpa menghapus data sumber sebelum backup dan rekonsiliasi.
- Transfer antar-cabang wajib didukung.
- Akun `OWNER` dengan `id_cabang` kosong memiliki akses semua cabang: PV001, TV002, dan PV002. Role OWNER tetap harus diverifikasi dari data pengguna di server; `id_cabang` kosong pada akun non-OWNER bukan pemberian akses.
- ADMIN dan USER dengan `id_cabang` terisi dibatasi sesuai hak akses dan cabang yang ditugaskan. Backend harus menolak akses lintas cabang yang tidak diizinkan.
- Transaksi offline harus mempertahankan `id_cabang` sejak dibuat sampai berhasil sinkron.

## Pekerjaan backend berikutnya — belum selesai di branch ini

- Migrasi aman: backup, tambah kolom cabang, dan validasi jumlah baris/total stok sebelum dan sesudah.
- Tambahkan `id_cabang` ke transaksi, barang masuk, retur, koreksi, dan data transfer; pertahankan pembacaan data lama.
- Buat stok per cabang, alokasikan stok lama ke TV002, lalu ubah semua operasi stok agar memakai cabang yang tervalidasi.
- Terapkan filter role+cabang pada endpoint baca dan validasi server-side pada endpoint tulis.
- Implementasikan transfer dengan status, penerimaan, selisih, dan pencegahan duplikasi.
- Uji sinkronisasi offline, data lama, laporan, dan skenario akses lintas cabang sebelum deployment.

## Status

Frontend: perubahan identitas cabang sudah diterapkan pada branch kerja.
Backend/migrasi/pemisahan stok: belum diterapkan; belum aman menyatakan role cabang berfungsi penuh.
Produksi: tidak diubah dan tidak di-deploy.


## Update pekerjaan 10 Oktober 2026 — fondasi migrasi kandidat

File baru: `backend/Code_POS_MultiCabang_Candidate.js`.

Yang sudah disiapkan di branch (belum dihubungkan ke endpoint produksi):
- Skema kandidat `Stok_Cabang`, `Mutasi_Stok_Cabang`, `Transfer_Cabang`, dan `Migrasi_Cabang_Log`.
- Resolusi aktor dari sheet `User`; hanya role `OWNER` yang benar-benar tersimpan di server dan memiliki `id_cabang` kosong yang diperlakukan sebagai all-branch. Akun non-OWNER tanpa cabang ditolak.
- Preview migrasi stok lama ke `TV002`, pemeriksaan ID barang duplikat/stok invalid, dan log status migrasi.
- Runner migrasi dengan frasa konfirmasi eksplisit, backup sheet sumber sebelum menulis alokasi, verifikasi jumlah produk dan total stok; nilai stok master lama tidak dihapus.

**Batasan penting:** ini fondasi migrasi, bukan perbaikan POS lengkap. File kandidat belum dimasukkan ke allowlist `doGet`/`doPost`, dan operasi penjualan, barang masuk, retur, koreksi, katalog/batch, dashboard/laporan, serta sinkronisasi offline belum dialihkan ke `Stok_Cabang`. Transfer antar-cabang baru memiliki skema, belum alur kirim/terima yang aktif. Jangan menjalankan runner di spreadsheet produksi. Langkah berikutnya adalah integrasi semua endpoint dan pengujian pada salinan spreadsheet, termasuk pencegahan transaksi ganda dan otorisasi server-side, baru kemudian rencana migrasi/deploy.


## Risiko keamanan yang ditemukan saat mulai integrasi

- Bridge `doPost` menerima nama fungsi dan argumen dari request, lalu menjalankan allowlist fungsi tanpa sesi autentikasi terverifikasi.
- Login lama mengembalikan identitas/role/cabang, tetapi tidak menerbitkan token sesi bertanda tangan yang diverifikasi pada setiap request. Karena itu, email/role/cabang yang dikirim browser tidak cukup untuk otorisasi.
- `doGet` juga menyediakan jalur JSONP untuk beberapa fungsi baca. Filter cabang harus diterapkan di backend dan jalur baca lama tidak boleh menjadi bypass.
- Maka, **belum aman menambahkan fungsi stok/transfer ke allowlist** hanya dengan menerima `email` atau `id_cabang` dari payload. Tahap integrasi harus menambahkan sesi bertanda tangan server-side, memvalidasi sesi pada setiap request, lalu menerapkan scope role/cabang pada setiap fungsi baca/tulis; login dan fungsi publik harus menjadi pengecualian yang eksplisit.
- Password pada sheet `User` saat ini dibandingkan langsung sebagai teks biasa. Ini perlu diperlakukan sebagai temuan keamanan terpisah; perubahan penyimpanan password harus direncanakan agar tidak mengunci pengguna yang sudah ada.

## Gerbang sebelum rilis

1. Kerjakan seluruh integrasi hanya pada salinan GAS dan salinan spreadsheet.
2. Tambahkan token sesi yang ditandatangani server; jangan mempercayai role/email/cabang dari browser.
3. Alihkan POS, stok masuk/retur, koreksi, laporan, dashboard, katalog/batch dan sinkronisasi offline ke stok cabang; transaksi offline harus membawa ID idempoten dan cabang asal.
4. Selesaikan transfer antar-cabang (buat, kirim, terima, selisih, duplikasi/retry) dengan pencatatan mutasi.
5. Uji regresi data lama dan skenario akses lintas cabang, termasuk OWNER kosong cabang, ADMIN/USER per cabang, offline/retry, retur dan pembatalan.
6. Bandingkan jumlah baris dan total stok sebelum/sesudah migrasi; simpan backup dan log rekonsiliasi.
7. Baru setelah laporan pengujian dan migrasi disetujui, siapkan deployment GAS dan pembaruan URL; jangan mengganti URL produksi sebelum backend yang cocok benar-benar diterbitkan dan diuji.


### Update implementasi kandidat — stok dan transfer

- Kandidat backend kini memiliki fungsi mutasi stok dengan ID event untuk mencegah pengurangan/penambahan berulang saat retry, catatan status `PENDING/APPLIED`, dan `LockService` pada mutasi stok.
- Alur transfer kandidat mencakup `DRAFT → SENDING → SENT → RECEIVING → RECEIVED`; pengiriman mengurangi stok cabang asal, penerimaan menambah stok cabang tujuan, dan setiap item memakai event ID idempoten.
- Fungsi kandidat tetap **belum dipanggil oleh aplikasi** dan sengaja belum masuk allowlist endpoint. Alasan utamanya: API produksi saat ini belum mempunyai sesi bertanda tangan yang bisa membuktikan identitas request. Mengaktifkan transfer sebelum autentikasi dan pengujian retry selesai akan berisiko terhadap stok.
- Verifikasi otomatis terhadap Google Sheets belum bisa dinyatakan lulus karena fungsi perlu diuji di salinan spreadsheet GAS. Sintaks kandidat juga perlu diperiksa dari editor GAS sebelum pengujian integrasi.


### Update 10 Oktober — sesi dan endpoint kandidat

- Ditambahkan primitive sesi bertanda tangan HMAC dengan masa berlaku 8 jam. Token memuat klaim yang diambil dari sheet User di server; verifikasi sesi memuat ulang role dan cabang agar perubahan penugasan pengguna membatalkan sesi lama.
- Ditambahkan wrapper kandidat untuk membaca stok cabang, mutasi stok, serta buat/kirim/terima transfer yang memperoleh email aktor dari token, bukan argumen browser.
- Ditambahkan GitHub Actions workflow `.github/workflows/multicabang-candidate-syntax.yml` untuk `node --check` terhadap file kandidat. Ini hanya pemeriksaan sintaks, bukan uji Apps Script atau Google Sheets.
- Belum ada penggantian `doPost` produksi atau penambahan endpoint ke allowlist lama. Ini sengaja: bridge lama masih mengizinkan banyak fungsi tanpa sesi, sehingga menambahkan endpoint aman baru saja tidak menghilangkan jalur lama yang tidak aman.
- Belum ada eksekusi migrasi spreadsheet. Belum ada klaim bahwa sintaks lulus sampai hasil workflow terlihat, dan belum ada uji integrasi nyata di salinan spreadsheet.

### Pekerjaan wajib sebelum penggunaan nyata

1. Buat salinan project Apps Script dan spreadsheet untuk staging.
2. Integrasikan login agar mengembalikan token sesi; update bridge frontend agar menyimpan dan mengirim token tanpa menyimpan password.
3. Ganti bridge staging dengan dispatcher yang hanya mengizinkan fungsi publik/login tanpa token; seluruh fungsi lain wajib memverifikasi token dan role/cabang.
4. Integrasikan transaksi penjualan, barang masuk, retur, koreksi, laporan, dashboard, batch master dan sinkronisasi offline dengan stok cabang. Pertahankan skema laporan lama melalui adapter agar tidak merusak riwayat.
5. Tambahkan tes otomatis serta uji manual di salinan spreadsheet untuk migrasi, retry offline, transfer parsial/gagal, retur, hak akses, dan rekonsiliasi.
