# LANLAN STORE

Website toko tema cyber responsif dengan dashboard admin lengkap:
- Setting isi website (nama toko, logo, banner, background)
- Manajemen kategori & produk (tambah/edit harga/hapus)
- Checkout dengan metode manual, saldo, dan simulasi Pakasir
- Integrasi API Pakasir + Pterodactyl (Panel URL, API key, nest/egg/node)
- Produk Pterodactyl + input server info saat checkout
- Konfirmasi pembayaran dan otomasi pembuatan server (simulasi)
- Kelola deposit/saldo user
- Sinkronisasi real-time via Server-Sent Events

## Jalankan

```bash
npm install
npm start
```

Buka:
- Frontend: `http://localhost:3000`
- Admin: `http://localhost:3000/admin.html`

## Storage

Default pakai `data/store.json`.
Jika `MYSQL_URL` tersedia, state disimpan ke MySQL table `app_state`.
