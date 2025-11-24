// rfid-bridge.js
// Jembatan: Arduino (serial) -> WebSocket -> Frontend kasir/admin

const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const WebSocket = require('ws');

// === GANTI SESUAI LAPTOP KAMU ===
// Windows: 'COM3', 'COM4', 'COM12', dst
const SERIAL_PORT_PATH = 'COM12';   // <--- PASTIIN SAMA DENGAN DI ARDUINO IDE
const SERIAL_BAUD_RATE = 9600;      // sama dengan Serial.begin(...) di Arduino

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
  console.error('>>> Cek lagi:');
  console.error('- Port sudah bener? (COM12, dll)');
  console.error('- Serial Monitor Arduino IDE SUDAH DITUTUP belum?');
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
parser.on('data', (line) => {
  const raw = line.toString().trim();
  if (!raw) return;

  // Kalau ada line non-UID (kayak "KASIR RFID READY"), log aja tapi skip
  if (/ready/i.test(raw)) {
    console.log('[RFID-BRIDGE] Info from Arduino:', raw);
    return;
  }

  const uid = raw; // contoh: "04A3F1B922"
  console.log(`[RFID-BRIDGE] UID from serial: ${uid}`);

  broadcast({ type: 'rfid', rfid: uid, timestamp: Date.now() });
});
