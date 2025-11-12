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
const crypto = require('crypto'); // Modul ini ada di file Anda
const app = express();
const PORT = 3000; // Port untuk backend API

app.use(cors()); // Izinkan Cross-Origin Resource Sharing
app.use(express.json()); // Izinkan server menerima data JSON

// Kunci rahasia untuk JWT. Di aplikasi produksi, ini HARUS disimpan di environment variable.
const JWT_SECRET = 'your-super-secret-key-that-is-long-and-secure';

// === MOCK DATABASE (DATABASE SEMENTARA) ===
let mockDB = {
    Products: {
        1: {
            name: 'Kaos Pens',
            price: 88000.00
        },
        2: {
            name: 'Keychain Pens"',
            price: 20000.00
        },
        3: {
            name: 'Tas Pens',
            price: 120000.00
        },
    },
    RfidTags: {
        'uid123': {
            product_id: 1,
            status: 'active'
        },
        'uid456': {
            product_id: 2,
            status: 'active'
        },
        'uid789': {
            product_id: 3,
            status: 'active'
        },
        'uid999': {
            product_id: 1,
            status: 'active'
        },
    },
    Transactions: [{
        transaction_id: 20251112204343926,
        total_amount: 176.000,
        payment_status: 'completed',
        qris_charge_id: 'mock-qris-1',
        created_at: '2025-11-12T11:03:37Z' 
    }, {
        transaction_id: 20251113204658219,
        total_amount: 108.000,
        payment_status: 'completed',
        qris_charge_id: 'mock-qris-2',
        created_at: '2025-11-13T20:46:31Z' 
    }],
    TransactionItems: [{
        item_id: 1,
        transaction_id: 1,
        product_id: 3,
        uid_scanned: 'uid789',
        price_at_sale: 88000.00
    }, {
        item_id: 2,
        transaction_id: 2,
        product_id: 1,
        uid_scanned: 'uid123',
        price_at_sale: 20000.00
    }],
    Discounts: [], // Diubah menjadi array untuk aturan diskon
    Users: [
        {
            id: 1,
            username: 'admin',
            // Password di-hash. Password aslinya adalah 'admin123'
            passwordHash: '$2a$10$E9.pG5s2s5.r5B/DIwU.X.eA.c.Zz.d.E.e.F.g.H.i.J.k.L.m.N', // Ini hanya contoh hash
            role: 'admin'
        }
    ],
    Settings: {
        lowStockThreshold: 5
    },

    // Untuk auto-increment ID
    _nextProductId: 4,
    _nextTransactionId: 3, 
    _nextItemId: 3, 
    _nextDiscountId: 1,
};

// Inisialisasi: Jika Anda ingin membuat hash baru saat server start
// (async () => {
//     const salt = await bcrypt.genSalt(10);
//     const hash = await bcrypt.hash('admin123', salt);
//     console.log('Hash untuk "admin123":', hash); 
//     // Ganti passwordHash di atas dengan hasil ini jika perlu
// })();

// ===========================================

// --- 🔐 ENDPOINT UNTUK OTENTIKASI ---
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = mockDB.Users.find(u => u.username === username);

    // Contoh perbandingan password (tanpa bcrypt untuk mockDB sederhana ini)
    if (user && password === 'admin123') { // Ganti dengan bcrypt.compare di DB asli
        // Buat Token
        const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// --- 💰 ENDPOINT UNTUK DISKON (Publik) ---

/**
 * [GET] /api/discounts
 * Dipanggil oleh kiosk pelanggan untuk mendapatkan info diskon saat ini.
 */
app.get('/api/discounts', (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    const activeDiscounts = mockDB.Discounts.filter(d => {
        if (!d.isActive) return false;
        if (d.startDate && d.endDate) {
            const startDate = new Date(d.startDate);
            const endDate = new Date(d.endDate);
            return today >= startDate && today <= endDate;
        }
        return true;
    });
    res.json(activeDiscounts);
});


// --- 🖥️ ENDPOINT UNTUK KIOS PELANGGAN ---

/**
 * [GET] /api/product/:uid
 */
app.get('/api/product/:uid', (req, res) => {
    const {
        uid
    } = req.params;
    const tag = mockDB.RfidTags[uid];

    console.log(`Kiosk scan request for UID: ${uid}`);

    if (!tag) {
        return res.status(404).json({
            error: 'UID not recognized'
        });
    }
    if (tag.status !== 'active') {
        return res.status(400).json({
            error: `Item is not for sale (status: ${tag.status})`
        });
    }
    const product = mockDB.Products[tag.product_id];
    if (!product) {
        return res.status(500).json({
            error: 'Data integrity error: Product definition not found'
        });
    }

    res.json({
        uid: uid,
        product_id: tag.product_id,
        name: product.name,
        price: product.price
    });
});

/**
 * [POST] /api/create-payment
 */
app.post('/api/create-payment', (req, res) => {
    const {
        uids,
        totalAmount
    } = req.body;

    if (!uids || !Array.isArray(uids) || uids.length === 0) {
        return res.status(400).json({
            error: 'Invalid cart data'
        });
    }

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
    mockDB.Transactions.push(newTransaction);

    for (const uid of uids) {
        const tag = mockDB.RfidTags[uid];
        if (tag) {
            const product = mockDB.Products[tag.product_id];
            const newItem = {
                item_id: mockDB._nextItemId++,
                transaction_id: transaction_id,
                product_id: tag.product_id,
                uid_scanned: uid,
                price_at_sale: product.price
            };
            mockDB.TransactionItems.push(newItem);
        }
    }

    console.log(`Payment created (pending) for TX ID: ${transaction_id}, Amount: ${totalAmount}`);

    const mockQrisUrl = `https://api.qrserver.com/v1/create-qr-code/?data=PAY-TX-${transaction_id}-AMOUNT-${totalAmount}`;

    res.status(201).json({
        transaction_id: transaction_id,
        qrisUrl: mockQrisUrl,
        totalAmount: totalAmount
    });
});

/**
 * [POST] /api/payment-webhook
 */
app.post('/api/payment-webhook', (req, res) => {
    const {
        order_id,
        transaction_status
    } = req.body;

    console.log(`Webhook received for TX ID: ${order_id}, Status: ${transaction_status}`);

    if (transaction_status === 'settlement' || transaction_status === 'completed') {
        const tx = mockDB.Transactions.find(t => t.transaction_id == order_id);
        if (tx) {
            tx.payment_status = 'completed';
            console.log(`TX ID: ${order_id} marked as COMPLETED.`);

            const itemsToUpdate = mockDB.TransactionItems.filter(item => item.transaction_id == order_id);
            for (const item of itemsToUpdate) {
                const tag = mockDB.RfidTags[item.uid_scanned];
                if (tag) {
                    tag.status = 'sold';
                    console.log(`Tag ${item.uid_scanned} marked as SOLD.`);
                }
            }
        }
    }

    res.status(200).send('OK');
});

// --- 🚧 ENDPOINT UNTUK RFID GATE ---

/**
 * [GET] /api/gate/check/:uid
 */
app.get('/api/gate/check/:uid', (req, res) => {
    const {
        uid
    } = req.params;
    const tag = mockDB.RfidTags[uid];

    if (!tag) {
        return res.json({
            allow: false,
            reason: 'UID not recognized'
        });
    }
    if (tag.status === 'sold') {
        return res.json({
            allow: true
        });
    } else {
        return res.json({
            allow: false,
            reason: 'Item not paid'
        });
    }
});

// --- 🛡️ MIDDLEWARE UNTUK MELINDUNGI RUTE ADMIN ---
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <TOKEN>

    if (!token) {
        return res.status(403).json({ message: 'A token is required for authentication' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Simpan info user di request
    } catch (err) {
        return res.status(401).json({ message: 'Invalid Token' });
    }

    // Pastikan user adalah admin
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    return next();
};

// --- 👨‍💼 ENDPOINT UNTUK ADMIN PANEL (DILINDUNGI) ---

/**
 * [GET] /api/admin/settings
 * Mengambil pengaturan global aplikasi.
 */
app.get('/api/admin/settings', verifyToken, (req, res) => {
    res.json(mockDB.Settings);
});

/**
 * [PUT] /api/admin/settings
 * Memperbarui pengaturan global aplikasi.
 */
app.put('/api/admin/settings', verifyToken, (req, res) => {
    const { lowStockThreshold } = req.body;

    if (lowStockThreshold === undefined || typeof lowStockThreshold !== 'number' || lowStockThreshold < 0) {
        return res.status(400).json({ error: 'Invalid low stock threshold value.' });
    }

    mockDB.Settings.lowStockThreshold = lowStockThreshold;
    console.log(`Low stock threshold updated to: ${lowStockThreshold}`);
    res.json({ success: true, message: 'Settings updated successfully!', settings: mockDB.Settings });
});


/**
 * [GET] /api/admin/products
 */
app.get('/api/admin/products', verifyToken, (req, res) => {
    const productList = Object.entries(mockDB.Products).map(([id, data]) => ({
        product_id: parseInt(id),
        name: data.name,
        price: data.price
    }));
    res.json(productList);
});

/**
 * [POST] /api/admin/products/define
 */
app.post('/api/admin/products/define', verifyToken, (req, res) => {
    const {
        name,
        price
    } = req.body;

    if (!name || !price) {
        return res.status(400).json({
            error: 'Name and price are required'
        });
    }

    const newProductId = mockDB._nextProductId++;
    const newProduct = {
        name,
        price: parseFloat(price)
    };

    mockDB.Products[newProductId] = newProduct;

    console.log('New product defined:', {
        product_id: newProductId,
        ...newProduct
    });
    res.status(201).json({
        product_id: newProductId,
        ...newProduct
    });
});

/**
 * [POST] /api/admin/rfid/register
 */
app.post('/api/admin/rfid/register', verifyToken, (req, res) => {
    const {
        product_id,
        uid
    } = req.body;

    if (!product_id || !uid) {
        return res.status(400).json({
            error: 'product_id and uid are required'
        });
    }
    if (!mockDB.Products[product_id]) {
        return res.status(404).json({
            error: 'Product not found'
        });
    }
    if (mockDB.RfidTags[uid]) {
        return res.status(400).json({
            error: 'RFID Tag already registered'
        });
    }

    mockDB.RfidTags[uid] = {
        product_id: parseInt(product_id),
        status: 'active'
    };

    console.log(`Tag ${uid} registered to product ${product_id}`);
    res.status(201).json({
        success: true,
        uid: uid,
        product_id: parseInt(product_id),
        status: 'active'
    });
});

/**
 * [PUT] /api/admin/products/define/:id
 */
app.put('/api/admin/products/define/:id', verifyToken, (req, res) => {
    const { id } = req.params;
    const { name, price } = req.body;

    if (!mockDB.Products[id]) {
        return res.status(404).json({ error: 'Product not found' });
    }

    if (!name || typeof price !== 'number' || price < 0) {
        return res.status(400).json({ error: 'Invalid name or price provided.' });
    }

    mockDB.Products[id].name = name;
    mockDB.Products[id].price = price;

    const updatedProduct = {
        product_id: parseInt(id),
        ...mockDB.Products[id]
    };

    console.log(`Product ID ${id} updated:`, updatedProduct);
    res.json(updatedProduct);
});

/**
 * [DELETE] /api/admin/products/define/:id
 */
app.delete('/api/admin/products/define/:id', verifyToken, (req, res) => {
    const {
        id
    } = req.params;

    console.log(`Delete request received for Product ID: ${id}`);

    if (!mockDB.Products[id]) {
        return res.status(404).json({
            error: 'Product not found'
        });
    }

    const activeTags = Object.values(mockDB.RfidTags).filter(tag => tag.product_id == id && tag.status === 'active');

    if (activeTags.length > 0) {
        return res.status(400).json({
            error: `Cannot delete product. It is still associated with ${activeTags.length} active RFID tag(s).`
        });
    }

    delete mockDB.Products[id];

    console.log(`Product ID ${id} deleted successfully.`);
    res.status(200).json({
        success: true,
        message: 'Product deleted'
    });
});

/**
 * [GET] /api/admin/discounts
 */
app.get('/api/admin/discounts', verifyToken, (req, res) => {
    res.json(mockDB.Discounts);
});

/**
 * [POST] /api/admin/discounts
 */
app.post('/api/admin/discounts', verifyToken, (req, res) => {
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

    const newDiscount = {
        id: mockDB._nextDiscountId++,
        name,
        percentage,
        targetType, 
        targetId: targetType === 'product' ? parseInt(targetId) : null,
        startDate: startDate || null,
        endDate: endDate || null,
        isActive: true
    };

    mockDB.Discounts.push(newDiscount);
    console.log('New discount rule created:', newDiscount);
    res.status(201).json(newDiscount);
});

/**
 * [DELETE] /api/admin/discounts/:id
 */
app.delete('/api/admin/discounts/:id', verifyToken, (req, res) => {
    const {
        id
    } = req.params;
    mockDB.Discounts = mockDB.Discounts.filter(d => d.id != id);
    console.log(`Discount rule ID ${id} deleted.`);
    res.status(200).json({
        success: true,
        message: `Discount rule ID ${id} has been deleted.`
    });
});

/**
 * [PUT] /api/admin/discounts/:id/toggle
 * Mengubah status aktif/tidak aktif sebuah aturan diskon.
 */
app.put('/api/admin/discounts/:id/toggle', verifyToken, (req, res) => {
    const { id } = req.params;
    const discount = mockDB.Discounts.find(d => d.id == id);

    if (!discount) {
        return res.status(404).json({ error: 'Discount rule not found' });
    }

    // Toggle the status
    discount.isActive = !discount.isActive;

    console.log(`Discount rule ID ${id} status toggled to: ${discount.isActive}`);
    res.json({
        success: true,
        message: `Discount rule ID ${id} status changed to ${discount.isActive ? 'active' : 'inactive'}.`,
        discount: discount
    });
});

// --- ENDPOINT INVENTORY (Tidak Berubah) ---

/**
 * [GET] /api/admin/inventory
 */
app.get('/api/admin/inventory', verifyToken, (req, res) => {
    console.log('Inventory summary request received.');
    const stockCount = {};
    for (const uid in mockDB.RfidTags) {
        const tag = mockDB.RfidTags[uid];
        if (tag.status === 'active') {
            const pid = tag.product_id;
            if (stockCount[pid]) {
                stockCount[pid]++;
            } else {
                stockCount[pid] = 1;
            }
        }
    }
    const inventoryList = Object.keys(stockCount).map(productId => {
        const product = mockDB.Products[productId];
        const stock = stockCount[productId];
        return {
            product_id: parseInt(productId),
            name: product ? product.name : 'Unknown/Deleted Product',
            stock: stock,
            isLowStock: stock < mockDB.Settings.lowStockThreshold // Gunakan nilai dari settings
        };
    });
    res.json(inventoryList);
});

/**
 * [GET] /api/admin/inventory/details/:id
 */
app.get('/api/admin/inventory/details/:id', verifyToken, (req, res) => {
    const {
        id
    } = req.params; 
    console.log(`UID detail request received for Product ID: ${id}`);
    const uidList = [];
    for (const uid in mockDB.RfidTags) {
        const tag = mockDB.RfidTags[uid];
        if (tag.product_id == id && tag.status === 'active') {
            uidList.push(uid);
        }
    }
    res.json(uidList); 
});

/**
 * [PUT] /api/admin/rfid/deactivate/:uid
 * Menonaktifkan sebuah tag RFID (misalnya karena hilang atau rusak).
 */
app.put('/api/admin/rfid/deactivate/:uid', verifyToken, (req, res) => {
    const { uid } = req.params;
    const tag = mockDB.RfidTags[uid];

    if (!tag) {
        return res.status(404).json({ error: 'RFID Tag not found' });
    }

    if (tag.status !== 'active') {
        return res.status(400).json({ error: `Tag is already inactive (status: ${tag.status})` });
    }

    tag.status = 'deactivated';

    console.log(`Tag ${uid} has been deactivated.`);
    res.json({
        success: true,
        message: `Tag ${uid} has been successfully deactivated.`
    });
});

// ==========================================

// ==========================================
// ===          KODE YANG DIPERBAIKI        ===
// ==========================================

/**
 * [GET] /api/admin/reports
 */
app.get('/api/admin/reports', verifyToken, (req, res) => {
    const {
        period,
        startDate,
        endDate
    } = req.query;

    console.log(`Report requested for period: ${period}, Start: ${startDate}, End: ${endDate}`);

    let filteredTransactions = mockDB.Transactions.filter(t => t.payment_status === 'completed');

    if (period !== 'all') {
        let startRange, endRange;
        const today = new Date(); // Waktu "sekarang" (waktu lokal server)

        if (period === 'custom' && startDate && endDate) {
            
            // Logika custom range (Sudah benar)
            startRange = new Date(`${startDate}T00:00:00`);
            endRange = new Date(`${endDate}T23:59:59.999`);

        } else {
            
            // --- INI ADALAH PERBAIKAN LOGIKA ---
            
            // 1. Tentukan rentang akhir (endRange)
            // Selalu set ke AKHIR HARI INI (23:59) untuk laporan non-kustom
            endRange = new Date(today.getTime());
            endRange.setHours(23, 59, 59, 999); 

            // 2. Tentukan rentang awal (startRange)
            startRange = new Date(today.getTime()); // Salin tanggal hari ini

            switch (period) {
                case 'daily':
                    // Mulai dari awal hari ini (00:00)
                    startRange.setHours(0, 0, 0, 0); 
                    break;
                case 'weekly':
                    // Mundur 7 hari dari hari ini
                    startRange.setDate(today.getDate() - 7);
                    // Set ke awal hari (00:00) 7 hari yang lalu
                    startRange.setHours(0, 0, 0, 0);
                    break;
                case 'monthly':
                    // Mundur 1 bulan dari hari ini
                    startRange.setMonth(today.getMonth() - 1);
                    // Set ke awal hari (00:00) 1 bulan yang lalu
                    startRange.setHours(0, 0, 0, 0);
                    break;
                case 'yearly':
                    // Mundur 1 tahun dari hari ini
                    startRange.setFullYear(today.getFullYear() - 1);
                    // Set ke awal hari (00:00) 1 tahun yang lalu
                    startRange.setHours(0, 0, 0, 0);
                    break;
            }
            // --------------------------------------
        }

        // Terapkan filter ke transaksi
        filteredTransactions = filteredTransactions.filter(tx => {
            const txDate = new Date(tx.created_at); // Konversi string ISO (UTC) ke objek Date
            return txDate >= startRange && txDate <= endRange;
        });
    }

    // Sisa dari fungsi ini (menghitung total, memformat, dll.) tidak perlu diubah
    let totalSales = 0;
    let totalSubtotal = 0;
    let totalDiscount = 0;
    const formattedTransactions = filteredTransactions.map(tx => {
        totalSales += tx.total_amount;

        const itemsInTx = mockDB.TransactionItems.filter(item => item.transaction_id === tx.transaction_id);
        const itemCount = itemsInTx.length;

        // Hitung subtotal dari harga asli saat penjualan
        const subtotal = itemsInTx.reduce((acc, item) => acc + item.price_at_sale, 0);
        // Hitung jumlah diskon
        const discountAmount = subtotal - tx.total_amount;

        totalSubtotal += subtotal;
        totalDiscount += discountAmount;

        const productNames = itemsInTx.map(item => {
            const product = mockDB.Products[item.product_id];
            return product ? product.name : 'Unknown Product';
        }).join(', ');

        return {
            transaction_id: tx.transaction_id,
            created_at: tx.created_at,
            total_amount: tx.total_amount,
            subtotal: subtotal,
            discount_amount: discountAmount,
            payment_status: tx.payment_status,
            item_count: itemCount,
            product_names: productNames || 'N/A'
        };
    });

    res.json({
        period: period || 'all-time',
        summary: {
            totalSales: totalSales,
            totalSubtotal: totalSubtotal,
            totalDiscount: totalDiscount,
            totalTransactions: filteredTransactions.length
        },
        transactions: formattedTransactions
    });
});
// ==========================================
// ===      AKHIR DARI KODE PERBAIKAN     ===
// ==========================================


// --- SERVER START ---
app.listen(PORT, () => {
    console.log(`======= RFID Self-Service API Server =======`);
    console.log(`Backend berjalan di http://localhost:${PORT}`);
    console.log(`============================================`);
});