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
const cors = require('cors'); // Diperlukan agar frontend bisa memanggil API ini
const admin = require('firebase-admin');
const crypto = require('crypto');
const midtransClient = require('midtrans-client'); // BARU: Import Midtrans
const app = express();
const PORT = 3000; // Port untuk backend API

app.use(cors()); // Izinkan Cross-Origin Resource Sharing
app.use(express.json()); // Izinkan server menerima data JSON

// --- BARU: Inisialisasi Firebase Admin SDK ---
// Menggunakan file kredensial yang Anda berikan.
const serviceAccount = require('./smartsouvenirshop-firebase-adminsdk-fbsvc-087dafbe12.json'); // Path relatif ke file kredensial

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // URL Realtime Database Anda dari proyek 'smartsouvenirshop'
    databaseURL: "https://smartsouvenirshop-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database(); // Objek untuk berinteraksi dengan Realtime Database

// --- BARU: Konfigurasi Midtrans ---
// PENTING: Ganti dengan kunci dari akun Midtrans Sandbox Anda.
// Di aplikasi produksi, SIMPAN INI DI ENVIRONMENT VARIABLES, JANGAN DI KODE!
const snap = new midtransClient.Snap({
    isProduction: false, // Set 'true' untuk mode produksi
    serverKey: 'Mid-server-ba2imHhzyR-OCWCkcf-CagIK',
    clientKey: 'Mid-client-78vkOQH-Z-1W_t3b'
});

// ===========================================

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

/**
 * [POST] /api/create-payment
 */
app.post('/api/create-payment', async (req, res) => {
    const {
        uids,
        totalAmount,
        item_details // BARU: Terima detail item dari frontend
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
            payment_status: 'pending', // Status awal
            created_at: new Date().toISOString()
        };

        // Simpan transaksi ke Firebase
        await db.ref(`Transactions/${transaction_id}`).set(newTransaction);
        console.log(`Transaction ${transaction_id} created in Firebase with status 'pending'.`);

        // Simpan item-item transaksi
        for (const uid of uids) {
            const tagSnapshot = await db.ref(`RfidTags/${uid}`).once('value');
            const tag = tagSnapshot.val();
            if (tag) {
                const productSnapshot = await db.ref(`Products/${tag.product_id}`).once('value');
                const product = productSnapshot.val();
                if (product) {
                    // PERBAIKAN: Gunakan metode transaction untuk mendapatkan ID item berikutnya secara aman.
                    const counterRef = db.ref('_counters/itemId');
                    const result = await counterRef.transaction(currentValue => (currentValue || 0) + 1);
                    if (!result.committed) throw new Error('Failed to increment item ID counter.');
                    const newItemId = result.snapshot.val();
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

        const parameters = {
            "transaction_details": {
                "order_id": transaction_id,
                "gross_amount": totalAmount
            },
            "item_details": item_details,
            // PERUBAHAN: Hanya aktifkan pembayaran QRIS (di Snap diwakili oleh 'gopay')
            "enabled_payments": ["gopay"]
        };

        const midtransTransaction = await snap.createTransaction(parameters);
        const transactionToken = midtransTransaction.token;

        console.log(`Midtrans token created for TX ID: ${transaction_id}`);
        res.status(201).json({ token: transactionToken, transaction_id: transaction_id });

    } catch (error) {
        console.error('Error creating payment:', error);
        res.status(500).json({ error: 'Failed to create payment transaction.' });
    }
});

/**
 * [POST] /api/payment-webhook
 */
app.post('/api/payment-webhook', async (req, res) => {
    const notification = req.body;
    console.log('Midtrans notification received:', JSON.stringify(notification, null, 2));

    try {
        // 1. Verifikasi notifikasi dari Midtrans
        const statusResponse = await snap.transaction.notification(notification);
        const orderId = statusResponse.order_id;
        const transactionStatus = statusResponse.transaction_status;
        const fraudStatus = statusResponse.fraud_status;

        console.log(`Transaction notification received. Order ID: ${orderId}, Transaction Status: ${transactionStatus}, Fraud Status: ${fraudStatus}`);

        // 2. Logika untuk menangani status pembayaran
        // Hanya proses jika transaksi berhasil dan aman
        if (transactionStatus == 'capture' || transactionStatus == 'settlement') {
            if (fraudStatus == 'accept') {
                // Pembayaran berhasil dan aman, update database Anda
                const txRef = db.ref(`Transactions/${orderId}`);
                
                // Pastikan transaksi ada sebelum update
            const txSnapshot = await txRef.once('value');
            if (!txSnapshot.exists()) return res.status(404).send('Transaction not found');

            await txRef.update({ payment_status: 'completed' });
                console.log(`TX ID: ${orderId} marked as COMPLETED.`);

                const itemsSnapshot = await db.ref('TransactionItems').orderByChild('transaction_id').equalTo(orderId).once('value');
            if (itemsSnapshot.exists()) {
                const updates = {};
                itemsSnapshot.forEach(itemSnap => {
                    const item = itemSnap.val();
                    // BARU: Alih-alih mengubah status, kita hapus tag dengan mengaturnya ke null
                    updates[`/RfidTags/${item.uid_scanned}`] = null;
                });
                await db.ref().update(updates);
                    console.log(`All tags for TX ID ${orderId} have been DELETED from the database.`);
                }
            }
        }
        // Kirim respons OK ke Midtrans agar tidak mengirim notifikasi berulang
        res.status(200).send('OK');

    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * [GET] /api/receipt/:transaction_id
 * Endpoint baru untuk menghasilkan data teks struk untuk dicetak.
 */
app.get('/api/receipt/:transaction_id', async (req, res) => {
    const { transaction_id } = req.params;

    try {
        // 1. Ambil data transaksi utama
        const txSnapshot = await db.ref(`Transactions/${transaction_id}`).once('value');
        if (!txSnapshot.exists()) {
            return res.status(404).json({ error: 'Transaction not found' });
        }
        const transaction = txSnapshot.val();

        // 2. Ambil semua item yang terkait dengan transaksi ini
        const itemsSnapshot = await db.ref('TransactionItems').orderByChild('transaction_id').equalTo(transaction_id).once('value');
        if (!itemsSnapshot.exists()) {
            return res.status(404).json({ error: 'Transaction items not found' });
        }

        // 3. Format data untuk dicetak
        let receiptText = "";
        const line = "--------------------------------";

        receiptText += "       Smart Souvenir\n";
        receiptText += "      Jl. Ahmad Yani No. 1\n";
        receiptText += "           Surabaya\n";
        receiptText += "   Telp: 0812-3456-7890\n";
        receiptText += "Email: contact@smartsouvenir.com\n";
        receiptText += line + "\n";
        receiptText += `ID: ${transaction.transaction_id}\n`;
        receiptText += `Tgl: ${new Date(transaction.created_at).toLocaleString('id-ID')}\n`;
        receiptText += line + "\n\n";

        let subtotal = 0;
        const productQuantities = {};

        // Agregasi produk
        for (const itemId in itemsSnapshot.val()) {
            const item = itemsSnapshot.val()[itemId];
            subtotal += item.price_at_sale;
            if (productQuantities[item.product_id]) {
                productQuantities[item.product_id].qty++;
            } else {
                const productSnapshot = await db.ref(`Products/${item.product_id}`).once('value');
                productQuantities[item.product_id] = {
                    name: productSnapshot.val()?.name || 'Unknown Product',
                    price: item.price_at_sale,
                    qty: 1
                };
            }
        }

        for (const productId in productQuantities) {
            const p = productQuantities[productId];
            receiptText += `${p.name}\n`;
            receiptText += `  ${p.qty} x ${p.price.toLocaleString('id-ID')} = ${(p.qty * p.price).toLocaleString('id-ID')}\n`;
        }

        receiptText += `\n${line}\n`;
        receiptText += `Subtotal:   ${subtotal.toLocaleString('id-ID')}\n`;
        receiptText += `Diskon:     ${(subtotal - transaction.total_amount).toLocaleString('id-ID')}\n`;
        receiptText += `Total:      ${transaction.total_amount.toLocaleString('id-ID')}\n\n`;
        receiptText += "   Terima Kasih Atas Kunjungan Anda\n";

        // BARU: Tampilkan struk di konsol server untuk debugging
        console.log(`\n--- [SERVER] GENERATED RECEIPT FOR TX: ${transaction_id} ---`);
        console.log(receiptText);
        console.log('-----------------------------------------------------\n');

        res.type('text/plain').send(receiptText);

    } catch (error) {
        console.error('Error generating receipt:', error);
        res.status(500).json({ error: 'Failed to generate receipt' });
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

// --- 🛡️ MIDDLEWARE BARU UNTUK MEMVERIFIKASI FIREBASE ID TOKEN ---
const verifyFirebaseToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <TOKEN>

    if (!token) {
        return res.status(403).json({ message: 'A token is required for authentication' });
    }

    try {
        // Verifikasi token menggunakan Firebase Admin SDK
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken; // Simpan info user yang sudah diverifikasi di request
        console.log(`Authenticated user: ${req.user.email} (UID: ${req.user.uid})`);
        return next();
    } catch (error) {
        console.error('Error verifying Firebase ID token:', error);
        return res.status(401).json({ message: 'Invalid or expired token.' });
    }
};

// --- 👨‍💼 ENDPOINT UNTUK ADMIN PANEL (DILINDUNGI) ---

/**
 * [GET] /api/admin/settings
 * Mengambil pengaturan global aplikasi.
 */
app.get('/api/admin/settings', verifyFirebaseToken, async (req, res) => {
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
app.put('/api/admin/settings', verifyFirebaseToken, async (req, res) => {
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
app.get('/api/admin/products', verifyFirebaseToken, async (req, res) => {
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
app.post('/api/admin/products/define', verifyFirebaseToken, async (req, res) => {
    const { name, price } = req.body;

    if (!name || !price) {
        return res.status(400).json({ error: 'Name and price are required' });
    }

    try {
        const counterRef = db.ref('_counters/productId');
        const result = await counterRef.transaction(currentValue => (currentValue || 0) + 1);
        if (!result.committed) throw new Error('Failed to increment product ID counter.');
        const newProductId = result.snapshot.val();

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
app.post('/api/admin/rfid/register', verifyFirebaseToken, async (req, res) => {
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
app.put('/api/admin/products/define/:id', verifyFirebaseToken, async (req, res) => {
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
app.delete('/api/admin/products/define/:id', verifyFirebaseToken, async (req, res) => {
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
app.get('/api/admin/discounts', verifyFirebaseToken, async (req, res) => {
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
app.post('/api/admin/discounts', verifyFirebaseToken, async (req, res) => {
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
        const counterRef = db.ref('_counters/discountId');
        const result = await counterRef.transaction(currentValue => (currentValue || 0) + 1);
        if (!result.committed) throw new Error('Failed to increment discount ID counter.');
        const newDiscountId = result.snapshot.val();

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
app.delete('/api/admin/discounts/:id', verifyFirebaseToken, async (req, res) => {
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
app.put('/api/admin/discounts/:id/toggle', verifyFirebaseToken, async (req, res) => {
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
app.get('/api/admin/inventory', verifyFirebaseToken, async (req, res) => {
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
app.get('/api/admin/inventory/details/:id', verifyFirebaseToken, async (req, res) => {
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
app.put('/api/admin/rfid/deactivate/:uid', verifyFirebaseToken, async (req, res) => {
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
app.put('/api/admin/rfid/reactivate/:uid', verifyFirebaseToken, async (req, res) => {
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
app.delete('/api/admin/rfid/delete/:uid', verifyFirebaseToken, async (req, res) => {
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
app.get('/api/admin/tag-details/:uid', verifyFirebaseToken, async (req, res) => {
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
app.get('/api/admin/reports', verifyFirebaseToken, async (req, res) => {
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
    console.log(`PENTING: Pastikan URL webhook di portal Midtrans telah dikonfigurasi.`);
    console.log(`============================================`);
});