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
