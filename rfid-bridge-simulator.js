// rfid-bridge-simulator.js
// Mensimulasikan jembatan RFID dengan menerima input UID dari terminal.
// Berguna untuk pengembangan frontend tanpa perlu hardware Arduino.

const WebSocket = require('ws');
const readline = require('readline'); // BARU: Modul untuk membaca input terminal

// Port WebSocket yang akan diakses frontend (HARUS SAMA DENGAN DI app.js)
const WS_PORT = 8080;
const WS_PATH = '/ws/rfid';

// --- Setup WebSocket Server ---
const wss = new WebSocket.Server({ port: WS_PORT, path: WS_PATH }, () => {
  console.log(`[RFID-SIMULATOR] WebSocket listening on ws://localhost:${WS_PORT}${WS_PATH}`);
  console.log('[RFID-SIMULATOR] Ready to accept UID input from terminal.');
  console.log('[RFID-SIMULATOR] Type a UID and press Enter to send.');
  console.log('[RFID-SIMULATOR] Press Ctrl+C to stop.');
});

wss.on('connection', (ws) => {
  console.log('[RFID-SIMULATOR] Frontend connected');
  ws.send(JSON.stringify({ type: 'info', message: 'Connected to RFID Simulator' }));
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// --- BARU: Logika Simulasi via Terminal Input ---
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'Enter UID > '
});

rl.prompt();

rl.on('line', (line) => {
  const uid = line.trim();
  if (uid) {
    console.log(`[RFID-SIMULATOR] Sending UID: ${uid}`);
    broadcast({ type: 'rfid', rfid: uid, timestamp: Date.now() });
  }
  rl.prompt();
});

rl.on('close', () => {
  console.log('\n[RFID-SIMULATOR] Exiting...');
  process.exit(0);
});