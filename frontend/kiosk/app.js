document.addEventListener('DOMContentLoaded', () => {

    // --- KODE BARU UNTUK JAM REALTIME ---
    const clockElement = document.getElementById('realtime-clock');

    function updateClock() {
        const now = new Date();
        const options = {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23' // Format 24 jam
        };
        
        let formattedDate = new Date().toLocaleString('en-GB', options);
        formattedDate = formattedDate.replace(',', ''); 
        
        clockElement.textContent = formattedDate;
    }

    updateClock(); 
    setInterval(updateClock, 1000); 
    // --- AKHIR KODE BARU ---

    // Referensi Elemen DOM
    const rfidInput = document.getElementById('rfid-input') || null;
    const scanBtn = document.getElementById('scan-btn') || null;
    const cartItemsContainer = document.getElementById('cart-items');
    const totalItemsCountEl = document.getElementById('total-items-count');
    const totalPriceDisplayEl = document.getElementById('total-price-display');
    const summarySubtotalEl = document.getElementById('summary-subtotal');
    const summaryTotalEl = document.getElementById('summary-total');
    const payQrisBtn = document.getElementById('pay-qris-btn');
    const paymentSelectionDiv = document.getElementById('payment-selection');
    const waitingPaymentDiv = document.getElementById('waiting-payment-display'); // Ganti dari qris-display
    const paymentSuccessDiv = document.getElementById('payment-success');
    const newOrderBtn = document.getElementById('new-order-btn');
    const cancelTransactionBtn = document.getElementById('cancel-transaction-btn');

    // === BARU: Referensi Elemen Modal Alert Kustom Kiosk ===
    const kioskAlertModal = document.getElementById('kiosk-alert-modal');
    const kioskAlertMessage = document.getElementById('kiosk-alert-message');
    const kioskAlertCloseBtn = document.getElementById('kiosk-alert-close-btn');


    // State Aplikasi
    let cart = []; // Menyimpan UID unik
    let productMap = new Map(); // Menyimpan produk yang digabung
    const emptyCartPlaceholder = document.querySelector('.empty-cart-placeholder');
    
    // === BARU: Variabel untuk menyimpan ID Transaksi ===
    let activeDiscounts = [];
    let currentTransactionId = null;
    let qrisTimeoutId = null; // ID untuk timer pembatalan otomatis

        // === KONEKSI WEBSOCKET RFID BRIDGE ===
    // Frontend akan mendengarkan event dari rfid-bridge.js (ws://localhost:8080/ws/rfid)
    (function setupRfidWebSocket() {
        const WS_URL = 'ws://localhost:8080/ws/rfid';

        // Pindahkan 'ws' ke scope yang lebih tinggi agar bisa diakses fungsi lain
        window.rfidWs = null;
        function connect() {
            console.log('[KIOSK] Connecting to RFID WebSocket...');
            window.rfidWs = new WebSocket(WS_URL);

            window.rfidWs.onopen = () => {
                console.log('[KIOSK] RFID WebSocket connected');
            };

            window.rfidWs.onclose = () => {
                console.warn('[KIOSK] RFID WebSocket disconnected, retry in 3s...');
                // auto reconnect
                setTimeout(connect, 3000);
            };

            window.rfidWs.onerror = (err) => {
                console.error('[KIOSK] RFID WebSocket error:', err);
            };

            window.rfidWs.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // Kita expect format: { type: 'rfid', rfid: 'uid333' }
                    if (data.type === 'rfid' && data.rfid) {
                        console.log('[KIOSK] RFID tag received from WS:', data.rfid);
                        handleRfidScan(data.rfid);
                    }
                } catch (e) {
                    console.error('[KIOSK] Invalid WS message:', e);
                }
            };
        }

        connect();
    })();

    // --- FUNGSI HELPER UNTUK MERESET PANEL PEMBAYARAN ---
    function resetPaymentPanel() {
        paymentSuccessDiv.classList.add('hidden');
        waitingPaymentDiv.classList.add('hidden');
        paymentSelectionDiv.classList.remove('hidden');
        currentTransactionId = null;
    }

    // --- FUNGSI BARU: Batalkan transaksi saat ini ---
    function cancelCurrentTransaction(reason) {
        // Hentikan timer jika ada
        if (qrisTimeoutId) {
            clearTimeout(qrisTimeoutId);
            qrisTimeoutId = null;
        }

        // Tampilkan notifikasi jika ada alasan
        if (reason) {
            showKioskAlert(reason);
        }

        // Bersihkan keranjang
        cart = [];
        productMap.clear();
        updateCartUI();
        resetPaymentPanel(); // Reset panel pembayaran ke kondisi awal
    }

    // === FUNGSI BARU: Tampilkan Alert Kustom untuk Kiosk ===
    function showKioskAlert(message) {
        kioskAlertMessage.textContent = message;
        kioskAlertModal.classList.remove('hidden');
    }

    // Listener untuk menutup alert kustom kiosk
    function closeKioskAlert() {
        kioskAlertModal.classList.add('hidden');
    }
    kioskAlertCloseBtn.addEventListener('click', closeKioskAlert);
    kioskAlertModal.addEventListener('click', (event) => {
        // Tutup jika klik di area overlay gelap
        if (event.target === kioskAlertModal) {
            closeKioskAlert();
        }
    });

    // --- FUNGSI UNTUK MENGAMBIL DISKON ---
    async function fetchDiscount() {
        try {
            const response = await fetch('http://localhost:3000/api/discounts');
            if (!response.ok) return;
            activeDiscounts = await response.json();
            console.log("Active discounts loaded:", activeDiscounts);
        } catch (error) {
            console.error("Could not fetch discount info:", error);
        }
    }

    // --- FUNGSI UTAMA ---
async function handleRfidScan(uid) {
    resetPaymentPanel();

    if (!uid) return; // UID tidak boleh kosong

    if (cart.find(item => item.uid === uid)) {
        showKioskAlert('Item sudah ada di keranjang.');
        if (rfidInput) rfidInput.value = '';
        return;
    }

    const response = await fetch(`http://localhost:3000/api/product/${uid}`);

    if (!response.ok) {
        showKioskAlert('UID produk tidak ditemukan di database!');
        if (rfidInput) rfidInput.value = '';
        return;
    }

    const product = await response.json();

    cart.push({ uid: uid, ...product, qty: 1 });
    aggregateCart();
    updateCartUI();

    if (rfidInput) rfidInput.value = '';
}

    function aggregateCart() {
        productMap.clear();
        for (const item of cart) {
            if (productMap.has(item.product_id)) {
                let existing = productMap.get(item.product_id);
                existing.qty += 1;
                existing.uids.push(item.uid);
            } else {
                productMap.set(item.product_id, {
                    ...item,
                    uids: [item.uid],
                });
            }
        }
    }

    function updateCartUI() {
        // Perbaikan: Panggil fetchDiscount setiap kali UI diperbarui
        // untuk memastikan diskon selalu yang terbaru.
        fetchDiscount().then(() => {
            cartItemsContainer.innerHTML = ''; // Selalu bersihkan
        
        if (productMap.size === 0) {
            cartItemsContainer.innerHTML = `
                <div class="empty-cart-placeholder">
                    <p>Silakan pindai item pertama Anda...</p>
                </div>`;
        }

        let totalPrice = 0;
        let totalDiscountAmount = 0;
        let finalTotal = 0;

        const formatter = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR'
        });

        for (const [id, item] of productMap.entries()) {
            const subtotal = item.price * item.qty;
            totalPrice += subtotal;

            const itemEl = document.createElement('div');
            itemEl.classList.add('cart-item');
            itemEl.innerHTML = `
                <span class="item-name">${item.name}</span>
                <span class="col-price">${formatter.format(item.price)}</span>
                <span class="col-qty">${item.qty}</span>
                <span class="col-subtotal">${formatter.format(subtotal)}</span>
                <span class="col-action">
                    <button class="delete-item-btn" data-product-id="${item.product_id}" title="Hapus item ini">×</button>
                </span>
            `;
            cartItemsContainer.appendChild(itemEl);
        }

        // Hitung diskon dan total akhir
        // Logika diskon baru yang lebih kompleks
        totalDiscountAmount = 0;
        for (const item of productMap.values()) {
            const itemSubtotal = item.price * item.qty;
            // Cari diskon terbaik untuk item ini
            const productSpecificDiscount = activeDiscounts.find(d => d.targetType === 'product' && d.targetId === item.product_id);
            const globalDiscount = activeDiscounts.find(d => d.targetType === 'global');
            
            let bestDiscountPercentage = 0;
            if (productSpecificDiscount) bestDiscountPercentage = productSpecificDiscount.percentage;
            if (globalDiscount && globalDiscount.percentage > bestDiscountPercentage) bestDiscountPercentage = globalDiscount.percentage;

            if (bestDiscountPercentage > 0) {
                totalDiscountAmount += (itemSubtotal * bestDiscountPercentage) / 100;
            }
        }
        finalTotal = totalPrice - totalDiscountAmount;

        // Update total
        totalItemsCountEl.textContent = cart.length;
        totalPriceDisplayEl.textContent = formatter.format(totalPrice);
        summarySubtotalEl.textContent = formatter.format(totalPrice);
        document.getElementById('summary-discount').textContent = `- ${formatter.format(totalDiscountAmount)}`;
        summaryTotalEl.textContent = formatter.format(finalTotal);
        
        addDeleteListeners();
        });
    }

    // --- FUNGSI HAPUS ITEM ---
    function addDeleteListeners() {
        document.querySelectorAll('.delete-item-btn').forEach(button => {
            button.removeEventListener('click', handleDeleteItem); 
            button.addEventListener('click', handleDeleteItem);
        });
    }

    function handleDeleteItem(event) {
        const productIdToDelete = parseInt(event.target.getAttribute('data-product-id'));
        
        productMap.delete(productIdToDelete);
        cart = cart.filter(item => item.product_id !== productIdToDelete);
        
        // Reset panel pembayaran karena keranjang berubah
        resetPaymentPanel();

        updateCartUI();
    }

    async function handlePayment() {
        if (cart.length === 0) {
            showKioskAlert('Keranjang kosong!');
            return;
        }

        try {
            const uidsToPay = cart.map(item => item.uid);
            
            // Siapkan detail item untuk Midtrans
            const item_details = Array.from(productMap.values()).map(item => ({
                id: item.product_id,
                price: item.price,
                quantity: item.qty,
                name: item.name.substring(0, 50) // Nama item maks 50 karakter
            }));

            // Hitung total diskon dan tambahkan sebagai item terpisah dengan harga negatif
            let discountAmount = 0;
            for (const item of productMap.values()) {
                const itemSubtotal = item.price * item.qty;
                const productSpecificDiscount = activeDiscounts.find(d => d.targetType === 'product' && d.targetId === item.product_id);
                const globalDiscount = activeDiscounts.find(d => d.targetType === 'global');
                let bestDiscountPercentage = Math.max(productSpecificDiscount?.percentage || 0, globalDiscount?.percentage || 0);
                discountAmount += Math.round((itemSubtotal * bestDiscountPercentage) / 100);
            }

            if (discountAmount > 0) {
                item_details.push({
                    id: 'DISCOUNT',
                    price: -discountAmount,
                    quantity: 1,
                    name: 'Total Discount'
                });
            }

            const totalAmount = Array.from(productMap.values()).reduce((acc, item) => acc + (item.price * item.qty), 0) - discountAmount;

            // Panggil backend untuk mendapatkan token Midtrans
            const response = await fetch('http://localhost:3000/api/create-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uids: uidsToPay, totalAmount: totalAmount, item_details: item_details })
            });
            const data = await response.json();
            if (!data.token) throw new Error('Failed to get payment token.');

            currentTransactionId = data.transaction_id;

            // Tampilkan panel "Menunggu Pembayaran"
            paymentSelectionDiv.classList.add('hidden');
            waitingPaymentDiv.classList.remove('hidden');

            // Buka popup pembayaran Midtrans Snap
            window.snap.pay(data.token, {
                onSuccess: function(result){
                    console.log('Midtrans onSuccess:', result);
                    showPaymentSuccess();
                },
                onPending: function(result){
                    console.log('Midtrans onPending:', result);
                    // Tetap di halaman menunggu
                },
                onError: function(result){
                    console.error('Midtrans onError:', result);
                    cancelCurrentTransaction('Payment failed or was cancelled.');
                },
                onClose: function(){
                    // Jika user menutup popup tanpa membayar
                    // Hanya batalkan jika status masih 'pending'
                    if (currentTransactionId) {
                        console.log('Customer closed the popup, transaction cancelled.');
                        cancelCurrentTransaction('Transaction cancelled by user.');
                    }
                }
            });

        } catch (error) {
            console.error('Failed to create payment:', error);
            showKioskAlert('Gagal memulai proses pembayaran. Silakan coba lagi.');
            resetPaymentPanel();
        }
    }

    async function showPaymentSuccess() {
        // --- LOGIKA BARU: Hentikan timer karena pembayaran berhasil ---
        if (qrisTimeoutId) {
            clearTimeout(qrisTimeoutId);
            qrisTimeoutId = null;
        }

        // Sembunyikan panel "Menunggu Pembayaran"
        waitingPaymentDiv.classList.add('hidden');
        
        // Jika ada ID transaksi, langsung proses cetak struk
        if (currentTransactionId) {
            // Minta dan cetak struk secara otomatis
            try {
                console.log(`[KIOSK] Requesting receipt for TX: ${currentTransactionId}`);
                const response = await fetch(`http://localhost:3000/api/receipt/${currentTransactionId}`);
                if (response.ok) {
                    const receiptText = await response.text();

                    // --- MODIFIKASI: Cetak struk ke konsol browser ---
                    console.log('\n--- [KIOSK] RECEIPT START ---');
                    console.log(receiptText);
                    console.log('--- [KIOSK] RECEIPT END ---\n');

                    // Tetap kirim ke bridge agar bisa dicetak di terminal bridge juga
                    if (window.rfidWs && window.rfidWs.readyState === WebSocket.OPEN) {
                        window.rfidWs.send(JSON.stringify({ type: 'print', payload: receiptText }));
                        console.log('[KIOSK] Print command sent to bridge (for terminal logging).');
                    } else {
                        console.error('[KIOSK] Cannot send print command, WebSocket is not connected.');
                    }
                }
            } catch (error) {
                console.error('[KIOSK] Failed to fetch or print receipt:', error);
            }
        }
        
        cart = [];
        productMap.clear();
        updateCartUI(); // Placeholder akan muncul otomatis

        // Reset otomatis kiosk setelah 5 detik
        setTimeout(() => {
            resetKiosk();
        }, 5000); // 5000 milidetik = 5 detik
    }

    function resetKiosk() {
        waitingPaymentDiv.classList.add('hidden');
        paymentSelectionDiv.classList.remove('hidden');
        currentTransactionId = null;
        console.log('[KIOSK] System reset. Ready for new order.');
    }

    // --- INISIALISASI ---
    fetchDiscount(); // Ambil info diskon saat aplikasi dimuat

    // --- Event Listeners ---
   if (scanBtn && rfidInput) {
    scanBtn.addEventListener('click', () => handleRfidScan(rfidInput.value));

    rfidInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleRfidScan(rfidInput.value);
        }
    });
}

    payQrisBtn.addEventListener('click', handlePayment);
    
    // --- LOGIKA BARU: Listener untuk tombol batal transaksi ---
    cancelTransactionBtn.addEventListener('click', () => {
        cancelCurrentTransaction("Transaction has been cancelled.");
    });

    newOrderBtn.addEventListener('click', resetKiosk);
});