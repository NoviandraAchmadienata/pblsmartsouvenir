@echo off
REM =================================================================
REM ==         SMART SOUVENIR - APLIKASI STARTER OTOMATIS         ==
REM =================================================================
REM == File ini akan menjalankan semua komponen yang diperlukan      ==
REM == untuk aplikasi kasir. Cukup klik dua kali file ini.         ==
REM =================================================================

REM Mengubah direktori ke lokasi file ini dijalankan
cd /d %~dp0

title Smart Souvenir Starter

echo.
echo [1/4] Memulai Backend Server...
REM Memulai server.js di jendela terminal baru
start "Backend Server" node backend/server.js

echo [2/4] Memulai RFID Bridge...
REM Memulai rfid-bridge.js di jendela terminal baru
start "RFID Bridge" node backend/rfid-bridge/rfid-bridge.js

echo [3/4] Memulai Ngrok untuk Webhook...
REM Memulai ngrok di jendela baru. Pastikan ngrok sudah terinstal dan ada di PATH.
start "Ngrok" ngrok http 3000

echo.
echo      Menunggu server siap dalam 5 detik...
timeout /t 5 /nobreak > nul

echo [4/4] Membuka Kiosk di Browser...
REM Membuka file index.html di browser default Anda
start "" "frontend\kiosk\index.html"

echo.
echo =================================================
echo == SEMUA PROGRAM TELAH DIMULAI.                ==
echo == PASTIKAN URL NGROK SUDAH DI-SET DI MIDTRANS.==
echo == Jendela ini bisa ditutup.                   ==
echo =================================================
echo.
pause