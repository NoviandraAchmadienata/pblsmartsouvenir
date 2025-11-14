document.addEventListener('DOMContentLoaded', () => {

    // --- BARU: Logika Otentikasi ---
    const token = localStorage.getItem('authToken');
    if (!token) {
        // Jika tidak ada token, paksa kembali ke halaman login
        window.location.href = 'login.html'; // Tetap bahasa Inggris untuk URL
        return; // Hentikan eksekusi sisa skrip
    }

    // Fungsi helper untuk membuat header otentikasi
    const getAuthHeaders = () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    });

    // === BARU: KONEKSI WEBSOCKET UNTUK ADMIN PANEL ===
    function setupAdminRfidWebSocket() {
        const WS_URL = 'ws://localhost:8080/ws/rfid';

        function connect() {
            console.log('[ADMIN] Connecting to RFID WebSocket...');
            const ws = new WebSocket(WS_URL);

            ws.onopen = () => console.log('[ADMIN] RFID WebSocket connected');
            ws.onclose = () => setTimeout(connect, 3000); // Coba sambung lagi setelah 3 detik
            ws.onerror = (err) => console.error('[ADMIN] RFID WebSocket error:', err);

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'rfid' && data.rfid) {
                        console.log('[ADMIN] RFID tag received:', data.rfid);

                        // Cek apakah modal registrasi tag sedang terbuka
                        const registerModal = document.getElementById('register-tag-modal');
                        if (!registerModal.classList.contains('hidden')) {
                            const uidInput = document.getElementById('register-modal-uid');
                            const registerButton = document.getElementById('register-modal-btn');

                            // Isi input dan klik tombol register secara otomatis
                            uidInput.value = data.rfid;
                            registerButton.click();
                        }
                    }
                } catch (e) {
                    console.error('[ADMIN] Invalid WS message:', e);
                }
            };
        }
        connect();
    }

    // --- BARU: Logika Logout ---
    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn.addEventListener('click', () => {
        // Ganti confirm() dengan modal kustom (sudah dilakukan)
        showConfirm('Apakah Anda yakin ingin keluar?', () => {
            localStorage.removeItem('authToken');
            window.location.href = 'login.html';
        });
    });

    // === Referensi Elemen ===
    const sidebarItems = document.querySelectorAll('.sidebar li');
    const pages = document.querySelectorAll('.page');
    const productDropdown = document.getElementById('prod-select-dropdown');
    const productListDiv = document.getElementById('existing-products-list');
    
    // === BARU: Referensi Elemen Inventory & Modal ===
    const inventoryListContainer = document.getElementById('inventory-list-container');
    const modalOverlay = document.getElementById('uid-modal');
    const modalCloseBtn = document.querySelector('.modal-close-btn');
    const modalProductName = document.getElementById('modal-product-name');
    const modalUidList = document.getElementById('modal-uid-list');

    // === BARU: Referensi Elemen Modal Edit Produk ===
    const editModal = document.getElementById('edit-product-modal');
    const editModalCloseBtn = editModal.querySelector('.modal-close-btn');

    // === BARU: Referensi Elemen Modal Alert Kustom ===
    const customAlertModal = document.getElementById('custom-alert-modal');
    const customAlertMessage = document.getElementById('custom-alert-message');
    const customAlertCloseBtn = document.getElementById('custom-alert-close-btn');

    // === BARU: Referensi Elemen Modal Confirm Kustom ===
    const customConfirmModal = document.getElementById('custom-confirm-modal');
    const customConfirmMessage = document.getElementById('custom-confirm-message');
    const customConfirmOkBtn = document.getElementById('custom-confirm-ok-btn');
    const customConfirmCancelBtn = document.getElementById('custom-confirm-cancel-btn');

    // === BARU: Referensi Elemen Modal Registrasi Tag ===
    const registerTagModal = document.getElementById('register-tag-modal');
    const registerTagModalCloseBtn = registerTagModal.querySelector('.modal-close-btn');
    const registerModalBtn = document.getElementById('register-modal-btn');

    // === Referensi Tombol Aksi (Penting untuk listener) ===
    const saveChangesBtn = document.getElementById('save-product-changes-btn');

    let currentProducts = []; // Cache untuk produk yang sedang ditampilkan

    // === LOGIKA NAVIGASI TAB/SIDEBAR ===
    sidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            sidebarItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const pageId = item.getAttribute('data-page');
            
            // Tampilkan halaman yang sesuai
            pages.forEach(p => p.classList.remove('active-page'));
            const activePage = document.getElementById(`${pageId}-page`);
            if (activePage) {
                activePage.classList.add('active-page');
            }
            
            // === BARU: Panggil fungsi load saat tab diklik ===
            if (pageId === 'products') {
                loadProducts();
            } else if (pageId === 'inventory') {
                loadInventory();
            } else if (pageId === 'discounts') {
                loadDiscountsPage();
            }
            // BARU: Panggil listener pencarian produk saat halaman aktif
            if (pageId === 'products') {
                addProductSearchListener();
            }
        });
    });

    // === FUNGSI BARU: Tampilkan Alert Kustom ===
    function showAlert(message) {
        customAlertMessage.textContent = message;
        customAlertModal.classList.remove('hidden');
    }

    // Listener untuk menutup alert kustom
    function closeCustomAlert() {
        customAlertModal.classList.add('hidden');
    }
    customAlertCloseBtn.addEventListener('click', closeCustomAlert);
    customAlertModal.addEventListener('click', (event) => {
        // Tutup jika klik di area overlay gelap
        if (event.target === customAlertModal) {
            closeCustomAlert();
        }
    });

    // === FUNGSI BARU: Tampilkan Confirm Kustom ===
    function showConfirm(message, onConfirm) {
        customConfirmMessage.textContent = message;
        customConfirmModal.classList.remove('hidden');

        // Hapus listener lama untuk mencegah panggilan ganda
        const newOkBtn = customConfirmOkBtn.cloneNode(true);
        customConfirmOkBtn.parentNode.replaceChild(newOkBtn, customConfirmOkBtn);

        newOkBtn.addEventListener('click', () => {
            closeConfirmAlert();
            onConfirm(); // Jalankan callback konfirmasi
        });
    }

    // Listener untuk menutup confirm modal
    function closeConfirmAlert() {
        customConfirmModal.classList.add('hidden');
    }
    customConfirmCancelBtn.addEventListener('click', closeConfirmAlert);
    customConfirmModal.addEventListener('click', (event) => {
        if (event.target === customConfirmModal) {
            closeConfirmAlert();
        }
    });

    // === FUNGSI: Muat Produk ===
    async function loadProducts() {
        productDropdown.innerHTML = '<option value="">Loading...</option>';
        productListDiv.innerHTML = '<p>Memuat...</p>';
        const discountProductSelector = document.getElementById('discount-product-selector');
        discountProductSelector.innerHTML = '<option value="">Loading...</option>';

        try {
            const response = await fetch('http://localhost:3000/api/admin/products', {
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Gagal mengambil produk');
            const products = await response.json();
            currentProducts = products; // Simpan produk ke cache
            
            productDropdown.innerHTML = '';
            discountProductSelector.innerHTML = '';
            productListDiv.innerHTML = `
                <table id="products-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Price (Rp)</th>
                            <th>Action</th> 
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>`;
            const productListTableBody = productListDiv.querySelector('tbody');

            productDropdown.add(new Option('--- Select a Product ---', ''));
            discountProductSelector.add(new Option('--- Select a Product ---', ''));

            for (const product of products) {
                const option = new Option(`${product.name} (Rp ${product.price.toFixed(2)})`, product.product_id);
                discountProductSelector.add(option.cloneNode(true));
                productDropdown.add(option);
                
                const row = productListTableBody.insertRow();
                row.innerHTML = `
                    <td>${product.product_id}</td>
                    <td>${product.name}</td>
                    <td>Rp ${product.price.toFixed(2)}</td>
                    <td class="product-actions"> 
                        <button class="register-tag-product-btn" data-product-id="${product.product_id}" data-product-name="${product.name}">Register Tag</button>
                        <button class="edit-product-btn" data-product-id="${product.product_id}">Edit</button>
                        <button class="delete-product-btn" data-product-id="${product.product_id}">Hapus</button>
                    </td>
                `;
            }
            addDeleteProductListeners();
            addRegisterTagProductListeners(); // Panggil listener untuk tombol register tag
            addEditProductListeners(); // Panggil listener untuk tombol edit
        } catch (error) {
            console.error('Gagal memuat produk:', error);
            productDropdown.innerHTML = '<option value="">Gagal memuat</option>';
            discountProductSelector.innerHTML = '<option value="">Gagal memuat</option>';
            productListDiv.innerHTML = '<p style="color: red;">Terjadi kesalahan saat memuat produk.</p>';
        }
    }
    
    // --- FUNGSI BARU: Pencarian Produk ---
    function addProductSearchListener() {
        const searchInput = document.getElementById('product-search-input');
        // Pastikan listener hanya ditambahkan sekali
        searchInput.removeEventListener('input', handleProductSearch);
        searchInput.addEventListener('input', handleProductSearch);
    }

    function handleProductSearch(event) {
        const searchTerm = event.target.value.toLowerCase();
        const productRows = document.querySelectorAll('#products-table tbody tr');
        
        productRows.forEach(row => {
            // Kolom kedua (index 1) adalah nama produk
            const productName = row.cells[1].textContent.toLowerCase();
            if (productName.includes(searchTerm)) {
                row.style.display = ''; // Tampilkan baris
            } else {
                row.style.display = 'none'; // Sembunyikan baris
            }
        });
    }


    // --- FUNGSI HAPUS DEFINISI PRODUK ---
    function addDeleteProductListeners() {
        document.querySelectorAll('.delete-product-btn').forEach(button => {
            button.removeEventListener('click', handleDeleteProduct);
            button.addEventListener('click', handleDeleteProduct);
        });
    }

    async function handleDeleteProduct(event) {
        const productId = event.target.getAttribute('data-product-id');
        showConfirm(`Apakah Anda yakin ingin menghapus produk ID ${productId}? Tindakan ini tidak dapat dibatalkan.`, async () => {
            try {
                const response = await fetch(`http://localhost:3000/api/admin/products/define/${productId}`, {
                    method: 'DELETE',
                    headers: getAuthHeaders()
                });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Gagal menghapus produk');
                }
                showAlert('Product deleted successfully.');
                loadProducts(); // Reload list
            } catch (error) {
                console.error('Error deleting product:', error);
                showAlert(`Error: ${error.message}.`);
            }
        });
    }

    // --- FUNGSI BARU: EDIT PRODUK ---
    function addEditProductListeners() {
        document.querySelectorAll('.edit-product-btn').forEach(button => {
            button.removeEventListener('click', handleOpenEditModal);
            button.addEventListener('click', handleOpenEditModal);
        });
    }

    function handleOpenEditModal(event) {
        const productId = event.target.getAttribute('data-product-id');
        const product = currentProducts.find(p => p.product_id == productId);

        if (product) {
            document.getElementById('edit-product-id').value = product.product_id;
            document.getElementById('edit-product-name').value = product.name;
            document.getElementById('edit-product-price').value = product.price;
            editModal.classList.remove('hidden');
        } else {
            showAlert('Data produk tidak ditemukan. Harap segarkan.');
        }
    }

    function closeEditModal() {
        editModal.classList.add('hidden');
    }

    editModalCloseBtn.addEventListener('click', closeEditModal);
    editModal.addEventListener('click', (event) => {
        if (event.target === editModal) {
            closeEditModal();
        }
    });

    saveChangesBtn.addEventListener('click', async () => {
        const id = document.getElementById('edit-product-id').value;
        const name = document.getElementById('edit-product-name').value;
        const price = parseFloat(document.getElementById('edit-product-price').value);

        if (!name || isNaN(price) || price < 0) {
            showAlert('Harap berikan nama dan harga yang valid.');
            return;
        }

        try {
            const response = await fetch(`http://localhost:3000/api/admin/products/define/${id}`, {
                method: 'PUT',
                headers: getAuthHeaders(), 
                body: JSON.stringify({ name, price })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Gagal memperbarui produk');
            }
            showAlert('Produk berhasil diperbarui!');
            closeEditModal();
            loadProducts(); // Muat ulang daftar produk
        } catch (error) {
            showAlert(`Error: ${error.message}`);
            console.error('Error updating product:', error);
        }
    });

    // --- FUNGSI BARU: Buka Modal Registrasi Tag ---
    function addRegisterTagProductListeners() {
        document.querySelectorAll('.register-tag-product-btn').forEach(button => {
            button.removeEventListener('click', handleOpenRegisterTagModal);
            button.addEventListener('click', handleOpenRegisterTagModal);
        });
    }

    function handleOpenRegisterTagModal(event) {
        const productId = event.target.dataset.productId;
        const productName = event.target.dataset.productName;

        document.getElementById('register-modal-product-name').textContent = productName;
        document.getElementById('register-modal-product-id').value = productId;
        document.getElementById('register-modal-uid').value = '';
        document.getElementById('register-modal-status').innerHTML = ''; // Kosongkan status

        registerTagModal.classList.remove('hidden');
        // Fokus otomatis ke input UID agar bisa langsung scan
        setTimeout(() => document.getElementById('register-modal-uid').focus(), 100);
    }

    function closeRegisterTagModal() {
        registerTagModal.classList.add('hidden');
    }

    registerTagModalCloseBtn.addEventListener('click', closeRegisterTagModal);
    registerTagModal.addEventListener('click', (event) => {
        if (event.target === registerTagModal) {
            closeRegisterTagModal();
        }
    });

    // --- FUNGSI BARU: Logika untuk tombol register di dalam modal ---
    async function handleRegisterTagInModal() {
        const productId = document.getElementById('register-modal-product-id').value;
        const uidInput = document.getElementById('register-modal-uid');
        const uid = uidInput.value.trim();
        const statusBox = document.getElementById('register-modal-status');

        if (!uid) {
            statusBox.innerHTML = `<p class="status-error">UID tidak boleh kosong.</p>`;
            return;
        }

        try {
            const response = await fetch('http://localhost:3000/api/admin/rfid/register', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ product_id: parseInt(productId), uid: uid })
            });
            const result = await response.json(); 
            if (!response.ok) throw new Error(result.error || 'Gagal mendaftarkan tag');

            statusBox.innerHTML = `<p class="status-success">✓ Tag ${uid} berhasil didaftarkan!</p>`;
            uidInput.value = ''; // Kosongkan untuk scan berikutnya
            uidInput.focus(); // Tetap fokus di input
        } catch (error) {
            statusBox.innerHTML = `<p class="status-error">✗ Error: ${error.message}</p>`;
            uidInput.select(); // Pilih teks yang error agar mudah diganti
        }
    }

    registerModalBtn.addEventListener('click', handleRegisterTagInModal);
    document.getElementById('register-modal-uid').addEventListener('keypress', (e) => e.key === 'Enter' && handleRegisterTagInModal());

    // === LOGIKA: Tambah Produk ===
    document.getElementById('add-product-btn').addEventListener('click', async () => {
        const name = document.getElementById('new-prod-name').value;
        const price = parseFloat(document.getElementById('new-prod-price').value);
        if (!name || !price) {
            showAlert('Please enter both product name and price.');
            return;
        }
        try {
            const response = await fetch('http://localhost:3000/api/admin/products/define', { 
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ name, price })
            });
            const newProduct = await response.json();
            showAlert(`Product added: ${newProduct.name}`);
            document.getElementById('new-prod-name').value = '';
            document.getElementById('new-prod-price').value = '';
            loadProducts(); // Muat ulang daftar
        } catch (error) {
            console.error('Failed to add product:', error);
            showAlert('An error occurred. Check the console.');
        }
    });

    // === VALIDASI INPUT HARGA (HANYA ANGKA) ===
    document.getElementById('new-prod-price').addEventListener('keydown', (e) => {
        // Mencegah input karakter non-numerik seperti 'e', '.', ',', '+', '-'
        if (['e', 'E', '.', ',', '+', '-'].includes(e.key)) {
            e.preventDefault();
        }
    });

    // === LOGIKA: Registrasi Tag RFID ===
    document.getElementById('register-tag-btn').addEventListener('click', async () => {
        const registerBtn = document.getElementById('register-tag-btn');
        const product_id = document.getElementById('prod-select-dropdown').value;
        const uid = document.getElementById('prod-uid').value;
        if (!product_id || !uid) {
            showAlert('Harap pilih produk DAN pindai tag RFID.');
            return;
        }

        registerBtn.disabled = true; // Nonaktifkan tombol
        registerBtn.textContent = 'Mendaftarkan...';
        try {
            const response = await fetch('http://localhost:3000/api/admin/rfid/register', { 
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ product_id: parseInt(product_id), uid: uid })
            });
            if (!response.ok) { 
                const err = await response.json();
                throw new Error(err.error || 'Gagal mendaftarkan tag');
            }
            showAlert(`Tag ${uid} has been registered to product ID ${product_id}!`);
            document.getElementById('prod-select-dropdown').value = '';
            document.getElementById('prod-uid').value = '';
        } catch (error) {
            console.error('Failed to register tag:', error);
            showAlert(`Error: ${error.message}.`);
        } finally {
            registerBtn.disabled = false; // Aktifkan kembali tombol
            registerBtn.textContent = 'Daftarkan Tag';
        }
    });

    // === FUNGSI BARU: Muat Inventaris ===
    async function loadInventory() {
        inventoryListContainer.innerHTML = '<p>Memuat data inventaris...</p>';
        const thresholdInput = document.getElementById('low-stock-threshold');

        // Ambil dan tampilkan pengaturan saat ini
        try {
            const settingsResponse = await fetch('http://localhost:3000/api/admin/settings', { headers: getAuthHeaders() });
            if (!settingsResponse.ok) throw new Error('Failed to fetch settings');
            const settings = await settingsResponse.json();
            thresholdInput.value = settings.lowStockThreshold; 
        } catch (error) {
            console.error('Failed to load settings:', error);
            // Jangan hentikan proses, lanjutkan dengan nilai default atau kosong
        }


        // Lanjutkan memuat data inventaris
        try {
            const response = await fetch('http://localhost:3000/api/admin/inventory', {
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Failed to fetch inventory');
            const inventory = await response.json();

            // Buat tabel
            inventoryListContainer.innerHTML = `
                <table id="inventory-table">
                    <thead>
                        <tr> 
                            <th>ID Produk</th>
                            <th>Nama Produk</th>
                            <th>Stok Aktif</th>
                            <th>Tag Dinonaktifkan</th>
                        </tr>
                    </thead>
                    <tbody>
                    </tbody>
                </table>
            `;
            const inventoryTableBody = inventoryListContainer.querySelector('tbody');

            if (inventory.length === 0) { 
                inventoryTableBody.innerHTML = '<tr><td colspan="4">Tidak ada inventaris ditemukan.</td></tr>';
                return;
            }

            // Isi tabel
            for (const item of inventory) {
                const row = inventoryTableBody.insertRow();
                row.classList.add('inventory-row'); // Class untuk klik
                if (item.isLowStock) {
                    row.classList.add('low-stock-warning'); // Tambahkan class jika stok rendah
                }
                row.setAttribute('data-product-id', item.product_id);
                row.setAttribute('data-product-name', item.name);
                row.innerHTML = `
                    <td>${item.product_id}</td> 
                    <td>${item.name}</td> 
                    <td><strong>${item.stock}</strong> pcs</td>
                    <td>${item.deactivatedStock} pcs</td>
                `;
            }
            
            // Tambahkan event listener ke tabel
            addInventoryClickListeners();

        } catch (error) {
            console.error('Failed to load inventory:', error);
            inventoryListContainer.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`; // Tetap Error
        }
    }

    // Listener untuk tombol simpan pengaturan inventaris
    document.getElementById('save-inventory-settings-btn').addEventListener('click', async () => {
        const thresholdInput = document.getElementById('low-stock-threshold');
        const newThreshold = parseInt(thresholdInput.value, 10);

        if (isNaN(newThreshold) || newThreshold < 0) {
            showAlert('Harap masukkan angka non-negatif yang valid untuk ambang batas.');
            return;
        }

        try {
            const response = await fetch('http://localhost:3000/api/admin/settings', {
                method: 'PUT',
                headers: getAuthHeaders(),
                body: JSON.stringify({ lowStockThreshold: newThreshold })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Gagal menyimpan pengaturan');
            showAlert(result.message);
            loadInventory(); // Muat ulang inventaris untuk menerapkan sorotan baru
        } catch (error) {
            showAlert(`Error: ${error.message}`);
        }
    });

    // --- FUNGSI BARU: Logika untuk menonaktifkan tag ---
    function addDeactivateTagListeners() {
        document.querySelectorAll('.deactivate-tag-btn').forEach(btn => {
            btn.removeEventListener('click', handleDeactivateTag);
            btn.addEventListener('click', handleDeactivateTag);
        });
    }

    // --- FUNGSI BARU: Gabungkan semua listener aksi tag ---
    function addTagActionListeners() {
        document.querySelectorAll('.deactivate-tag-btn').forEach(btn => btn.addEventListener('click', handleDeactivateTag));
        document.querySelectorAll('.reactivate-tag-btn').forEach(btn => btn.addEventListener('click', handleReactivateTag));
        document.querySelectorAll('.delete-tag-btn').forEach(btn => btn.addEventListener('click', handleDeleteTag));
    }

    function refreshInventoryAndModal() {
        const activeRow = document.querySelector('.inventory-row.active-row');
        if (activeRow) {
            showUidDetails(activeRow.dataset.productId, activeRow.dataset.productName);
        }
        loadInventory();
    }

    // --- FUNGSI BARU: Logika untuk mengaktifkan kembali tag ---
    async function handleReactivateTag(event) {
        const uid = event.target.dataset.uid;
        try {
            const response = await fetch(`http://localhost:3000/api/admin/rfid/reactivate/${uid}`, { method: 'PUT', headers: getAuthHeaders() });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to reactivate tag');
            showAlert(result.message); 
            refreshInventoryAndModal();
        } catch (error) {
            showAlert(`Error: ${error.message}`);
        }
    }

    // --- FUNGSI BARU: Logika untuk menghapus tag secara permanen ---
    async function handleDeleteTag(event) {
        const uid = event.target.dataset.uid;
        showConfirm(`Are you sure you want to permanently delete tag ${uid}? This cannot be undone.`, async () => {
            await fetch(`http://localhost:3000/api/admin/rfid/delete/${uid}`, { method: 'DELETE', headers: getAuthHeaders() });
            showAlert(`Tag ${uid} has been deleted.`);
            refreshInventoryAndModal();
        });
    }

    async function handleDeactivateTag(event) {
        const uid = event.target.dataset.uid;
        
        // Ganti confirm() dengan modal kustom (sudah dilakukan)
        showConfirm(`Apakah Anda yakin ingin menonaktifkan tag RFID ${uid}? Tindakan ini tidak dapat dibatalkan.`, async () => {
            // Logika ini hanya akan berjalan jika admin menekan "Confirm"
            try {
                const response = await fetch(`http://localhost:3000/api/admin/rfid/deactivate/${uid}`, {
                    method: 'PUT',
                    headers: getAuthHeaders()
                });
                const result = await response.json(); 
                if (!response.ok) throw new Error(result.error || 'Gagal menonaktifkan tag');
                
                showAlert(result.message);
                refreshInventoryAndModal();
            } catch (error) {
                showAlert(`Error: ${error.message}`);
            }
        });
    }

    // === FUNGSI BARU: Tambah listener ke baris inventaris ===
    function addInventoryClickListeners() {
        document.querySelectorAll('.inventory-row').forEach(row => {
            row.addEventListener('click', () => {
                const productId = row.getAttribute('data-product-id');
                const productName = row.getAttribute('data-product-name');
                showUidDetails(productId, productName);
                // Tandai baris yang aktif untuk referensi nanti
                document.querySelectorAll('.inventory-row').forEach(r => r.classList.remove('active-row'));
                row.classList.add('active-row');
            });
        });
    }

    // === FUNGSI BARU: Tampilkan Modal Detail UID ===
    async function showUidDetails(productId, productName, highlightUid = null) {
        modalProductName.textContent = productName;
        modalUidList.innerHTML = '<p>Memuat UID...</p>';
        modalOverlay.classList.remove('hidden'); // Tampilkan modal

        try {
            const response = await fetch(`http://localhost:3000/api/admin/inventory/details/${productId}`, {
                headers: getAuthHeaders()
            });
            if (!response.ok) throw new Error('Gagal mengambil detail UID');
            const tags = await response.json(); // Sekarang array of objects {uid, status}

            modalUidList.innerHTML = ''; // Kosongkan
            
            if (tags.length === 0) {
                modalUidList.innerHTML = '<p>No UIDs found for this product.</p>';
                return;
            }

            // Isi daftar UID
            tags.forEach(tag => {
                const uidEl = document.createElement('div');
                uidEl.classList.add('uid-list-item');
                const statusClass = `status-${tag.status}`;

                // --- BARU: Tambahkan atribut data-uid untuk penyorotan ---
                uidEl.setAttribute('data-uid', tag.uid);

                let actionButtons = '';
                if (tag.status === 'active') {
                    actionButtons = `<button class="deactivate-tag-btn" data-uid="${tag.uid}">Nonaktifkan</button>`;
                } else if (tag.status === 'deactivated') {
                    actionButtons = `
                        <button class="reactivate-tag-btn" data-uid="${tag.uid}">Aktifkan Kembali</button>
                        <button class="delete-tag-btn" data-uid="${tag.uid}">Hapus</button>
                    `;
                } else { // sold
                    actionButtons = `<span>-</span>`;
                }

                uidEl.innerHTML = `
                    <div class="uid-info">
                        <span>${tag.uid}</span>
                        <span class="status-badge ${statusClass}">${tag.status}</span>
                    </div>
                    <div class="uid-actions">${actionButtons}</div>
                `;
                modalUidList.appendChild(uidEl);
            });

            // --- LOGIKA BARU: Sorot UID yang dicari ---
            if (highlightUid) {
                const itemToHighlight = modalUidList.querySelector(`.uid-list-item[data-uid="${highlightUid}"]`);
                if (itemToHighlight) {
                    itemToHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    itemToHighlight.classList.add('highlight');
                    setTimeout(() => itemToHighlight.classList.remove('highlight'), 2000); // Hapus sorotan setelah 2 detik
                }
            }

            addTagActionListeners(); // Pasang listener ke semua tombol aksi

            // --- LOGIKA BARU: Fitur Pencarian UID ---
            const searchInput = document.getElementById('uid-search-input');
            const allUidItems = modalUidList.querySelectorAll('.uid-list-item');

            searchInput.addEventListener('input', () => {
                const searchTerm = searchInput.value.toLowerCase();
                allUidItems.forEach(item => {
                    const uidText = item.querySelector('.uid-info span:first-child').textContent.toLowerCase();
                    if (uidText.includes(searchTerm)) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });

        } catch (error) {
            console.error('Failed to load UID details:', error);
            modalUidList.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`; // Tetap Error
        }
    }

    // === FUNGSI DIPERBARUI: Logika untuk pencarian dari halaman inventaris (Nama Produk atau UID) ===
    async function handleInventoryUidSearch() {
        const searchInput = document.getElementById('inventory-uid-search-input');
        const searchTerm = searchInput.value.trim().toLowerCase();
        if (!searchTerm) {
            // Jika input kosong, tampilkan semua baris lagi
            document.querySelectorAll('#inventory-table tbody tr').forEach(row => row.style.display = '');
            return;
        }

        // 1. Coba filter berdasarkan nama produk
        const inventoryRows = document.querySelectorAll('#inventory-table tbody tr');
        let matchFound = false;
        inventoryRows.forEach(row => {
            const productName = row.cells[1].textContent.toLowerCase();
            if (productName.includes(searchTerm)) {
                row.style.display = '';
                matchFound = true;
            } else {
                row.style.display = 'none';
            }
        });

        // 2. Jika tidak ada nama produk yang cocok, coba cari sebagai UID
        if (!matchFound) {
            try {
            const response = await fetch(`http://localhost:3000/api/admin/tag-details/${searchTerm}`, { headers: getAuthHeaders() });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Tag not found.');
            // Tetap gunakan searchTerm untuk highlight
            showUidDetails(data.productId, data.productName, searchTerm);
            } catch (error) {
                showAlert(`Tidak ada nama produk yang cocok dengan '${searchTerm}', dan tidak ditemukan sebagai UID.`);
            }
        }
    }

    // === FUNGSI BARU: Tutup Modal ===
    function closeModal() {
        modalOverlay.classList.add('hidden');
    }

    // Listener untuk tombol tutup modal (X)
    modalCloseBtn.addEventListener('click', closeModal);
    // Listener untuk klik di luar modal
    modalOverlay.addEventListener('click', (event) => {
        if (event.target === modalOverlay) {
            closeModal();
        }
    });

    // === LISTENER BARU: Untuk tombol pencarian UID di inventaris ===
    document.getElementById('inventory-uid-search-btn').addEventListener('click', handleInventoryUidSearch);
    document.getElementById('inventory-uid-search-input').addEventListener('keypress', (e) => e.key === 'Enter' && handleInventoryUidSearch());

    // === LOGIKA LAPORAN (Tidak Berubah) ===
    document.getElementById('report-period').addEventListener('change', (e) => {
        const customDateDiv = document.getElementById('custom-date-range');
        if (e.target.value === 'custom') {
            customDateDiv.style.display = 'block';
        } else {
            customDateDiv.style.display = 'none';
        }
    });

    document.getElementById('get-report-btn').addEventListener('click', async () => {
        const period = document.getElementById('report-period').value;
        const resultsDiv = document.getElementById('report-results'); 
        resultsDiv.innerHTML = '<p>Loading report...</p>';
        let queryParams = `?period=${period}`;
        if (period === 'custom') {
            const startDate = document.getElementById('start-date').value;
            const endDate = document.getElementById('end-date').value;
            if (!startDate || !endDate) { 
                showAlert('Harap pilih tanggal mulai dan tanggal akhir untuk rentang kustom.');
                resultsDiv.innerHTML = '';
                return;
            }
            queryParams += `&startDate=${startDate}&endDate=${endDate}`;
        }
        try {
            const response = await fetch(`http://localhost:3000/api/admin/reports${queryParams}`, {
                headers: getAuthHeaders()
            });
            if (!response.ok) { 
                throw new Error(`Gagal mengambil laporan: ${response.statusText}`);
            }
            const data = await response.json();
            displayReport(data); 
        } catch (error) {
            console.error('Failed to get report:', error);
            if (error.message.includes('401') || error.message.includes('403')) {
                showAlert('Session expired or invalid. Please log in again.');
                localStorage.removeItem('authToken');
                window.location.href = 'login.html';
            }
            resultsDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        }
    });

    // --- FUNGSI BARU: Ekspor Laporan ke CSV ---
    function exportReportToCSV(data) {
        if (!data || !data.transactions || data.transactions.length === 0) { 
            alert('Tidak ada data yang tersedia untuk diekspor.');
            return;
        }

        const headers = [
            "ID Transaksi",
            "Tanggal & Waktu",
            "Harga Asli (IDR)",
            "Discount (IDR)",
            "Total Amount (IDR)",
            "Payment Status",
            "Item Count",
            "Products Sold"
        ];

        // Fungsi untuk memastikan data CSV aman (menangani koma dalam teks)
        const escapeCSV = (str) => {
            // Jika string mengandung koma, bungkus dengan tanda kutip ganda
            if (String(str).includes(',')) {
                return `"${str}"`;
            }
            return str;
        };

        // --- PERBAIKAN: Buat nama file yang lebih deskriptif ---
        let fileName = 'report';
        if (data.period === 'custom') {
            // Ambil tanggal dari input untuk nama file
            const startDate = document.getElementById('start-date').value;
            const endDate = document.getElementById('end-date').value;
            fileName = `report_custom_${startDate}_to_${endDate}.csv`;
        } else if (data.period !== 'all-time') {
            const today = new Date().toISOString().split('T')[0];
            fileName = `report_${data.period}_${today}.csv`;
        } else {
            fileName = 'report_all-time.csv';
        }
        // --- AKHIR PERBAIKAN ---

        const formatDateForCSV = (dateString) => new Date(dateString).toLocaleString('sv-SE'); // Format YYYY-MM-DD HH:MM:SS

        const rows = data.transactions.map(tx => [
            tx.transaction_id,
            formatDateForCSV(tx.created_at),
            tx.subtotal,
            tx.discount_amount,
            tx.total_amount,
            tx.payment_status,
            tx.item_count,
            escapeCSV(tx.product_names)
        ].join(','));

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", fileName); // Gunakan nama file yang sudah diperbaiki
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function displayReport(data) {
        const resultsDiv = document.getElementById('report-results');
        const formatter = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 });
        const formatDate = (dateString) => new Date(dateString).toLocaleString('id-ID', { 
            dateStyle: 'medium',
            timeStyle: 'short'
        });
        let summaryHtml = `
            <h3>Ringkasan Laporan (Periode: ${data.period})</h3>
            <div id="report-summary">
                <p>Total Harga Asli: <strong>${formatter.format(data.summary.totalSubtotal)}</strong></p>                
                <p>Total Diskon Diberikan: <strong>${formatter.format(data.summary.totalDiscount)}</strong></p>
                <p>Total Penjualan: <strong>${formatter.format(data.summary.totalSales)}</strong></p>
                <p>Total Transaksi: <strong>${data.summary.totalTransactions}</strong></p>
            </div>
        `;

        // Tambahkan tombol Export setelah summary
        const exportButtonHtml = `<button id="export-csv-btn" class="export-btn">Ekspor ke CSV</button>`;

        let tableHtml = `
            <h3>Riwayat Transaksi</h3>
            <table>
                <thead>
                    <tr>
                        <th>ID Transaksi</th>
                        <th>Tanggal & Waktu</th>
                        <th>Jumlah Total</th>
                        <th>Harga Asli</th>
                        <th>Diskon</th>
                        <th>Status Pembayaran</th>
                        <th>Item</th>
                        <th>Produk Terjual</th>
                    </tr>
                </thead>
                <tbody>
        `;
        if (data.transactions.length === 0) {
            tableHtml += '<tr><td colspan="8">No transactions found for this period.</td></tr>';
        } else {
            for (const tx of data.transactions) {
                tableHtml += `
                    <tr>
                        <td>${tx.transaction_id}</td>
                        <td>${formatDate(tx.created_at)}</td>
                        <td>${formatter.format(tx.total_amount)}</td>
                        <td>${formatter.format(tx.subtotal)}</td>
                        <td>${formatter.format(tx.discount_amount)}</td>
                        <td><span class="status-badge status-${tx.payment_status}">${tx.payment_status}</span></td>
                        <td>${tx.item_count}</td>
                        <td>${tx.product_names}</td>
                    </tr>
                `;
            }
        }
        tableHtml += `</tbody></table>`;
        resultsDiv.innerHTML = summaryHtml + exportButtonHtml + tableHtml;

        // Tambahkan listener untuk tombol export yang baru dibuat
        const exportBtn = document.getElementById('export-csv-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => exportReportToCSV(data));
        }
    }

    // === FUNGSI BARU: KELOLA HALAMAN DISKON ===
    async function loadDiscountsPage() {
        const container = document.getElementById('existing-discounts-list');
        container.innerHTML = '<p>Memuat aturan diskon...</p>';

        // Perbaikan: Muat produk ke dropdown setiap kali halaman diskon dibuka
        const discountProductSelector = document.getElementById('discount-product-selector');
        discountProductSelector.innerHTML = '<option value="">Memuat produk...</option>';
        try {
            // Perbaikan: Tambahkan header otentikasi untuk mengambil produk
            const productsResponse = await fetch('http://localhost:3000/api/admin/products', {
                headers: getAuthHeaders()
            });
            if (!productsResponse.ok) throw new Error('Gagal mengambil produk');

            const products = await productsResponse.json();
            discountProductSelector.innerHTML = ''; // Kosongkan sebelum mengisi
            discountProductSelector.add(new Option('--- Select a Product ---', ''));
            products.forEach(p => {
                discountProductSelector.add(new Option(`${p.name} (ID: ${p.product_id})`, p.product_id));
            });
        } catch (error) { 
            console.error('Gagal memuat produk untuk formulir diskon:', error);
            discountProductSelector.innerHTML = '<option value="">Gagal memuat produk</option>';
        }

        // Muat aturan diskon yang ada
        try {
            const response = await fetch('http://localhost:3000/api/admin/discounts', {
                headers: getAuthHeaders()
            });
            const discounts = await response.json();
            displayDiscountRules(discounts);
        } catch (error) {
            container.innerHTML = '<p style="color: red;">Gagal memuat aturan diskon.</p>';
            console.error(error);
        }
    }

    function displayDiscountRules(discounts) {
        const container = document.getElementById('existing-discounts-list');
        if (discounts.length === 0) { 
            container.innerHTML = '<p>Belum ada aturan diskon yang dibuat.</p>';
            return;
        }
        let tableHtml = `
            <table>
                <thead>
                    <tr>
                        <th>Name</th><th>%</th><th>Type</th><th>Target</th><th>Period</th><th>Status</th><th>Action</th>
                    </tr> 
                </thead>
                <tbody>`;
        discounts.forEach(d => {
            const target = d.targetType === 'product' ? `ID Produk: ${d.targetId}` : 'Global';
            const period = d.startDate && d.endDate ? `${d.startDate} hingga ${d.endDate}` : 'Selalu Aktif';
            const statusClass = d.isActive ? 'status-active' : 'status-inactive';
            const statusText = d.isActive ? 'Aktif' : 'Tidak Aktif';
            const toggleButtonText = d.isActive ? 'Nonaktifkan' : 'Aktifkan';
            const toggleButtonClass = d.isActive ? 'toggle-btn-deactivate' : 'toggle-btn-activate';

            tableHtml += `
                <tr class="${statusClass}">
                    <td>${d.name}</td>
                    <td>${d.percentage}%</td>
                    <td>${d.targetType}</td>
                    <td>${target}</td>
                    <td>${period}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <button class="toggle-discount-btn ${toggleButtonClass}" data-discount-id="${d.id}">${toggleButtonText}</button> 
                        <button class="delete-discount-btn" data-discount-id="${d.id}">Delete</button>
                    </td>
                </tr>`;
        });
        tableHtml += '</tbody></table>';
        container.innerHTML = tableHtml;

        // Tambahkan listener untuk tombol hapus
        document.querySelectorAll('.delete-discount-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.discountId;
                showConfirm(`Are you sure you want to delete discount rule ID ${id}?`, async () => {
                    try {
                        await fetch(`http://localhost:3000/api/admin/discounts/${id}`, {
                            method: 'DELETE',
                            headers: getAuthHeaders()
                        });
                        loadDiscountsPage(); // Muat ulang
                    } catch (error) {
                        showAlert('Failed to delete discount rule.');
                    }
                });
            });
        });

        // Tambahkan listener untuk tombol toggle
        document.querySelectorAll('.toggle-discount-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.discountId;
                await fetch(`http://localhost:3000/api/admin/discounts/${id}/toggle`, {
                    method: 'PUT',
                    headers: getAuthHeaders()
                });
                loadDiscountsPage(); // Muat ulang 
            });
        });
    }

    document.getElementById('discount-type').addEventListener('change', (e) => {
        const productSelector = document.getElementById('discount-product-selector-div');
        if (e.target.value === 'product') {
            productSelector.classList.remove('hidden');
        } else {
            productSelector.classList.add('hidden');
        }
    });

    document.getElementById('create-discount-btn').addEventListener('click', async () => {
        const rule = {
            name: document.getElementById('discount-name').value,
            percentage: parseFloat(document.getElementById('discount-percentage').value),
            targetType: document.getElementById('discount-type').value,
            targetId: document.getElementById('discount-product-selector').value,
            startDate: document.getElementById('discount-start-date').value || null,
            endDate: document.getElementById('discount-end-date').value || null,
        };

        if (!rule.name || isNaN(rule.percentage)) {
            showAlert('Harap isi nama dan persentase diskon.');
            return;
        }

        try {
            await fetch('http://localhost:3000/api/admin/discounts', {
                method: 'POST',
                headers: getAuthHeaders(), 
                body: JSON.stringify(rule)
            });
            showAlert('Aturan diskon berhasil dibuat!');
            loadDiscountsPage(); // Muat ulang
        } catch (error) {
            showAlert('Failed to create discount rule.');
            console.error(error);
        }
    });

    // Picu klik otomatis saat halaman dimuat
    document.getElementById('get-report-btn').click();

    // === BARU: Mulai koneksi WebSocket untuk admin panel ===
    setupAdminRfidWebSocket();

});