/*
 * Kode Kasir RFID Sederhana - Kompatibel dengan rfid-bridge.js
 * - MFRC522 RFID Reader
 * - 1 Indikator LED (Pin 6)
 * - 1 Buzzer (Pin 5)
 * 
 * Modifikasi:
 * - Mengirimkan UID bersih (tanpa teks tambahan) ke port serial.
 * - Setiap UID diakhiri dengan karakter newline (\n) agar bisa dibaca oleh ReadlineParser di Node.js.
 */

#include <SPI.h>
#include <MFRC522.h>

// --- Definisi Pin ---

// Pin untuk RFID MFRC522
#define SS_PIN 10
#define RST_PIN 9

// Pin untuk Indikator
#define BUZZER_PIN 5
#define LED_PIN 6       // LED tunggal di Pin 6

// Buat instance MFRC522
MFRC522 rfid(SS_PIN, RST_PIN);

void setup() {
    Serial.begin(9600);
    SPI.begin();       // Inisialisasi SPI
    rfid.PCD_Init(); // Inisialisasi MFRC522

  // Atur pin mode untuk indikator
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(LED_PIN, OUTPUT);

  // Atur kondisi awal (State: Menunggu Barang)
    digitalWrite(LED_PIN, LOW); // LED mati saat menunggu
    digitalWrite(BUZZER_PIN, LOW);

    Serial.println("Kasir RFID Siap!");
    Serial.println("Menunggu pemindaian tag RFID...");
    Serial.println();
}

void loop() {
    // 1. Cari kartu/tag baru
    if ( ! rfid.PICC_IsNewCardPresent()) {
        return; // Jika tidak ada, ulangi loop
    }

    // 2. Pilih salah satu kartu (baca serial number)
    if ( ! rfid.PICC_ReadCardSerial()) {
        return; // Jika gagal baca, ulangi loop
    }

  // --- 3. JIKA TAG BERHASIL DIBACA ---

  // Dapatkan UID sebagai string dan kirim ke Serial
    String uidString = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
        if (rfid.uid.uidByte[i] < 0x10) {
        uidString += "0"; // Tambahkan '0' di depan jika nilai hex < 10
        }
        uidString += String(rfid.uid.uidByte[i], HEX);
    }
    uidString.toUpperCase(); // Ubah ke huruf besar untuk konsistensi

    Serial.println(uidString); // Kirim UID bersih diikuti newline ke rfid-bridge.js

    // Aktifkan Indikator Sukses (Bip & LED nyala)
    digitalWrite(LED_PIN, HIGH);
    digitalWrite(BUZZER_PIN, HIGH);
    delay(200);
    digitalWrite(LED_PIN, LOW);
    digitalWrite(BUZZER_PIN, LOW);
    
    // Beri jeda agar tag yang sama tidak terbaca berulang kali dengan cepat
    delay(800); 

    // Hentikan pembacaan kartu saat ini
    rfid.PICC_HaltA();
}