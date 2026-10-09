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
