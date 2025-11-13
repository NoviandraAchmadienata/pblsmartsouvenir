// rfid-bridge.js
// Jembatan: Arduino (serial) -> WebSocket -> Frontend kasir

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const WebSocket = require('ws');

// === GANTI SESUAI LAPTOP KAMU ===
// Windows biasanya: 'COM3', 'COM4', dll
// Linux/Debian: '/dev/ttyUSB0' atau '/dev/ttyACM0'
const SERIAL_PORT_PATH = 'COM3';      // TODO: ubah ke port Arduino kamu
const SERIAL_BAUD_RATE = 9600;        // samakan dengan Serial.begin(...) di sketch Arduino

// Port WebSocket yang akan diakses frontend
const WS_PORT = 8080;
const WS_PATH = '/ws/rfid';

// --- Setup Serial ---
const port = new SerialPort({
  path: SERIAL_PORT_PATH,
  baudRate: SERIAL_BAUD_RATE,
});

const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

port.on('open', () => {
  console.log(`[RFID-BRIDGE] Serial connected on ${SERIAL_PORT_PATH} @ ${SERIAL_BAUD_RATE}`);
});

port.on('error', (err) => {
  console.error('[RFID-BRIDGE] Serial error:', err.message);
});

// --- Setup WebSocket Server ---
const wss = new WebSocket.Server({ port: WS_PORT, path: WS_PATH }, () => {
  console.log(`[RFID-BRIDGE] WebSocket listening on ws://localhost:${WS_PORT}${WS_PATH}`);
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