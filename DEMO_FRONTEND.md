# Demo Frontend BPJS Privacy DApp

## 1. Persiapan

1. Jalankan network, IPFS, dan explorer.

   ```bash
   docker compose up -d
   ```

2. Pastikan kontrak sudah deploy dan `tubes-blockchain-fe/.env.local` berisi alamat kontrak.

   ```bash
   cat tubes-blockchain-fe/.env.local
   ```

3. Jalankan frontend.

   ```bash
   cd tubes-blockchain-fe
   npm install
   npm run dev
   ```

4. Buka URL Vite, lalu sambungkan MetaMask ke chain `1337`.

## 2. Siapkan Akun Demo

Gunakan minimal 4 wallet:

- Admin BPJS
- Pasien
- Faskes
- Auditor atau requester

Untuk setiap wallet:

1. Sambungkan MetaMask.
2. Klik **Kunci**.
3. Isi passphrase minimal 8 karakter.
4. Klik **Buat kunci lokal**.
5. Salin public key yang muncul.

## 3. Demo Status Awal

1. Sambungkan wallet.
2. Tunjukkan panel **Status**:
   - alamat wallet,
   - role aktif,
   - status kunci lokal,
   - jumlah event rekam medis,
   - jumlah permintaan akses.

## 4. Demo Admin BPJS

Masuk sebagai Admin BPJS, lalu buka workspace **Admin BPJS**.

1. Daftarkan pasien:

   - Nomor BPJS,
   - wallet pasien,
   - kelas layanan,
   - public key pasien.

2. Daftarkan faskes:

   - Facility ID,
   - wallet faskes,
   - public key faskes.

3. Daftarkan auditor:

   - wallet auditor,
   - public key auditor.

4. Ubah status asuransi pasien:
   - Nomor BPJS,
   - status aktif/nonaktif,
   - kelas layanan.

## 5. Demo Faskes

Masuk sebagai Faskes, lalu buka workspace **Faskes**.

1. Isi form **Upload rekam medis terenkripsi**:

   - Nomor BPJS pasien,
   - wallet dokter,
   - tipe record,
   - diagnosis,
   - tindakan,
   - obat,
   - catatan,
   - lampiran jika perlu.

2. Klik **Enkripsi, upload, simpan on-chain**.

3. Tunjukkan hasil:
   - payload terenkripsi di IPFS,
   - metadata record tersimpan on-chain,
   - DEK sementara muncul di frontend.

## 6. Demo Pasien

Masuk sebagai Pasien, lalu buka workspace **Pasien**.

1. Tunjukkan tabel **Rekam medis saya**.
2. Jika ada permintaan akses, gunakan:
   - **Approve** untuk menyetujui,
   - **Reject** untuk menolak,
   - **Revoke** untuk mencabut akses.

## 7. Demo Approval Faskes

Masuk lagi sebagai Faskes.

1. Buka tabel **Permintaan untuk record faskes**.
2. Klik **Approve** atau **Reject**.
3. Setelah pasien dan faskes approve, isi **Submit wrapped DEK**:
   - Request ID,
   - DEK,
   - public key requester.
4. Klik **Submit wrapped DEK**.

## 8. Demo Auditor

Masuk sebagai Auditor, lalu buka workspace **Auditor**.

1. Tunjukkan metadata record.
2. Tunjukkan metadata akses.
3. Jelaskan bahwa auditor tidak mendapat bypass plaintext.

## 9. Demo Dekripsi

Masuk sebagai wallet requester yang sudah mendapat akses.

1. Buka workspace **Dekripsi**.
2. Isi:
   - Record ID,
   - Request ID,
   - passphrase private key lokal.
3. Klik **Dekripsi**.
4. Tunjukkan plaintext muncul hanya di browser.

## Catatan Demo

- Frontend belum menyediakan tombol untuk membuat `requestAccess`.
- Untuk mendemokan approval dan dekripsi, buat request akses terlebih dahulu lewat kontrak/script.
- Jika role belum muncul, refresh halaman atau sambungkan ulang MetaMask.
- Jika transaksi gagal, cek network MetaMask, alamat kontrak `.env.local`, dan koneksi IPFS.
