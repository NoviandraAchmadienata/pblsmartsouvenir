@echo off
REM =================================================================
REM ==       SMART SOUVENIR - APPLICATION MANAGER                 ==
REM =================================================================
REM == File ini akan menjalankan atau menghentikan semua komponen  ==
REM == yang diperlukan untuk aplikasi kasir.                     ==
REM =================================================================

REM Mengubah direktori ke lokasi file ini dijalankan
cd /d %~dp0

title Smart Souvenir Manager

:main_menu
cls
echo =================================================
echo ==      SMART SOUVENIR APPLICATION MANAGER     ==
echo =================================================
echo.
echo   1. START Aplikasi
echo   2. STOP Aplikasi
echo   3. RESTART Aplikasi
echo   4. Keluar
echo.
set /p "choice=   Pilih opsi (1, 2, 3, atau 4) lalu tekan Enter: "

if "%choice%"=="1" goto start_app
if "%choice%"=="2" goto stop_app
if "%choice%"=="3" goto restart_app
if "%choice%"=="4" goto end_script

echo.
echo   Pilihan tidak valid. Silakan coba lagi.
timeout /t 2 > nul
goto main_menu

:start_app
cls
echo.
echo [1/5] Memastikan semua dependensi proyek terinstal (npm install)...
call npm install

echo.
echo [2/5] Memulai Backend Server...
REM Memulai server.js di jendela terminal baru
start "Backend Server" node backend/server.js

echo [3/5] Memulai RFID Bridge Simulator...
REM Memulai rfid-bridge.js di jendela terminal baru
start "RFID Bridge" node backend/rfid-bridge/rfid-bridge.js

echo [4/5] Memulai Ngrok untuk Webhook...
REM Perintah ini menyimpan token Anda. Cukup jalankan sekali, tapi aman dijalankan berulang kali.
ngrok config add-authtoken 35PgPW3FlZ2QDRILmeGbtiKD9fg_3tYX3ttuDjuFygE82Kr9P
REM Memulai ngrok di jendela baru. Pastikan ngrok sudah terinstal dan ada di PATH.
start "Ngrok" ngrok http 3000

echo.
echo      Menunggu server siap dalam 5 detik...
timeout /t 5 /nobreak > nul

echo [5/5] Membuka Kiosk di Browser...
REM Membuka file index.html di browser default Anda
start "" "frontend\kiosk\index.html"

echo.
echo SEMUA PROGRAM TELAH DIMULAI. Kembali ke menu utama...
timeout /t 3 > nul
goto main_menu

:stop_app
cls
echo.
echo [1/3] Menghentikan Backend Server...
taskkill /F /FI "WINDOWTITLE eq Backend Server" > nul

echo [2/3] Menghentikan RFID Bridge Simulator...
taskkill /F /FI "WINDOWTITLE eq RFID Bridge" > nul

echo [3/3] Menghentikan Ngrok...
taskkill /F /FI "WINDOWTITLE eq Ngrok" > nul

echo.
echo SEMUA PROGRAM TELAH DIHENTIKAN. Kembali ke menu utama...
timeout /t 3 > nul
goto main_menu

:restart_app
cls
echo.
echo --- TAHAP 1: MENGHENTIKAN APLIKASI ---
echo.
echo   Menghentikan Backend Server...
taskkill /F /FI "WINDOWTITLE eq Backend Server" > nul

echo   Menghentikan RFID Bridge Simulator...
taskkill /F /FI "WINDOWTITLE eq RFID Bridge" > nul

echo   Menghentikan Ngrok...
taskkill /F /FI "WINDOWTITLE eq Ngrok" > nul

echo.
echo   Semua aplikasi telah dihentikan.
echo   Menunggu 3 detik sebelum memulai ulang...
timeout /t 3 > nul

echo.
echo --- TAHAP 2: MEMULAI ULANG APLIKASI ---
echo.

REM Langsung lompat ke logika untuk memulai aplikasi
goto start_app

:end_script
exit