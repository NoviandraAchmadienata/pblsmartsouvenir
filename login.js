document.addEventListener('DOMContentLoaded', () => {
    // Jika sudah ada token, langsung redirect ke admin panel
    if (localStorage.getItem('authToken')) {
        window.location.href = 'admin.html';
    }

    const loginBtn = document.getElementById('login-btn');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorDiv = document.getElementById('login-error');

    async function handleLogin() {
        const username = usernameInput.value;
        const password = passwordInput.value;
        errorDiv.style.display = 'none';

        try {
            const response = await fetch('http://localhost:3000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                // Simpan token di localStorage
                localStorage.setItem('authToken', data.token);
                // Redirect ke halaman admin
                window.location.href = 'admin.html';
            } else {
                errorDiv.textContent = data.message || 'Login failed.';
                errorDiv.style.display = 'block';
            }
        } catch (error) {
            console.error('Login error:', error);
            errorDiv.textContent = 'An error occurred. Please try again.';
            errorDiv.style.display = 'block';
        }
    }

    loginBtn.addEventListener('click', handleLogin);
    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleLogin();
        }
    });
});
