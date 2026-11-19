# Audit Local-First POSVirion

Tanggal audit: 2026-11-19  
Branch kerja: `audit-perbandingan-kasir`  
Branch produksi yang dijadikan baseline: `main`

## Ruang lingkup tahap pertama

Pemeriksaan dilakukan pada `index.html` dan konfigurasi PWA/Android yang tersedia di repositori. Fokus tahap pertama adalah alur IndexedDB, antrean transaksi offline, pemulihan stok, dan sinkronisasi.

## Perbaikan yang sudah diterapkan pada branch audit

### Overlay stok untuk transaksi pending

Temuan pada baseline:
- Transaksi penjualan lokal disimpan ke object store `pendingTransactions`.
- Bentuk record penjualan menyimpan rincian barang dan cabang di dalam `pending.payload.items` dan `pending.payload.id_cabang`.
- Record Retur/Tukar juga disimpan di `pendingTransactions`, dengan `txType: 'RETUR_TUKAR'` dan rincian di dalam `payload`.
- Fungsi overlay stok sebelumnya membaca `trx.items` / `trx.detail` dan `trx.id_cabang` / `trx.idCabang` di level teratas, sehingga tidak membaca bentuk record aktual tersebut.
- Dampaknya: ketika katalog segar dari server dimuat ulang, perubahan stok dari transaksi pending berisiko tidak diterapkan kembali pada katalog yang ditampilkan/disimpan.

Perbaikan pada branch ini:
- Overlay membaca format record baru melalui `trx.payload` sekaligus tetap mendukung format lama di level teratas.
- Filter cabang membaca ID cabang dari record maupun payload.
- Penjualan pending mengurangi stok.
- Retur/Tukar pending mengikuti mode item: `retur` menambah stok dan mode selain retur mengurangi stok.
- Refresh katalog pada menu Retur POS juga melewati overlay pending, bukan langsung menampilkan data server mentah.
- Penanganan record lama pada store `pendingReturTukar` tetap dipertahankan dengan deduplikasi ID antrean.

## Optimasi tambahan yang sudah diterapkan pada branch audit

### Pemeriksaan status database untuk katalog besar

Sebelumnya, indikator status memanggil `getAllFromStore` untuk seluruh object store hanya untuk menghitung jumlah record. Sekarang jumlah tiap store dihitung menggunakan `getLocalStoreCount` (IndexedDB `count()`), sedangkan isi data hanya dibaca dari antrean pending untuk menghitung transaksi berstatus PENDING. Ini mengurangi pembacaan data besar saat membuka menu status database.

## Temuan audit lanjutan — belum diubah

### 1. Sinkronisasi master barang belum aman terhadap kegagalan di tengah proses

Fungsi sinkronisasi manual mengosongkan store `masterBarang` sebelum seluruh batch dari GAS selesai diterima. Batch kemudian ditulis bertahap. Jika jaringan/API gagal setelah store dikosongkan atau setelah sebagian batch masuk, katalog lokal dapat tertinggal dalam keadaan kosong/sebagian.

Rekomendasi: ambil seluruh batch ke staging store/struktur sementara, validasi jumlah dan ID, lalu lakukan penggantian atomik dalam satu transaksi IndexedDB. Jangan menghapus katalog aktif sebelum data pengganti tervalidasi.

### 2. replaceStore bukan operasi atomik

Implementasi saat ini menjalankan `clearStore` dan `putStoreBatch` sebagai dua transaksi IndexedDB terpisah. Jika penulisan batch gagal setelah clear berhasil, data lama sudah terhapus.

Rekomendasi: buat helper penggantian store yang menjalankan `clear()` dan seluruh `put()` di dalam satu transaksi readwrite yang sama.

### 3. Restore backup berjalan per-store, bukan satu kesatuan

Restore membersihkan dan mengisi setiap object store melalui transaksi terpisah. Kegagalan pada store berikutnya dapat meninggalkan database dengan kombinasi data lama dan data hasil restore.

Rekomendasi: validasi file backup terlebih dahulu (format, versi, nama store, keyPath, dan kelengkapan data), simpan snapshot pemulihan, lalu gunakan strategi restore yang dapat dibatalkan/dipulihkan bila salah satu tahap gagal.

### 4. Pemeriksaan status database membaca seluruh isi store hanya untuk menghitung record — SELESAI

`checkLocalDbStatus` sekarang menggunakan `getLocalStoreCount` (IndexedDB `count()`) untuk jumlah data tiap store. Isi data tidak lagi dibaca hanya untuk menghitung jumlah record.

### 5. Idempotensi transaksi perlu diverifikasi di sisi Google Apps Script

Klien mengirim `clientTransactionId` dan memiliki proses audit pra-sinkronisasi. Namun, bukti idempotensi final harus diperiksa pada implementasi GAS `simpanTransaksi`, `simpanReturTukarTransaksi`, dan `auditSinkronisasi`. Repositori web saja tidak cukup untuk menyimpulkan server menolak ID transaksi yang sama secara atomik.

## Pemeriksaan dan batasan

- Perubahan dilakukan hanya pada branch `audit-perbandingan-kasir`; branch `main` tidak diubah.
- Tidak ada perubahan pada URL GAS atau konfigurasi produksi.
- Belum dilakukan pengujian runtime di browser/Android maupun uji integrasi terhadap GAS.
- Sebelum merge, perlu pengujian: transaksi penjualan offline, retur/tukar offline, reconnect, refresh katalog per cabang, sinkronisasi ulang setelah timeout, restore backup, dan kegagalan jaringan saat sinkronisasi master.

## Tahap 1 — pengamanan retry sinkronisasi

Perbaikan tambahan pada `syncPendingTransactions`:
- Antrean dengan `retryCount > 0` terlebih dahulu diperiksa melalui endpoint GAS `auditSinkronisasi` menggunakan `clientTransactionId`.
- Jika server mengembalikan nomor nota untuk ID tersebut, antrean lokal ditandai selesai/dihapus dan riwayat penjualan lokal diperbarui; transaksi tidak dikirim ulang.
- Jika audit server gagal atau respons tidak memiliki `syncedMap` yang valid, antrean retry lama ditahan dan tidak dikirim ulang. Antrean baru dengan `retryCount = 0` tetap dapat diproses.
- Hasil deduplikasi dan retry yang ditahan dicatat pada audit log lokal.

Batasan yang masih harus diuji:
- Perilaku endpoint GAS `auditSinkronisasi` harus diuji pada data nyata, termasuk untuk transaksi Retur/Tukar.
- Pencegahan duplikasi lintas perangkat tetap memerlukan pemeriksaan implementasi server GAS dan pengujian saat dua perangkat mengirim ID yang sama.
- Belum ada pengujian runtime browser/Android pada perubahan ini; perubahan baru lolos pemeriksaan struktur kode dan verifikasi isi branch.
