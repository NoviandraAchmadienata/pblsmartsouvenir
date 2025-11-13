// server.js
// Untuk menjalankan:
// 1. Buat folder proyek
// 2. Simpan file ini sebagai server.js
// 3. Buka terminal di folder itu
// 4. jalankan: npm init -y
// 5. jalankan: npm install express cors
// 6. jalankan: npm install jsonwebtoken bcryptjs
// 7. jalankan: node server.js

const express = require('express');
const jwt = require('jsonwebtoken'); // Untuk otentikasi
const bcrypt = require('bcryptjs'); // Untuk hash password
const cors = require('cors'); // Diperlukan agar frontend bisa memanggil API ini
const admin = require('firebase-admin');
const crypto = require('crypto');
const app = express();
const PORT = 3000; // Port untuk backend API

app.use(cors()); // Izinkan Cross-Origin Resource Sharing
app.use(express.json()); // Izinkan server menerima data JSON

// --- BARU: Inisialisasi Firebase Admin SDK ---
// Menggunakan file kredensial yang Anda berikan.
const serviceAccount = require('./smartsouvenirshop-firebase-adminsdk-fbsvc-087dafbe12.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // URL Realtime Database Anda dari proyek 'smartsouvenirshop'
    databaseURL: "https://smartsouvenirshop-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database(); // Objek untuk berinteraksi dengan Realtime Database

// Kunci rahasia untuk JWT. Di aplikasi produksi, ini HARUS disimpan di environment variable.
const JWT_SECRET = 'your-super-secret-key-that-is-long-and-secure';

// // --- DIKEMBALIKAN: Konfigurasi untuk Integrasi BRI API (dinonaktifkan) ---
// // Di aplikasi produksi, SIMPAN INI DI ENVIRONMENT VARIABLES, JANGAN DI KODE!
// const BRI_API_CONFIG = {
//     baseUrl: 'https://sandbox.partner.api.bri.co.id', // URL Sandbox
//     clientId: 'S4VAsHIGUGNaq1A7mG8bePuigkVqsgwd', // Diambil dari Consumer Key Anda
//     clientSecret: 'MPlHG9OaArwGMexV', // Diambil dari Consumer Secret Anda
//     merchantId: 'YOUR_MERCHANT_ID', // Ganti dengan Merchant ID Anda
//     terminalId: 'YOUR_TERMINAL_ID' // Ganti dengan Terminal ID Anda
// };

// // Variabel untuk menyimpan token BRI dan waktu kedaluwarsanya (dinonaktifkan)
// let briApiToken = null;
// let briTokenExpiresAt = 0;


// === MOCK DATABASE (DATABASE SEMENTARA) ===
// Kita akan tetap menggunakan sebagian mockDB untuk data yang belum dimigrasi
let mockDB = {
    // mockDB dikosongkan karena semua data persisten sekarang dikelola oleh Firebase.
    // Hanya data non-persisten (jika ada) yang boleh ada di sini.
};

// // Inisialisasi: Jika Anda ingin membuat hash baru saat server start
// (async () => {
//     const salt = await bcrypt.genSalt(10);
//     const hash = await bcrypt.hash('admin123', salt);
//     console.log('--- HASH BARU UNTUK "admin123" ---');
//     console.log(hash);
//     console.log('--- SALIN HASH DI ATAS DAN PASTE KE seed.js ---');
// })();

// ===========================================

// --- 🔐 ENDPOINT UNTUK OTENTIKASI ---
app.post('/api/auth/login', async (req, res) => {
    const {
        username,
        password
    } = req.body;
    // Ambil data user dari Firebase
    const usersSnapshot = await db.ref('Users').orderByChild('username').equalTo(username).once('value');
    const usersData = usersSnapshot.val();

    if (!usersData) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const userId = Object.keys(usersData)[0];
    const user = usersData[userId];

    const isMatch = await bcrypt.compare(password, user.passwordHash);

    if (user && isMatch) {
        const token = jwt.sign({
            userId: user.id,
            role: user.role
        }, JWT_SECRET, {
            expiresIn: '8h'
        });
        res.json({
            success: true,
            token
        });
    } else {
        res.status(401).json({
            success: false,
            message: 'Invalid credentials'
        });
    }
});

// --- 💰 ENDPOINT UNTUK DISKON (Publik) ---

/**
 * [GET] /api/discounts
 * Dipanggil oleh kiosk pelanggan untuk mendapatkan info diskon saat ini.
 */
app.get('/api/discounts', async (req, res) => {
    try {
        const discountsSnapshot = await db.ref('Discounts').once('value');
        const allDiscounts = discountsSnapshot.val() || {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const activeDiscounts = Object.values(allDiscounts).filter(d => {
            if (!d.isActive) return false;
            if (d.startDate && d.endDate) {
                return today >= new Date(d.startDate) && today <= new Date(d.endDate);
            }
            return true;
        });
        res.json(activeDiscounts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch discounts' });
    }
});


// --- 🖥️ ENDPOINT UNTUK KIOS PELANGGAN ---

/**
 * [GET] /api/product/:uid
 */
app.get('/api/product/:uid', async (req, res) => {
    const { uid } = req.params;
    console.log(`Kiosk scan request for UID: ${uid}`);

    try {
        // 1. Ambil data tag dari Firebase
        const tagSnapshot = await db.ref(`RfidTags/${uid}`).once('value');
        const tag = tagSnapshot.val();

        if (!tag) {
            return res.status(404).json({ error: 'UID not recognized' });
        }
        if (tag.status !== 'active') {
            return res.status(400).json({ error: `Item is not for sale (status: ${tag.status})` });
        }

        // 2. Ambil data produk dari Firebase berdasarkan product_id dari tag
        const productSnapshot = await db.ref(`Products/${tag.product_id}`).once('value');
        const product = productSnapshot.val();

        if (!product) {
            return res.status(500).json({ error: 'Data integrity error: Product definition not found' });
        }

        res.json({ uid: uid, product_id: tag.product_id, ...product });
    } catch (error) {
        console.error('Error fetching product by UID:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// // --- DIKEMBALIKAN: Fungsi Helper untuk Otentikasi BRI API (dinonaktifkan) ---
// async function getBriApiToken() {
//     // Jika token masih ada dan belum kedaluwarsa (dengan buffer 60 detik), gunakan token yang ada.
//     if (briApiToken && Date.now() < briTokenExpiresAt - 60000) {
//         return briApiToken;
//     }

//     console.log('Requesting new BRI API token...');
//     try {
//         const response = await fetch(`${BRI_API_CONFIG.baseUrl}/oauth/v1/token`, {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/x-www-form-urlencoded'
//             },
//             body: new URLSearchParams({
//                 'client_id': BRI_API_CONFIG.clientId,
//                 'client_secret': BRI_API_CONFIG.clientSecret
//             })
//         });

//         const data = await response.json();
//         if (!response.ok || !data.access_token) {
//             throw new Error(data.status.message || 'Failed to get BRI API token');
//         }

//         briApiToken = data.access_token;
//         // Simpan waktu kedaluwarsa (dalam milidetik)
//         briTokenExpiresAt = Date.now() + (parseInt(data.expires_in) * 1000);
//         console.log('Successfully obtained new BRI API token.');
//         return briApiToken;
//     } catch (error) {
//         console.error('Error getting BRI API token:', error);
//         throw error; // Lemparkan error agar bisa ditangani oleh pemanggil
//     }
// }
/**
 * [POST] /api/create-payment
 */
app.post('/api/create-payment', async (req, res) => {
    const {
        uids,
        totalAmount
    } = req.body;

    if (!uids || !Array.isArray(uids) || uids.length === 0) {
        return res.status(400).json({ error: 'Invalid cart data' });
    }

    try {
        // Mengembalikan logika pembuatan ID transaksi ke format string berbasis waktu
        const now = new Date();
        const timestampPart = now.getFullYear().toString() +
            (now.getMonth() + 1).toString().padStart(2, '0') +
            now.getDate().toString().padStart(2, '0') +
            now.getHours().toString().padStart(2, '0') +
            now.getMinutes().toString().padStart(2, '0') +
            now.getSeconds().toString().padStart(2, '0');

        const randomPart = crypto.randomInt(100, 999).toString();
        const transaction_id = `${timestampPart}${randomPart}`;

        const newTransaction = {
            transaction_id: transaction_id,
            total_amount: totalAmount,
            payment_status: 'pending',
            qris_charge_id: `mock-qris-${transaction_id}`,
            created_at: new Date().toISOString()
        };

        // Simpan transaksi ke Firebase
        await db.ref(`Transactions/${transaction_id}`).set(newTransaction);

        // Simpan item-item transaksi
        for (const uid of uids) {
            const tagSnapshot = await db.ref(`RfidTags/${uid}`).once('value');
            const tag = tagSnapshot.val();
            if (tag) {
                const productSnapshot = await db.ref(`Products/${tag.product_id}`).once('value');
                const product = productSnapshot.val();
                if (product) {
                    const newItemId = await getNextId('itemId');
                    const newItem = {
                        item_id: newItemId,
                        transaction_id: transaction_id,
                        product_id: tag.product_id,
                        uid_scanned: uid,
                        price_at_sale: product.price
                    };
                    await db.ref(`TransactionItems/${newItemId}`).set(newItem);
                }
            }
        }

        // --- DIKEMBALIKAN: Gunakan URL mock QR code ---
        console.log(`Payment created (pending) for TX ID: ${transaction_id}, Amount: ${totalAmount}`);
        const mockQrisUrl = `https://api.qrserver.com/v1/create-qr-code/?data=PAY-TX-${transaction_id}-AMOUNT-${totalAmount}`;

        res.status(201).json({
            transaction_id: transaction_id,
            qrisUrl: mockQrisUrl, // Kembalikan ke qrisUrl
            totalAmount: totalAmount
        });
    } catch (error) {
        console.error('Error creating payment:', error);
        res.status(500).json({ error: 'Failed to create payment transaction.' });
    }
});

/**
 * [POST] /api/payment-webhook
 */
app.post('/api/payment-webhook', async (req, res) => {
    // Sesuaikan dengan payload dari notifikasi BRI
    const { invoiceId, transactionStatus } = req.body;

    // Untuk simulasi, kita tetap terima format lama
    const finalInvoiceId = invoiceId || req.body.order_id;
    const finalStatus = transactionStatus || req.body.transaction_status;

    console.log(`Webhook received for TX ID: ${finalInvoiceId}, Status: ${finalStatus}`);
    try {
        // Status 'Paid' dari BRI atau 'completed' dari simulasi
        if (finalStatus === 'Paid' || finalStatus === 'completed') {
            const txRef = db.ref(`Transactions/${finalInvoiceId}`);
            const txSnapshot = await txRef.once('value');
            if (!txSnapshot.exists()) return res.status(404).send('Transaction not found');

            await txRef.update({ payment_status: 'completed' });
            console.log(`TX ID: ${finalInvoiceId} marked as COMPLETED.`);

            const itemsSnapshot = await db.ref('TransactionItems').orderByChild('transaction_id').equalTo(finalInvoiceId).once('value');
            if (itemsSnapshot.exists()) {
                const updates = {};
                itemsSnapshot.forEach(itemSnap => {
                    const item = itemSnap.val();
                    // BARU: Alih-alih mengubah status, kita hapus tag dengan mengaturnya ke null
                    updates[`/RfidTags/${item.uid_scanned}`] = null;
                });
                await db.ref().update(updates);
                console.log(`All tags for TX ID ${finalInvoiceId} have been DELETED from the database.`);
            }
        }
        res.status(200).send('OK');
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Internal Server Error');
    }
});

// --- 🚧 ENDPOINT UNTUK RFID GATE ---

/**
 * [GET] /api/gate/check/:uid
 */
app.get('/api/gate/check/:uid', async (req, res) => {
    const { uid } = req.params;
    try {
        const tagSnapshot = await db.ref(`RfidTags/${uid}`).once('value');
        if (!tagSnapshot.exists()) {
            return res.json({ allow: false, reason: 'UID not recognized' });
        }

        const tag = tagSnapshot.val();
        if (tag.status === 'sold') {
            return res.json({ allow: true });
        } else {
            return res.json({
                allow: false,
                reason: `Item not paid (status: ${tag.status})`
            });
        }
    } catch (error) {
        console.error('Gate check error:', error);
        res.status(500).json({ allow: false, reason: 'Server error' });
    }
});

// --- 🛡️ MIDDLEWARE UNTUK MELINDUNGI RUTE ADMIN ---
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <TOKEN>

    if (!token) {
        return res.status(403).json({
            message: 'A token is required for authentication'
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Simpan info user di request
    } catch (err) {
        return res.status(401).json({
            message: 'Invalid Token'
        });
    }

    // Pastikan user adalah admin
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            message: 'Access denied. Admin role required.'
        });
    }

    return next();
};

// --- 👨‍💼 ENDPOINT UNTUK ADMIN PANEL (DILINDUNGI) ---

// --- FUNGSI HELPER BARU untuk ID ---
async function getNextId(counterName) {
    const counterRef = db.ref(`_counters/${counterName}`);
    const result = await counterRef.transaction(currentValue => {
        // Jika counter belum ada, inisialisasi dengan 1. Jika sudah ada, tambahkan 1.
        return (currentValue || 0) + 1;
    });
    // `result.snapshot.val()` akan berisi nilai baru setelah transaksi selesai.
    return result.snapshot.val();
}

/**
 * [GET] /api/admin/settings
 * Mengambil pengaturan global aplikasi.
 */
app.get('/api/admin/settings', verifyToken, async (req, res) => {
    try {
        const settingsSnapshot = await db.ref('Settings').once('value');
        res.json(settingsSnapshot.val() || { lowStockThreshold: 5 }); // Default value
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

/**
 * [PUT] /api/admin/settings
 * Memperbarui pengaturan global aplikasi.
 */
app.put('/api/admin/settings', verifyToken, async (req, res) => {
    const {
        lowStockThreshold
    } = req.body;

    if (lowStockThreshold === undefined || typeof lowStockThreshold !== 'number' || lowStockThreshold < 0) {
        return res.status(400).json({
            error: 'Invalid low stock threshold value.'
        });
    }

    try {
        await db.ref('Settings').update({ lowStockThreshold });
        console.log(`Low stock threshold updated to: ${lowStockThreshold}`);
        res.json({
            success: true,
            message: 'Settings updated successfully!',
            settings: { lowStockThreshold }
        });
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});


/**
 * [GET] /api/admin/products
 */
app.get('/api/admin/products', verifyToken, async (req, res) => {
    try {
        const productsRef = db.ref('Products');
        const snapshot = await productsRef.once('value');
        const productsData = snapshot.val();

        if (productsData) {
            const productList = Object.keys(productsData).map(key => ({
                product_id: key,
                ...productsData[key]
            }));
            res.json(productList);
        } else {
            res.json([]); // Kirim array kosong jika tidak ada produk
        }
    } catch (error) {
        console.error('Error fetching products from Realtime Database:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * [POST] /api/admin/products/define
 */
app.post('/api/admin/products/define', verifyToken, async (req, res) => {
    const { name, price } = req.body;

    if (!name || !price) {
        return res.status(400).json({ error: 'Name and price are required' });
    }

    try {
        const newProductId = await getNextId('productId');
        const newProduct = {
            name,
            price: parseFloat(price)
        };

        await db.ref(`Products/${newProductId}`).set(newProduct);

        const responseData = { product_id: newProductId, ...newProduct };
        console.log('New product defined:', responseData);
        res.status(201).json(responseData);
    } catch (error) {
        console.error('Error defining new product:', error);
        res.status(500).json({ error: 'Failed to create product.' });
    }
});

/**
 * [POST] /api/admin/rfid/register
 */
app.post('/api/admin/rfid/register', verifyToken, async (req, res) => {
    const { product_id, uid } = req.body;

    if (!product_id || !uid) {
        return res.status(400).json({ error: 'product_id and uid are required' });
    }

    try {
        const productSnapshot = await db.ref(`Products/${product_id}`).once('value');
        if (!productSnapshot.exists()) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const tagSnapshot = await db.ref(`RfidTags/${uid}`).once('value');
        if (tagSnapshot.exists()) {
            return res.status(400).json({ error: 'RFID Tag already registered' });
        }

        const newTag = {
            product_id: parseInt(product_id),
            status: 'active'
        };

        await db.ref(`RfidTags/${uid}`).set(newTag);

        console.log(`Tag ${uid} registered to product ${product_id}`);
        res.status(201).json({ success: true, uid: uid, ...newTag });
    } catch (error) {
        console.error('Error registering RFID tag:', error);
        res.status(500).json({ error: 'Failed to register tag.' });
    }
});

/**
 * [PUT] /api/admin/products/define/:id
 */
app.put('/api/admin/products/define/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    const { name, price } = req.body;

    if (!name || typeof price !== 'number' || price < 0) {
        return res.status(400).json({ error: 'Invalid name or price provided.' });
    }

    try {
        const productRef = db.ref(`Products/${id}`);
        const snapshot = await productRef.once('value');
        if (!snapshot.exists()) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const updates = { name, price: parseFloat(price) };
        await productRef.update(updates);

        const updatedProductData = { product_id: parseInt(id), ...updates };
        console.log(`Product ID ${id} updated:`, updatedProductData);
        res.json(updatedProductData);
    } catch (error) {
        console.error(`Error updating product ${id}:`, error);
        res.status(500).json({ error: 'Failed to update product.' });
    }
});

/**
 * [DELETE] /api/admin/products/define/:id
 */
app.delete('/api/admin/products/define/:id', verifyToken, async (req, res) => {
    const { id } = req.params;
    console.log(`Delete request received for Product ID: ${id}`);

    try {
        const productSnapshot = await db.ref(`Products/${id}`).once('value');
        if (!productSnapshot.exists()) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const tagsSnapshot = await db.ref('RfidTags').orderByChild('product_id').equalTo(parseInt(id)).once('value');
        let activeTagCount = 0;
        if (tagsSnapshot.exists()) {
            tagsSnapshot.forEach(tagSnap => {
                if (tagSnap.val().status === 'active') {
                    activeTagCount++;
                }
            });
        }

        if (activeTagCount > 0) {
            return res.status(400).json({
                error: `Cannot delete product. It is still associated with ${activeTagCount} active RFID tag(s).`
            });
        }

        await db.ref(`Products/${id}`).remove();

        console.log(`Product ID ${id} deleted successfully.`);
        res.status(200).json({ success: true, message: 'Product deleted' });
    } catch (error) {
        console.error(`Error deleting product ${id}:`, error);
        res.status(500).json({ error: 'Failed to delete product.' });
    }
});

/**
 * [GET] /api/admin/discounts
 */
app.get('/api/admin/discounts', verifyToken, async (req, res) => {
    try {
        const snapshot = await db.ref('Discounts').once('value');
        const discounts = snapshot.val() ? Object.values(snapshot.val()) : [];
        res.json(discounts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch discounts' });
    }
});

/**
 * [POST] /api/admin/discounts
 */
app.post('/api/admin/discounts', verifyToken, async (req, res) => {
    const {
        name,
        percentage,
        targetType,
        targetId,
        startDate,
        endDate
    } = req.body;

    if (!name || typeof percentage !== 'number' || !targetType) {
        return res.status(400).json({
            error: 'Name, percentage, and target type are required.'
        });
    }

    try {
        const newDiscountId = await getNextId('discountId');
        const newDiscount = {
            id: newDiscountId,
            name,
            percentage,
            targetType,
            targetId: targetType === 'product' ? parseInt(targetId) : null,
            startDate: startDate || null,
            endDate: endDate || null,
            isActive: true
        };

        await db.ref(`Discounts/${newDiscountId}`).set(newDiscount);
        console.log('New discount rule created:', newDiscount);
        res.status(201).json(newDiscount);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create discount rule' });
    }
});

/**
 * [DELETE] /api/admin/discounts/:id
 */
app.delete('/api/admin/discounts/:id', verifyToken, async (req, res) => {
    const {
        id
    } = req.params;
    try {
        await db.ref(`Discounts/${id}`).remove();
        console.log(`Discount rule ID ${id} deleted.`);
        res.status(200).json({
            success: true,
            message: `Discount rule ID ${id} has been deleted.`
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete discount rule' });
    }
});

/**
 * [PUT] /api/admin/discounts/:id/toggle
 * Mengubah status aktif/tidak aktif sebuah aturan diskon.
 */
app.put('/api/admin/discounts/:id/toggle', verifyToken, async (req, res) => {
    const {
        id
    } = req.params;
    try {
        const discountRef = db.ref(`Discounts/${id}`);
        const snapshot = await discountRef.once('value');
        if (!snapshot.exists()) {
            return res.status(404).json({ error: 'Discount rule not found' });
        }
        const discount = snapshot.val();
        const newStatus = !discount.isActive;
        await discountRef.update({ isActive: newStatus });

        console.log(`Discount rule ID ${id} status toggled to: ${newStatus}`);
        res.json({
            success: true,
            message: `Discount rule ID ${id} status changed to ${newStatus ? 'active' : 'inactive'}.`
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to toggle discount status' });
    }
});

// --- ENDPOINT INVENTORY (Tidak Berubah) ---

/**
 * [GET] /api/admin/inventory
 */
app.get('/api/admin/inventory', verifyToken, async (req, res) => {
    console.log('Inventory summary request received.');
    try {
        const tagsSnapshot = await db.ref('RfidTags').once('value');
        const productsSnapshot = await db.ref('Products').once('value');
        const settingsSnapshot = await db.ref('Settings').once('value');

        const allTags = tagsSnapshot.val() || {};
        const allProducts = productsSnapshot.val() || {};
        const settings = settingsSnapshot.val() || { lowStockThreshold: 5 };

        const inventoryCounts = {};
        // Inisialisasi counter untuk setiap produk
        for (const productId in allProducts) {
            inventoryCounts[productId] = { active: 0, deactivated: 0 };
        }

        // Hitung jumlah tag berdasarkan status
        for (const uid in allTags) {
            const tag = allTags[uid];
            const pid = tag.product_id;
            if (inventoryCounts[pid]) {
                if (tag.status === 'active') {
                    inventoryCounts[pid].active++;
                } else if (tag.status === 'deactivated') {
                    inventoryCounts[pid].deactivated++;
                }
            }
        }

        const inventoryList = Object.keys(allProducts).map(productId => {
            const product = allProducts[productId];
            const stock = inventoryCounts[productId]?.active || 0;
            const deactivatedStock = inventoryCounts[productId]?.deactivated || 0;
            return {
                product_id: parseInt(productId),
                name: product.name,
                stock: stock, // Stok aktif
                deactivatedStock: deactivatedStock, // Stok non-aktif
                isLowStock: stock < settings.lowStockThreshold
            };
        });
        res.json(inventoryList);
    } catch (error) {
        console.error('Error fetching inventory:', error);
        res.status(500).json({ error: 'Failed to fetch inventory' });
    }
});

/**
 * [GET] /api/admin/inventory/details/:id
 */
app.get('/api/admin/inventory/details/:id', verifyToken, async (req, res) => {
    const {
        id
    } = req.params;
    console.log(`UID detail request received for Product ID: ${id}`);
    try {
        // Modifikasi: Ambil semua tag untuk produk ini, bukan hanya yang aktif
        const tagsSnapshot = await db.ref('RfidTags').orderByChild('product_id').equalTo(parseInt(id)).once('value');
        const tagList = [];
        if (tagsSnapshot.exists()) {
            tagsSnapshot.forEach(snap => {
                tagList.push({ uid: snap.key, status: snap.val().status });
            });
        }
        res.json(tagList);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch UID details' });
    }
});

/**
 * [PUT] /api/admin/rfid/deactivate/:uid
 * Menonaktifkan sebuah tag RFID (misalnya karena hilang atau rusak).
 */
app.put('/api/admin/rfid/deactivate/:uid', verifyToken, async (req, res) => {
    const { uid } = req.params;
    try {
        const tagRef = db.ref(`RfidTags/${uid}`);
        const snapshot = await tagRef.once('value');
        if (!snapshot.exists()) {
            return res.status(404).json({ error: 'RFID Tag not found' });
        }
        const tag = snapshot.val();
        if (tag.status !== 'active') {
            return res.status(400).json({ error: `Tag is already inactive (status: ${tag.status})` });
        }

        await tagRef.update({ status: 'deactivated' });

        console.log(`Tag ${uid} has been deactivated.`);
        res.json({ success: true, message: `Tag ${uid} has been successfully deactivated.` });
    } catch (error) {
        console.error(`Error deactivating tag ${uid}:`, error);
        res.status(500).json({ error: 'Failed to deactivate tag.' });
    }
});

/**
 * [PUT] /api/admin/rfid/reactivate/:uid
 * Mengaktifkan kembali sebuah tag RFID yang sebelumnya dinonaktifkan.
 */
app.put('/api/admin/rfid/reactivate/:uid', verifyToken, async (req, res) => {
    const { uid } = req.params;
    try {
        const tagRef = db.ref(`RfidTags/${uid}`);
        const snapshot = await tagRef.once('value');
        if (!snapshot.exists()) {
            return res.status(404).json({ error: 'RFID Tag not found' });
        }
        const tag = snapshot.val();
        if (tag.status !== 'deactivated') {
            return res.status(400).json({ error: `Tag cannot be reactivated (current status: ${tag.status})` });
        }

        await tagRef.update({ status: 'active' });

        console.log(`Tag ${uid} has been reactivated.`);
        res.json({ success: true, message: `Tag ${uid} has been successfully reactivated.` });
    } catch (error) {
        console.error(`Error reactivating tag ${uid}:`, error);
        res.status(500).json({ error: 'Failed to reactivate tag.' });
    }
});

/**
 * [DELETE] /api/admin/rfid/delete/:uid
 * Menghapus sebuah tag RFID secara permanen dari database.
 */
app.delete('/api/admin/rfid/delete/:uid', verifyToken, async (req, res) => {
    const { uid } = req.params;
    try {
        const tagRef = db.ref(`RfidTags/${uid}`);
        const snapshot = await tagRef.once('value');
        if (!snapshot.exists()) {
            return res.status(404).json({ error: 'RFID Tag not found' });
        }

        await tagRef.remove();

        console.log(`Tag ${uid} has been permanently deleted.`);
        res.json({ success: true, message: `Tag ${uid} has been permanently deleted.` });
    } catch (error) {
        console.error(`Error deleting tag ${uid}:`, error);
        res.status(500).json({ error: 'Failed to delete tag.' });
    }
});

/**
 * [GET] /api/admin/tag-details/:uid
 * Mencari detail produk berdasarkan UID tag.
 */
app.get('/api/admin/tag-details/:uid', verifyToken, async (req, res) => {
    const { uid } = req.params;
    try {
        const tagRef = db.ref(`RfidTags/${uid}`);
        const tagSnapshot = await tagRef.once('value');
        if (!tagSnapshot.exists()) {
            return res.status(404).json({ error: 'Tag UID not found in the database.' });
        }
        const tag = tagSnapshot.val();
        const productId = tag.product_id;

        const productRef = db.ref(`Products/${productId}`);
        const productSnapshot = await productRef.once('value');
        if (!productSnapshot.exists()) {
            return res.status(404).json({ error: 'Associated product not found.' });
        }
        const product = productSnapshot.val();

        res.json({ productId, productName: product.name });
    } catch (error) {
        console.error(`Error fetching details for tag ${uid}:`, error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ==========================================

// ==========================================
// ===          KODE YANG DIPERBAIKI        ===
// ==========================================

/**
 * [GET] /api/admin/reports
 */
app.get('/api/admin/reports', verifyToken, async (req, res) => {
    const {
        period,
        startDate,
        endDate
    } = req.query;
    console.log(`Report requested for period: ${period}, Start: ${startDate}, End: ${endDate}`);

    try {
        const txsSnapshot = await db.ref('Transactions').once('value');
        const itemsSnapshot = await db.ref('TransactionItems').once('value');
        const productsSnapshot = await db.ref('Products').once('value');

        const allTransactions = txsSnapshot.val() ? Object.values(txsSnapshot.val()) : [];
        const allItems = itemsSnapshot.val() ? Object.values(itemsSnapshot.val()) : [];
        const allProducts = productsSnapshot.val() || {};

        let filteredTransactions = allTransactions.filter(t => t.payment_status === 'completed');

        if (period !== 'all') {
            let startRange, endRange;
            const today = new Date();

            if (period === 'custom' && startDate && endDate) {
                startRange = new Date(`${startDate}T00:00:00`);
                endRange = new Date(`${endDate}T23:59:59.999`);
            } else {
                endRange = new Date(today.getTime());
                endRange.setHours(23, 59, 59, 999);
                startRange = new Date(today.getTime());
                startRange.setHours(0, 0, 0, 0);

                switch (period) {
                    case 'weekly':
                        startRange.setDate(today.getDate() - 7);
                        break;
                    case 'monthly':
                        startRange.setMonth(today.getMonth() - 1);
                        break;
                    case 'yearly':
                        startRange.setFullYear(today.getFullYear() - 1);
                        break;
                }
            }

            filteredTransactions = filteredTransactions.filter(tx => {
                const txDate = new Date(tx.created_at);
                return txDate >= startRange && txDate <= endRange;
            });
        }

        let totalSales = 0;
        let totalSubtotal = 0;
        let totalDiscount = 0;

        const formattedTransactions = filteredTransactions.map(tx => {
            totalSales += tx.total_amount;
            const itemsInTx = allItems.filter(item => item.transaction_id === tx.transaction_id);
            const subtotal = itemsInTx.reduce((acc, item) => acc + item.price_at_sale, 0);
            const discountAmount = subtotal - tx.total_amount;
            totalSubtotal += subtotal;
            totalDiscount += discountAmount;

            const productNames = itemsInTx.map(item => allProducts[item.product_id]?.name || 'Unknown').join(', ');

            return {
                transaction_id: tx.transaction_id,
                created_at: tx.created_at,
                total_amount: tx.total_amount,
                subtotal: subtotal,
                discount_amount: discountAmount,
                payment_status: tx.payment_status,
                item_count: itemsInTx.length,
                product_names: productNames || 'N/A'
            };
        });

        res.json({
            period: period || 'all-time',
            summary: {
                totalSales,
                totalSubtotal,
                totalDiscount,
                totalTransactions: filteredTransactions.length
            },
            transactions: formattedTransactions
        });

    } catch (error) {
        console.error('Error generating report:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});
// ==========================================
// ===      AKHIR DARI KODE PERBAIKAN     ===
// ==========================================


// --- SERVER START ---
app.listen(PORT, () => {
    console.log(`======= RFID Self-Service API Server =======`);
    console.log(`Backend berjalan di http://localhost:${PORT}`);
    // console.log(``);
    // console.log(`PENTING: Jika menggunakan ngrok, pastikan URL webhook di portal BRI adalah:`);
    // console.log(`https://astounding-uncalculated-valarie.ngrok-free.dev/api/payment-webhook`);
    console.log(`============================================`);
});