// rfid-bridge.js
// Jembatan: Arduino (serial) -> WebSocket -> Frontend kasir

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const WebSocket = require('ws');
const fs = require('fs'); // BARU: Modul untuk interaksi file
const path = require('path'); // BARU: Modul untuk menangani path file

// === GANTI SESUAI LAPTOP KAMU ===
// Windows biasanya: 'COM3', 'COM4', dll
// Linux/Debian: '/dev/ttyUSB0' atau '/dev/ttyACM0'
const SERIAL_PORT_PATH = 'COM3';      // TODO: ubah ke port Arduino kamu
const SERIAL_BAUD_RATE = 9600;        // samakan dengan Serial.begin(...) di sketch Arduino

// Port WebSocket yang akan diakses frontend
const WS_PORT = 8080;
const WS_PATH = '/ws/rfid';

// --- BARU: Konfigurasi Logging ---
const LOG_FILE_PATH = path.join(__dirname, 'rfid_scans.log');

/**
 * Menulis pesan log ke file dengan timestamp.
 * @param {string} message Pesan yang akan di-log.
 */
function logToFile(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - ${message}\n`;

  fs.appendFile(LOG_FILE_PATH, logMessage, (err) => {
    if (err) console.error('[RFID-BRIDGE] Failed to write to log file:', err);
  });
}
// --- Setup Serial ---
const port = new SerialPort({
  path: SERIAL_PORT_PATH,
  baudRate: SERIAL_BAUD_RATE,
});

const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

port.on('open', () => {
  const message = `Serial connected on ${SERIAL_PORT_PATH} @ ${SERIAL_BAUD_RATE}`;
  console.log(`[RFID-BRIDGE] ${message}`);
  logToFile(message); // Log saat koneksi serial berhasil
});

port.on('error', (err) => {
  const message = `Serial error: ${err.message}`;
  console.error('[RFID-BRIDGE]', message);
  logToFile(`ERROR: ${message}`); // Log jika terjadi error
});

// --- Setup WebSocket Server ---
const wss = new WebSocket.Server({ port: WS_PORT, path: WS_PATH }, () => {
  const message = `WebSocket listening on ws://localhost:${WS_PORT}${WS_PATH}`;
  console.log(`[RFID-BRIDGE] ${message}`);
  logToFile(message); // Log saat server WebSocket siap
});

wss.on('connection', (ws) => {
  console.log('[RFID-BRIDGE] Frontend connected');
  ws.send(JSON.stringify({ type: 'info', message: 'Connected to RFID bridge' }));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// --- Terima data dari Arduino ---
// Asumsi: Arduino mengirim UID 1 baris per scan, misalnya "uid333\n"
parser.on('data', (line) => {
  const raw = line.toString().trim();
  if (!raw) return;

  // Kalau di Arduino kamu nulis misalnya "UID: 12345678"
  // bisa diparsing di sini, contoh:
  // const uid = raw.replace(/^UID[: ]*/i, '');

  const uid = raw;
  console.log(`[RFID-BRIDGE] UID from serial: ${uid}`);

  // BARU: Tulis UID yang diterima ke file log
  logToFile(`UID Scanned: ${uid}`);

  // Kirim ke semua frontend yang connect
  broadcast({ type: 'rfid', rfid: uid, timestamp: Date.now() });
});

// contoh minimal (sesuaikan dengan kode RC522 kamu)
//void setup() {
  //Serial.begin(9600);
  // init RFID...
//}

//void loop() {
  // kalau ada kartu kebaca
  //if (kartuTerbaca) {
    //String uid = bacaUID();   // misal "uid333"
    //Serial.println(uid);      // penting: println -> ada '\n'
    //delay(500);               // anti dobel spam
  //}
//}