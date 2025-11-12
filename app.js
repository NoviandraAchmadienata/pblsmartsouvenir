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
    const rfidInput = document.getElementById('rfid-input');
    const scanBtn = document.getElementById('scan-btn');
    const cartItemsContainer = document.getElementById('cart-items');
    const totalItemsCountEl = document.getElementById('total-items-count');
    const totalPriceDisplayEl = document.getElementById('total-price-display');
    const summarySubtotalEl = document.getElementById('summary-subtotal');
    const summaryTotalEl = document.getElementById('summary-total');
    const payQrisBtn = document.getElementById('pay-qris-btn');
    const paymentSelectionDiv = document.getElementById('payment-selection');
    const qrisDisplayDiv = document.getElementById('qris-display');
    const qrisImage = document.getElementById('qris-image');
    const paymentSuccessDiv = document.getElementById('payment-success');
    const simulatePaymentBtn = document.getElementById('simulate-payment-success');
    const newOrderBtn = document.getElementById('new-order-btn');
    const cancelTransactionBtn = document.getElementById('cancel-transaction-btn');

    // === BARU: Referensi Elemen Modal Sukses ===
    const kioskSuccessModal = document.getElementById('kiosk-success-modal');
    const kioskSuccessTxId = document.getElementById('kiosk-success-tx-id');

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

    // --- FUNGSI HELPER UNTUK MERESET PANEL PEMBAYARAN ---
    function resetPaymentPanel() {
        paymentSuccessDiv.classList.add('hidden');
        qrisDisplayDiv.classList.add('hidden');
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
        resetPaymentPanel(); // Reset panel pembayaran setiap kali ada scan baru

        if (!uid) return;

        if (cart.find(item => item.uid === uid)) {
            showKioskAlert('Item sudah ada di keranjang.');
            rfidInput.value = '';
            return;
        }

        try {
            // Panggil backend Anda untuk mendapatkan info produk dari UID
            const response = await fetch(`http://localhost:3000/api/product/${uid}`);
            
            if (!response.ok) {
                 // Tangani jika UID tidak ditemukan oleh backend
                showKioskAlert('UID produk tidak ditemukan di database!');
                rfidInput.value = '';
                return;
            }
            
            const product = await response.json();

            // --- DATA MOCK (Sudah digantikan oleh fetch di atas) ---
            // const mockProducts = { ... };
            // const product = mockProducts[uid];
            
            if (!product) {
                // Ini seharusnya tidak terjadi jika response.ok, tapi sebagai penjaga
                showKioskAlert('Gagal memproses data produk.');
                rfidInput.value = '';
                return;
            }
            // --- AKHIR DATA MOCK ---

            cart.push({ uid: uid, ...product, qty: 1 });
            aggregateCart();
            updateCartUI();

        } catch (error) {
            console.error('Error fetching product:', error);
            // Tangani error koneksi ke backend
            showKioskAlert('Gagal terhubung ke server. Pastikan server backend berjalan.');
        }

        rfidInput.value = '';
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

        paymentSelectionDiv.classList.add('hidden');
        qrisDisplayDiv.classList.remove('hidden');

        try {
            const uidsToPay = cart.map(item => item.uid);
            const subtotal = Array.from(productMap.values()).reduce((acc, item) => acc + (item.price * item.qty), 0);
            
            // Hitung ulang total diskon untuk pembayaran
            let discountAmount = 0;
            for (const item of productMap.values()) {
                const itemSubtotal = item.price * item.qty;
                const productSpecificDiscount = activeDiscounts.find(d => d.targetType === 'product' && d.targetId === item.product_id);
                const globalDiscount = activeDiscounts.find(d => d.targetType === 'global');
                let bestDiscountPercentage = Math.max(productSpecificDiscount?.percentage || 0, globalDiscount?.percentage || 0);
                discountAmount += (itemSubtotal * bestDiscountPercentage) / 100;
            }
            const totalAmount = subtotal - discountAmount;
            
            // === BARU: Logika ID Transaksi ===
            // SIMULASI: Buat ID unik sementara (karena fetch di bawah masih dikomentari)
            // currentTransactionId = `TX-${Date.now().toString().slice(-6)}`; 
            // Tampilkan ID di layar QRIS
            document.getElementById('qris-tx-id').textContent = `Order ID: ${currentTransactionId}`;
            // === AKHIR LOGIKA BARU ===


            // PANGGIL BACKEND (Kode Anda masih dikomentari, jadi saya biarkan)
            const response = await fetch('http://localhost:3000/api/create-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uids: uidsToPay, totalAmount: totalAmount })
            });
            const data = await response.json();
            
            // --- Jika fetch di atas aktif, ganti logika ID Transaksi dengan ini ---
            currentTransactionId = data.transaction_id; // Dapat ID dari backend
            document.getElementById('qris-tx-id').textContent = `Order ID: ${currentTransactionId}`;
            //qrisImage.src = data.qrisUrl;

            // SIMULASI (Sesuai kode Anda)
            qrisImage.src = data.qrisUrl;
            
            // --- LOGIKA BARU: Mulai timer pembatalan otomatis ---
            qrisTimeoutId = setTimeout(() => {
                // Fungsi ini akan berjalan jika tidak ada pembayaran setelah 60 detik
                cancelCurrentTransaction("Transaction cancelled due to inactivity.");
            }, 60000); // 60000 milidetik = 1 menit

        } catch (error) {
            console.error('Failed to create payment:', error);
            paymentSelectionDiv.classList.remove('hidden');
            qrisDisplayDiv.classList.add('hidden');
        }
    }

    function showPaymentSuccess() {
        // --- LOGIKA BARU: Hentikan timer karena pembayaran berhasil ---
        if (qrisTimeoutId) {
            clearTimeout(qrisTimeoutId);
            qrisTimeoutId = null;
        }

        // Sembunyikan panel samping dan tampilkan modal sukses
        qrisDisplayDiv.classList.add('hidden'); // Sembunyikan QRIS di panel samping
        kioskSuccessModal.classList.remove('hidden'); // Tampilkan modal sukses
        
        // === BARU: Tampilkan ID di layar sukses ===
        if (currentTransactionId) {
            kioskSuccessTxId.textContent = `Transaction ID: ${currentTransactionId}`;
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
        kioskSuccessModal.classList.add('hidden'); // Sembunyikan modal sukses
        qrisDisplayDiv.classList.add('hidden');
        paymentSelectionDiv.classList.remove('hidden');
        currentTransactionId = null;
    }

    // --- INISIALISASI ---
    fetchDiscount(); // Ambil info diskon saat aplikasi dimuat

    // --- Event Listeners ---
    scanBtn.addEventListener('click', () => handleRfidScan(rfidInput.value));
    rfidInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleRfidScan(rfidInput.value);
        }
    });

    payQrisBtn.addEventListener('click', handlePayment);
    
    // --- PERBAIKAN: Jadikan simulasi lebih realistis dengan memanggil webhook ---
    simulatePaymentBtn.addEventListener('click', async () => {
        if (!currentTransactionId) {
            showKioskAlert("No active transaction to simulate payment for.");
            return;
        }
        try {
            // Panggil webhook di backend, seolah-olah payment gateway yang memanggilnya
            await fetch('http://localhost:3000/api/payment-webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: currentTransactionId, transaction_status: 'completed' })
            });
            showPaymentSuccess(); // Tampilkan layar sukses setelah backend mengkonfirmasi
        } catch (error) {
            console.error("Failed to simulate payment webhook:", error);
            showKioskAlert("Error confirming payment on the backend.");
        }
    });

    // --- LOGIKA BARU: Listener untuk tombol batal transaksi ---
    cancelTransactionBtn.addEventListener('click', () => {
        cancelCurrentTransaction("Transaction has been cancelled.");
    });

    newOrderBtn.addEventListener('click', resetKiosk);
});