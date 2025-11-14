# Daftar Perintah Penting (Setelah Reorganisasi Folder)

File ini berisi kumpulan perintah yang sering digunakan untuk menjalankan, mengelola, dan men-debug proyek Smart Souvenir.

---

## 0. Instalasi Dependensi

### Dependensi Utama (Server)
`npm install express cors jsonwebtoken bcryptjs firebase-admin`

### Dependensi untuk RFID Bridge & Simulator
`npm install ws serialport`

---

## 1. Menjalankan Aplikasi

### Menjalankan Server Utama (Backend)
Perintah ini memulai server API yang menangani semua logika bisnis. Jalankan dari folder `backend/`.
```bash
node backend/server.js
```

### Menjalankan Jembatan RFID (RFID Bridge)
Perintah ini memulai skrip yang menghubungkan pembaca RFID (Arduino) ke aplikasi kasir melalui WebSocket.
```bash
node rfid-bridge.js
```

---

## 2. Manajemen Database (Firebase)

### Mengisi Database dengan Data Awal (Seeding)
Jalankan ini jika Anda ingin me-reset database ke kondisi awal atau saat pertama kali setup.
```bash
node seed.js
```

---

## 3. Manajemen Proses Latar Belakang (PM2)

PM2 digunakan untuk menjalankan `rfid-bridge.js` secara otomatis dan stabil di latar belakang.

- **Memulai dan memberi nama proses:**
  `pm2 start rfid-bridge.js --name rfid-bridge`

- **Me-restart proses setelah mengubah kode:**
  `pm2 restart rfid-bridge`

- **Melihat log dari proses:**
  `pm2 logs rfid-bridge`

- **Melihat daftar semua proses yang berjalan:**
  `pm2 list`

- **Menghentikan proses:**
  `pm2 stop rfid-bridge`

- **Menyimpan daftar proses agar berjalan saat startup:**
  `pm2 save`

---

## 4. Konfigurasi Startup di Windows

Perintah ini hanya perlu dijalankan sekali di **PowerShell (sebagai Administrator)**.

- **Mengatasi error "script is disabled":**
  `Set-ExecutionPolicy RemoteSigned` (Ketik 'Y' untuk konfirmasi)

- **Menginstal helper untuk startup Windows:**
  `npm install pm2-windows-startup -g`

- **Mendaftarkan PM2 sebagai layanan startup:**
  `pm2-startup install`