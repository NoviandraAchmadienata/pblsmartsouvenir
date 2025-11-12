document.addEventListener('DOMContentLoaded', () => {

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
        });
    });

    // === FUNGSI: Muat Produk ===
    async function loadProducts() {
        productDropdown.innerHTML = '<option value="">Loading...</option>';
        productListDiv.innerHTML = '<p>Loading...</p>';
        const discountProductSelector = document.getElementById('discount-product-selector');
        discountProductSelector.innerHTML = '<option value="">Loading...</option>';

        try {
            const response = await fetch('http://localhost:3000/api/admin/products');
            if (!response.ok) throw new Error('Failed to fetch products');
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
                    <td style="display: flex; gap: 5px; justify-content: center;">
                        <button class="edit-product-btn" data-product-id="${product.product_id}">Edit</button>
                        <button class="delete-product-btn" data-product-id="${product.product_id}">Hapus</button>
                    </td>
                `;
            }
            addDeleteProductListeners();
            addEditProductListeners(); // Panggil listener untuk tombol edit
        } catch (error) {
            console.error('Failed to load products:', error);
            productDropdown.innerHTML = '<option value="">Error loading</option>';
            discountProductSelector.innerHTML = '<option value="">Error loading</option>';
            productListDiv.innerHTML = '<p style="color: red;">Error loading products.</p>';
        }
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
        if (!confirm(`Yakin ingin menghapus produk ID ${productId}? \nIni tidak dapat dibatalkan.`)) {
            return;
        }
        try {
            const response = await fetch(`http://localhost:3000/api/admin/products/define/${productId}`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Gagal menghapus produk');
            }
            alert('Produk berhasil dihapus.');
            loadProducts(); // Muat ulang daftar
        } catch (error) {
            console.error('Error deleting product:', error);
            alert(`Error: ${error.message}.`);
        }
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
            alert('Product data not found. Please refresh.');
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
            alert('Please provide a valid name and price.');
            return;
        }

        try {
            const response = await fetch(`http://localhost:3000/api/admin/products/define/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, price })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to update product');
            }
            alert('Product updated successfully!');
            closeEditModal();
            loadProducts(); // Muat ulang daftar produk
        } catch (error) {
            alert(`Error: ${error.message}`);
            console.error('Error updating product:', error);
        }
    });

    // === LOGIKA: Tambah Produk ===
    document.getElementById('add-product-btn').addEventListener('click', async () => {
        const name = document.getElementById('new-prod-name').value;
        const price = parseFloat(document.getElementById('new-prod-price').value);
        if (!name || !price) {
            alert('Please enter both product name and price.');
            return;
        }
        try {
            const response = await fetch('http://localhost:3000/api/admin/products/define', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, price })
            });
            const newProduct = await response.json();
            alert(`Product added: ${newProduct.name}`);
            document.getElementById('new-prod-name').value = '';
            document.getElementById('new-prod-price').value = '';
            loadProducts(); // Muat ulang daftar
        } catch (error) {
            console.error('Failed to add product:', error);
            alert('An error occurred. Check the console.');
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
            alert('Please select a product AND scan an RFID tag.');
            return;
        }

        registerBtn.disabled = true; // Nonaktifkan tombol
        registerBtn.textContent = 'Registering...';
        try {
            const response = await fetch('http://localhost:3000/api/admin/rfid/register', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ product_id: parseInt(product_id), uid: uid })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Gagal mendaftarkan tag');
            }
            alert(`Tag ${uid} has been registered to product ID ${product_id}!`);
            document.getElementById('prod-select-dropdown').value = '';
            document.getElementById('prod-uid').value = '';
        } catch (error) {
            console.error('Failed to register tag:', error);
            alert(`Error: ${error.message}.`);
        } finally {
            registerBtn.disabled = false; // Aktifkan kembali tombol
            registerBtn.textContent = 'Register Tag';
        }
    });

    // === FUNGSI BARU: Muat Inventaris ===
    async function loadInventory() {
        inventoryListContainer.innerHTML = '<p>Loading inventory data...</p>';
        try {
            const response = await fetch('http://localhost:3000/api/admin/inventory');
            if (!response.ok) throw new Error('Failed to fetch inventory');
            const inventory = await response.json();

            // Buat tabel
            inventoryListContainer.innerHTML = `
                <table id="inventory-table">
                    <thead>
                        <tr>
                            <th>Product ID</th>
                            <th>Product Name</th>
                            <th>Stock (Active Tags)</th>
                        </tr>
                    </thead>
                    <tbody>
                    </tbody>
                </table>
            `;
            const inventoryTableBody = inventoryListContainer.querySelector('tbody');

            if (inventory.length === 0) {
                inventoryTableBody.innerHTML = '<tr><td colspan="3">No active inventory found.</td></tr>';
                return;
            }

            // Isi tabel
            for (const item of inventory) {
                const row = inventoryTableBody.insertRow();
                row.classList.add('inventory-row'); // Class untuk klik
                row.setAttribute('data-product-id', item.product_id);
                row.setAttribute('data-product-name', item.name);
                row.innerHTML = `
                    <td>${item.product_id}</td>
                    <td>${item.name}</td>
                    <td><strong>${item.stock}</strong> pcs</td>
                `;
            }
            
            // Tambahkan event listener ke tabel
            addInventoryClickListeners();

        } catch (error) {
            console.error('Failed to load inventory:', error);
            inventoryListContainer.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        }
    }

    // === FUNGSI BARU: Tambah listener ke baris inventaris ===
    function addInventoryClickListeners() {
        document.querySelectorAll('.inventory-row').forEach(row => {
            row.addEventListener('click', () => {
                const productId = row.getAttribute('data-product-id');
                const productName = row.getAttribute('data-product-name');
                showUidDetails(productId, productName);
            });
        });
    }

    // === FUNGSI BARU: Tampilkan Modal Detail UID ===
    async function showUidDetails(productId, productName) {
        modalProductName.textContent = productName;
        modalUidList.innerHTML = '<p>Loading UIDs...</p>';
        modalOverlay.classList.remove('hidden'); // Tampilkan modal

        try {
            const response = await fetch(`http://localhost:3000/api/admin/inventory/details/${productId}`);
            if (!response.ok) throw new Error('Failed to fetch UID details');
            const uids = await response.json(); // Harusnya array of strings

            modalUidList.innerHTML = ''; // Kosongkan
            
            if (uids.length === 0) {
                modalUidList.innerHTML = '<p>No active UIDs found for this product.</p>';
                return;
            }

            // Isi daftar UID
            uids.forEach(uid => {
                const uidEl = document.createElement('span');
                uidEl.textContent = uid;
                modalUidList.appendChild(uidEl);
            });

        } catch (error) {
            console.error('Failed to load UID details:', error);
            modalUidList.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
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
                alert('Please select both start and end dates for custom range.');
                resultsDiv.innerHTML = '';
                return;
            }
            queryParams += `&startDate=${startDate}&endDate=${endDate}`;
        }
        try {
            const response = await fetch(`http://localhost:3000/api/admin/reports${queryParams}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch report: ${response.statusText}`);
            }
            const data = await response.json();
            displayReport(data);
        } catch (error) {
            console.error('Failed to get report:', error);
            resultsDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
        }
    });

    function displayReport(data) {
        const resultsDiv = document.getElementById('report-results');
        const formatter = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 2
        });
        const formatDate = (dateString) => new Date(dateString).toLocaleString('id-ID', {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
        let summaryHtml = `
            <h3>Report Summary (Period: ${data.period})</h3>
            <div id="report-summary">
                <p>Total Sales: <strong>${formatter.format(data.summary.totalSales)}</strong></p>
                <p>Total Transactions: <strong>${data.summary.totalTransactions}</strong></p>
            </div>
        `;
        let tableHtml = `
            <h3>Transaction History</h3>
            <table>
                <thead>
                    <tr>
                        <th>Transaction ID</th>
                        <th>Date & Time</th>
                        <th>Total Amount</th>
                        <th style="width: 120px;">Payment Status</th>
                        <th style="width: 80px;">Items</th>
                        <th>Products Sold</th>
                    </tr>
                </thead>
                <tbody>
        `;
        if (data.transactions.length === 0) {
            tableHtml += '<tr><td colspan="6">No transactions found for this period.</td></tr>';
        } else {
            for (const tx of data.transactions) {
                tableHtml += `
                    <tr>
                        <td>${tx.transaction_id}</td>
                        <td>${formatDate(tx.created_at)}</td>
                        <td>${formatter.format(tx.total_amount)}</td>
                        <td><span class="status-${tx.payment_status}">${tx.payment_status}</span></td>
                        <td>${tx.item_count}</td>
                        <td style="max-width: 300px; word-wrap: break-word;">${tx.product_names}</td>
                    </tr>
                `;
            }
        }
        tableHtml += `</tbody></table>`;
        resultsDiv.innerHTML = summaryHtml + tableHtml;
    }

    // === FUNGSI BARU: KELOLA HALAMAN DISKON ===
    async function loadDiscountsPage() {
        const container = document.getElementById('existing-discounts-list');
        container.innerHTML = '<p>Loading discount rules...</p>';

        // Muat aturan diskon yang ada
        try {
            const response = await fetch('http://localhost:3000/api/admin/discounts');
            const discounts = await response.json();
            displayDiscountRules(discounts);
        } catch (error) {
            container.innerHTML = '<p style="color: red;">Failed to load discount rules.</p>';
            console.error(error);
        }
    }

    function displayDiscountRules(discounts) {
        const container = document.getElementById('existing-discounts-list');
        if (discounts.length === 0) {
            container.innerHTML = '<p>No discount rules created yet.</p>';
            return;
        }
        let tableHtml = `
            <table>
                <thead>
                    <tr>
                        <th>Name</th><th>%</th><th>Type</th><th>Target</th><th>Period</th><th>Action</th>
                    </tr>
                </thead>
                <tbody>`;
        discounts.forEach(d => {
            const target = d.targetType === 'product' ? `Product ID: ${d.targetId}` : 'Global';
            const period = d.startDate && d.endDate ? `${d.startDate} to ${d.endDate}` : 'Always Active';
            tableHtml += `
                <tr>
                    <td>${d.name}</td>
                    <td>${d.percentage}%</td>
                    <td>${d.targetType}</td>
                    <td>${target}</td>
                    <td>${period}</td>
                    <td><button class="delete-discount-btn" data-discount-id="${d.id}">Delete</button></td>
                </tr>`;
        });
        tableHtml += '</tbody></table>';
        container.innerHTML = tableHtml;

        // Tambahkan listener untuk tombol hapus
        document.querySelectorAll('.delete-discount-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.dataset.discountId;
                if (confirm(`Are you sure you want to delete discount rule ID ${id}?`)) {
                    await fetch(`http://localhost:3000/api/admin/discounts/${id}`, { method: 'DELETE' });
                    loadDiscountsPage(); // Muat ulang
                }
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
            alert('Please fill in discount name and percentage.');
            return;
        }

        try {
            await fetch('http://localhost:3000/api/admin/discounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rule)
            });
            alert('Discount rule created successfully!');
            loadDiscountsPage(); // Muat ulang
        } catch (error) {
            alert('Failed to create discount rule.');
            console.error(error);
        }
    });

    // Picu klik otomatis saat halaman dimuat
    document.getElementById('get-report-btn').click();

});