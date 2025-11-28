// seed.js
// Skrip ini digunakan untuk mengisi Firebase Realtime Database dengan data awal.
// Jalankan sekali dengan perintah: node seed.js

const admin = require('firebase-admin');

// Gunakan file kredensial yang sama dengan server.js (path disesuaikan)
const serviceAccount = require('./smartsouvenirshop-firebase-adminsdk-fbsvc-f144c749cb.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://smartsouvenirshop-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

// Salin data awal dari mockDB di server.js lama Anda
const initialData = {
    Products: {

    },
    RfidTags: {

    },
    Transactions: {

    },
    TransactionItems: {

    },
    Users: {
        "1": {
            id: 1,
            username: 'admin',
            role: 'admin',
            // Hash untuk password 'admin123'
            passwordHash: '$2b$10$HbEKd68m4EtcSC4OVI43ru.KUul8sSFoTnrJkik50h8nOkthEA0E.' // <-- GANTI INI DENGAN HASH YANG ANDA SALIN DARI TERMINAL
        }
    },
    Settings: {
        lowStockThreshold: 5
    },
    // Counter untuk ID otomatis
    _counters: {
        productId: 3,
        itemId: 3,
        discountId: 0,
        transactionId: 2, // Counter untuk transaksi (saat ini tidak digunakan)
        rfidTagId: 4      // Counter untuk tag RFID (saat ini tidak digunakan)
    }
};

async function seedDatabase() {
    console.log('Starting database seed...');

    try {
        // Cek apakah counter sudah ada
        const counterSnapshot = await db.ref('_counters').once('value');
        if (counterSnapshot.exists()) {
            console.log('Counters already exist, skipping counter initialization.');
            // Hapus counter dari data yang akan di-seed agar tidak menimpa
            delete initialData._counters;
        }

        // Gunakan update() untuk menimpa data utama tanpa menghapus _counters yang sudah ada.
        // Jika Anda ingin reset total, ganti update() dengan set() lagi.
        await db.ref().update(initialData);

        console.log('✅ Database seeded successfully!');

    } catch (error) {
        console.error('🔥 Error seeding database:', error);
    } finally {
        // Tutup koneksi setelah selesai
        process.exit(0);
    }
}

seedDatabase();
