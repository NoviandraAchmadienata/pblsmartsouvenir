// Import fungsi yang diperlukan dari SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Konfigurasi proyek Firebase Anda
const firebaseConfig = {
  apiKey: "AIzaSyBGqKOXKaxcLrZ-0a4Anbv0PN54QPOQ42w",
  authDomain: "smartsouvenirshop.firebaseapp.com",
  databaseURL: "https://smartsouvenirshop-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smartsouvenirshop",
  storageBucket: "smartsouvenirshop.appspot.com",
  messagingSenderId: "911259127417",
  appId: "1:911259127417:web:d310c42d360b7ef1480ea8",
  measurementId: "G-CBVLFN16ZF"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);

// Ekspor instance Firebase Auth untuk digunakan di file lain
export const auth = getAuth(app);