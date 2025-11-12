/*
  Kasir Self-Service - Single-file React component (Tailwind)

  Fitur:
  - Menerima event RFID melalui WebSocket (mis. dari middleware yang terhubung ke RFID reader/gate)
  - Menampilkan daftar produk yang discan beserta harga, qty, subtotal
  - Mengizinkan pelanggan men-scan banyak produk sebelum checkout
  - Integrasi antarmuka dengan endpoint backend (produk dari RFID, simpan transaksi ke DB)
  - Integrasi sederhana QRIS: memanggil endpoint backend untuk membuat pembayaran QRIS dan menampilkan QR code

  Catatan integrasi backend (harus diimplementasikan di server):
  - WebSocket endpoint (server-side) akan menerima event dari hardware RFID reader/gate
    Event sample (JSON): { "rfid": "E2000016...", "antenna": 1, "timestamp": 123456789 }
  - GET /api/products/by-rfid/:rfid -> returns product info { id, name, price, sku }
  - POST /api/checkout -> body: { items: [{productId, qty}], payment: {method: 'qris'|'cash'|'card', qrisId? } }
  - POST /api/qris/create -> body: { amount, orderId } -> returns { qrisUrl, qrisId }

  Backend suggestions:
  - RFID middleware program (python/node) listening to RFID readers -> push to WebSocket server
  - DB: MySQL/Postgres for product & transactions
  - QRIS: Integrate with aggregator/payment gateway (e.g. Midtrans/Tripay/Payment Provider lokal)

  Penjelasan singkat flow:
  RFID reader -> middleware -> push event ke WebSocket server -> frontend menerima rfid -> fetch produk -> tambahkan ke cart
  Ketika pelanggan tekan "Bayar dengan QRIS" -> frontend panggil /api/qris/create -> terima qrisUrl -> tampilkan QR code
  Backend akan mengecek notifikasi/callback dari payment gateway untuk menandai transaksi "lunas"
*/

import React, { useEffect, useState, useRef } from 'react'

// Jika library QRCode dibutuhkan, kita bisa gunakan qrcode.react. Karena ini file tunggal, gunakan dynamic import pada runtime.
// Pastikan memasang: npm install qrcode.react

export default function KasirSelfService() {
  const [cart, setCart] = useState([])
  const [subtotal, setSubtotal] = useState(0)
  const [wsStatus, setWsStatus] = useState('disconnected')
  const wsRef = useRef(null)
  const [scanning, setScanning] = useState(true)
  const [qrisModal, setQrisModal] = useState({ open: false, qrisUrl: null, qrisId: null })
  const [loadingQris, setLoadingQris] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    // hitung subtotal tiap kali cart berubah
    const s = cart.reduce((acc, it) => acc + it.price * it.qty, 0)
    setSubtotal(Number(s.toFixed(2)))
  }, [cart])

  useEffect(() => {
    // connect to WebSocket server (ganti url sesuai server kamu)
    // server WebSocket bertugas menerima event dari RFID middleware
    const WS_URL = 'ws://localhost:8080/ws/rfid' // contoh
    let ws
    try {
      ws = new WebSocket(WS_URL)
      wsRef.current = ws
      ws.onopen = () => setWsStatus('connected')
      ws.onclose = () => setWsStatus('disconnected')
      ws.onerror = (err) => {
        console.error('WS error', err)
        setWsStatus('error')
      }
      ws.onmessage = (evt) => {
        // pesan dari server diharapkan JSON dengan field 'rfid'
        try {
          const d = JSON.parse(evt.data)
          if (d.rfid) {
            handleRfidScan(d.rfid)
          }
        } catch (e) {
          console.error('Invalid WS message', e)
        }
      }
    } catch (e) {
      console.error('WS connection failed', e)
      setWsStatus('error')
    }
    return () => {
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  async function handleRfidScan(rfidTag) {
    if (!scanning) return
    try {
      setMessage(`RFID terdeteksi: ${rfidTag}. Mencari produk...`)
      const res = await fetch(`/api/products/by-rfid/${encodeURIComponent(rfidTag)}`)
      if (!res.ok) {
        setMessage('Produk tidak ditemukan untuk tag ini.')
        return
      }
      const product = await res.json()
      // product: { id, name, price, sku }
      addToCart(product)
      setMessage(`Menambahkan: ${product.name}`)
      setTimeout(() => setMessage(null), 3000)
    } catch (e) {
      console.error(e)
      setMessage('Gagal mengambil data produk dari server')
    }
  }

  function addToCart(product) {
    setCart(prev => {
      const foundIdx = prev.findIndex(p => p.id === product.id)
      if (foundIdx >= 0) {
        const copy = [...prev]
        copy[foundIdx] = { ...copy[foundIdx], qty: copy[foundIdx].qty + 1 }
        return copy
      }
      return [...prev, { id: product.id, name: product.name, price: Number(product.price), qty: 1 }]
    })
  }

  function changeQty(productId, delta) {
    setCart(prev => prev.map(it => it.id === productId ? { ...it, qty: Math.max(1, it.qty + delta) } : it))
  }

  function removeItem(productId) {
    setCart(prev => prev.filter(it => it.id !== productId))
  }

  async function createQrisPayment() {
    if (cart.length === 0) return
    setLoadingQris(true)
    try {
      const orderId = `order-${Date.now()}`
      const body = { amount: subtotal, orderId, items: cart }
      const res = await fetch('/api/qris/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      // data: { qrisUrl, qrisId }
      if (data.qrisUrl) {
        setQrisModal({ open: true, qrisUrl: data.qrisUrl, qrisId: data.qrisId })
      } else {
        setMessage('Gagal membuat pembayaran QRIS')
      }
    } catch (e) {
      console.error(e)
      setMessage('Terjadi kesalahan saat membuat QRIS')
    } finally {
      setLoadingQris(false)
    }
  }

  async function pollPaymentStatus(qrisId) {
    // Polling sederhana ke server untuk cek status pembayaran
    try {
      const res = await fetch(`/api/qris/status/${encodeURIComponent(qrisId)}`)
      const data = await res.json()
      return data // { status: 'pending'|'paid' }
    } catch (e) {
      console.error(e)
      return { status: 'error' }
    }
  }

  async function confirmCheckout(paymentMethod, qrisId = null) {
    const body = { items: cart.map(i => ({ productId: i.id, qty: i.qty })), payment: { method: paymentMethod, qrisId } }
    const res = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) {
      setMessage('Transaksi berhasil, terima kasih!')
      setCart([])
      setQrisModal({ open: false, qrisUrl: null, qrisId: null })
    } else {
      setMessage('Checkout gagal. Coba lagi.')
    }
  }

  // UI
  return (
    <div className="min-h-screen bg-slate-50 p-6 flex gap-6">
      <div className="w-96 bg-white rounded-2xl shadow p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Kasir Self-Service</h2>
          <div className="text-sm text-slate-500">WS: {wsStatus}</div>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="space-y-3">
            {cart.length === 0 && <div className="text-slate-500">Silakan scan produk menggunakan RFID untuk mulai berbelanja.</div>}
            {cart.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-slate-500">Rp {Number(item.price).toLocaleString('id-ID')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => changeQty(item.id, -1)} className="px-2 py-1 bg-slate-100 rounded">-</button>
                  <div className="w-6 text-center">{item.qty}</div>
                  <button onClick={() => changeQty(item.id, 1)} className="px-2 py-1 bg-slate-100 rounded">+</button>
                  <div className="w-24 text-right font-semibold">Rp {(item.price * item.qty).toLocaleString('id-ID')}</div>
                  <button onClick={() => removeItem(item.id)} className="ml-2 px-2 py-1 bg-red-50 text-red-600 rounded">Hapus</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-slate-600">Subtotal</div>
            <div className="text-xl font-bold">Rp {subtotal.toLocaleString('id-ID')}</div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setScanning(s => !s)} className="flex-1 py-2 rounded-lg border">
              {scanning ? 'Stop Scanning' : 'Start Scanning'}
            </button>
            <button onClick={createQrisPayment} className="flex-1 py-2 rounded-lg bg-green-600 text-white" disabled={cart.length === 0 || loadingQris}>
              {loadingQris ? 'Membuat QRIS...' : 'Bayar dengan QRIS'}
            </button>
          </div>

          <div className="mt-2 text-xs text-slate-500">Atau minta kasir untuk pembayaran tunai/kartu.</div>
        </div>

        {message && <div className="mt-3 p-2 bg-blue-50 text-blue-700 rounded">{message}</div>}
      </div>

      <div className="flex-1 bg-white rounded-2xl shadow p-6 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Ringkasan Pembayaran</h3>
          <div className="text-sm text-slate-500">{new Date().toLocaleString()}</div>
        </div>

        <div className="flex-1">
          <table className="w-full text-sm">
            <thead className="text-slate-500 text-left">
              <tr>
                <th>Produk</th>
                <th>Qty</th>
                <th className="text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {cart.map(it => (
                <tr key={it.id} className="border-b">
                  <td className="py-2">{it.name}</td>
                  <td>{it.qty}</td>
                  <td className="text-right">Rp {(it.price * it.qty).toLocaleString('id-ID')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm">Total</div>
            <div className="text-2xl font-bold">Rp {subtotal.toLocaleString('id-ID')}</div>
          </div>

          <div className="flex gap-3">
            <button className="flex-1 py-2 rounded bg-gray-100" onClick={() => confirmCheckout('cash')}>Bayar Tunai</button>
            <button className="flex-1 py-2 rounded bg-gray-100" onClick={() => confirmCheckout('card')}>Bayar Kartu</button>
            <button className="flex-1 py-2 rounded bg-emerald-600 text-white" onClick={() => createQrisPayment()}>Bayar QRIS</button>
          </div>
        </div>
      </div>

      {/* QRIS Modal */}
      {qrisModal.open && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-96">
            <h4 className="text-lg font-semibold mb-3">Bayar dengan QRIS</h4>
            <div className="mb-4">Scan QR berikut menggunakan aplikasi bank/QRIS:</div>
            <div className="flex justify-center mb-4">
              {/* tampilkan QR code. gunakan tag <img> jika backend mengembalikan URL gambar, atau gunakan qrcode.react jika ada library */}
              {qrisModal.qrisUrl ? (
                <img src={qrisModal.qrisUrl} alt="QRIS" className="w-56 h-56 object-contain" />
              ) : (
                <div className="w-56 h-56 bg-slate-100 flex items-center justify-center">QR tdk tersedia</div>
              )}
            </div>

            <div className="flex gap-2">
              <button className="flex-1 py-2 rounded border" onClick={() => setQrisModal({ open: false, qrisUrl: null, qrisId: null })}>Batal</button>
              <button
                className="flex-1 py-2 rounded bg-emerald-600 text-white"
                onClick={async () => {
                  // Poll pembayaran sampai status 'paid' (sederhana)
                  if (!qrisModal.qrisId) return
                  setMessage('Menunggu konfirmasi pembayaran...')
                  const interval = setInterval(async () => {
                    const st = await pollPaymentStatus(qrisModal.qrisId)
                    if (st.status === 'paid') {
                      clearInterval(interval)
                      setMessage('Pembayaran terkonfirmasi. Terima kasih!')
                      await confirmCheckout('qris', qrisModal.qrisId)
                    }
                  }, 3000)
                }}
              >
                Selesai (Cek Status)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/*
  Backend pseudo-code (Node/Express) - contoh minimal:

  const express = require('express')
  const app = express()
  app.use(express.json())

  // GET product by rfid
  app.get('/api/products/by-rfid/:rfid', async (req, res) => {
    const rfid = req.params.rfid
    // query DB: select * from products where rfid_tag = rfid
    // jika ketemu -> res.json({ id, name, price, sku }) else res.status(404).end()
  })

  // POST create QRIS
  app.post('/api/qris/create', async (req, res) => {
    const { amount, orderId, items } = req.body
    // panggil payment gateway untuk buat QRIS
    // simpan qrisId dan return qrisUrl
    res.json({ qrisUrl: 'https://example.com/qrcode.png', qrisId: 'qris-123' })
  })

  // POST checkout
  app.post('/api/checkout', async (req, res) => {
    const { items, payment } = req.body
    // simpan transaksi ke DB, tandai belum dibayar jika payment.method === 'qris'
    res.status(200).end()
  })

  // WebSocket server untuk menerima event dari RFID middleware
  // Ketika middleware membaca tag, ia mengirim pesan ke semua client WS
*/
