// Import fungsi yang diperlukan dari Firebase SDK
import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    // Cek status autentikasi pengguna saat halaman dimuat
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Jika pengguna sudah login, arahkan ke panel admin
            console.log('User is already logged in, redirecting to admin panel.');
            window.location.href = '../admin/admin.html';
        }
    });

    const loginBtn = document.getElementById('login-btn');
    const emailInput = document.getElementById('email'); // Diubah dari username
    const passwordInput = document.getElementById('password');
    const errorDiv = document.getElementById('login-error');

    const handleLogin = async () => {
        const email = emailInput.value;
        const password = passwordInput.value;
        errorDiv.style.display = 'none';

        if (!email || !password) {
            errorDiv.textContent = 'Email dan password harus diisi.';
            errorDiv.style.display = 'block';
            return;
        }

        // Nonaktifkan tombol dan beri umpan balik ke pengguna
        loginBtn.disabled = true;
        loginBtn.textContent = 'Logging in...';

        try {
            // Login menggunakan Firebase Auth
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            // Login berhasil, Firebase akan secara otomatis menangani sesi.
            // onAuthStateChanged di atas akan mendeteksi perubahan dan melakukan redirect.
            console.log('Login successful:', userCredential.user);
        } catch (error) {
            console.error('Firebase login error:', error);
            // Menampilkan pesan error yang lebih ramah pengguna
            errorDiv.textContent = 'Email atau password salah. Silakan coba lagi.';
            errorDiv.style.display = 'block';

            // Aktifkan kembali tombol HANYA jika terjadi error
            loginBtn.disabled = false;
            loginBtn.textContent = 'Login';
        }
    };

    loginBtn.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    emailInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
});
