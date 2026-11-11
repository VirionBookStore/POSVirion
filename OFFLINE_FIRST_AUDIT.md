# Audit awal POSVirion Offline-First (branch pengujian)

Tanggal: 2026-11-11. Status: audit awal; belum siap produksi.

## Temuan dari index.html pada main
- IndexedDB sudah ada, termasuk penyimpanan dan antrean transaksi pending.
- Tidak ditemukan registrasi serviceWorker pada index.html; kemampuan membuka aplikasi saat benar-benar offline belum dapat diasumsikan.
- loadDashboardByDate membaca cache localStorage berdasarkan cabang/tanggal, tetapi tanpa cache masih menampilkan "Memuat data..." dan memanggil google.script.run.
- initApp memanggil loadBarang(), getPromoList(), dan (untuk owner) getCabang() saat inisialisasi.
- Pustaka scanner, html2canvas, dan xlsx dimuat dari CDN eksternal; perlu strategi cache/vendor lokal agar fitur terkait dapat digunakan offline.
- Status navigator.onLine tidak cukup untuk membuktikan GAS dapat diakses.

## Tahap implementasi dan kriteria penerimaan
1. Petakan seluruh pembacaan/penulisan GAS per menu, kontrak respons, dan store IndexedDB; pastikan data per cabang dan role tidak tercampur.
2. Tampilkan snapshot lokal untuk dashboard dan menu sebelum refresh jaringan; jangan mengubah cache menjadi angka nol ketika jaringan gagal.
3. Buat aset aplikasi tersedia offline dengan service worker dan strategi pembaruan versi; uji pembukaan ulang setelah pernah online.
4. Persist seluruh transaksi dan mutasi stok secara atomik ke antrean IndexedDB sebelum memberi status berhasil lokal; jangan menandai sinkron sebelum server mengonfirmasi.
5. Idempotency transaksi di GAS berdasarkan clientTransactionId; uji retry, retur, diskon, cabang, konflik stok lintas perangkat, dan restart APK.
6. Uji Android APK dan web, dengan mode pesawat, reload, restart, 5.787 produk, dan sinkron ulang.
7. Jangan merge ke main sebelum lulus pengujian dan disetujui pemilik.

Catatan: ini dokumen audit, bukan klaim bahwa implementasi sudah selesai.

## Implementasi awal di branch pengujian (2026-11-11)
- Ditambahkan `sw.js`: cache shell navigasi dan tiga pustaka UI eksternal yang saat ini dipakai halaman. Request POST dan endpoint GAS tidak dimasukkan ke cache.
- `index.html` mendaftarkan Service Worker pada HTTPS.
- Dashboard: jika offline, gunakan snapshot dashboard localStorage untuk kombinasi cabang/tanggal; jika snapshot belum ada, tampilkan pesan yang jelas dan tidak menunggu GAS. Kegagalan refresh server tidak menghapus snapshot yang sudah tampil.
- Startup promo dan daftar cabang kini membaca IndexedDB lebih dahulu.
- Riwayat penjualan kini merender data IndexedDB tanpa menunggu GAS ketika perangkat terdeteksi offline, dengan pembatasan cabang untuk akun cabang.
- Supplier, stok masuk, retur barang, POS, dan retur POS sudah memiliki jalur local-first di kode dasar; perlu diuji end-to-end pada perangkat.

## Batasan dan pekerjaan yang masih wajib
- Cache Service Worker baru aktif setelah perangkat membuka versi branch yang di-host melalui HTTPS minimal sekali saat online. APK/WebView harus diuji terpisah karena konfigurasi origin dan update-nya dapat berbeda.
- Login offline hanya mungkin jika sesi pengguna sudah tersimpan di perangkat. Login pertama tetap membutuhkan server.
- Dashboard offline hanya dapat menampilkan snapshot untuk tanggal/cabang yang pernah dimuat; belum menghitung ulang laporan dari transaksi lokal secara penuh.
- Kode klien mengirim `clientTransactionId` saat retry transaksi, tetapi deduplikasi server/GAS belum diverifikasi dari sumber GAS. Jangan anggap retry aman dari duplikasi sebelum fungsi `simpanTransaksi` di GAS diperiksa dan diuji.
- Perlu uji mode pesawat nyata, transaksi offline, stok lokal, restart aplikasi, retry setelah online, dan pembuktian satu nota hanya tercatat sekali di Google Sheets. Tidak ada perubahan ke branch produksi.
