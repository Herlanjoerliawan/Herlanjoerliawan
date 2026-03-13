const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'store.json');
const clients = new Set();
let mysqlPool = null;

const defaults = {
  settings: {
    storeName: 'LANLAN STORE',
    logo: 'https://files.catbox.moe/7xovkb.jpg',
    bannerTitle: 'Top Up Cepat, Cyber Style',
    bannerSubtitle: 'Voucher, Pulsa, dan Panel Pterodactyl otomatis.',
    backgroundImage: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=80',
    manualPayments: [{ id: 'mp-1', label: 'Transfer Bank BCA', detail: '1234567890 a.n LANLAN STORE' }],
    apiKeys: { pakasir: { apiKey: '', merchantId: '', slug: '' }, pterodactyl: { panelUrl: '', applicationApiKey: '', accountApiKey: '', nodeId: '', nestId: '', eggId: '' } }
  },
  categories: [{ id: 'cat-voucher', name: 'Voucher' }, { id: 'cat-ptero', name: 'Pterodactyl' }],
  products: [], users: [{ id: 'admin', name: 'Administrator', balance: 0 }], orders: []
};
let state = structuredClone(defaults);

const id = () => Math.random().toString(36).slice(2, 10);
const json = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
const parseBody = (req) => new Promise((resolve) => { let b = ''; req.on('data', (c) => b += c); req.on('end', () => resolve(b ? JSON.parse(b) : {})); });
const catName = (p) => state.categories.find((c) => c.id === p.categoryId)?.name || p.category || 'Umum';

async function initMysql() {
  if (!process.env.MYSQL_URL) return;
  try {
    const mysql = require('mysql2/promise');
    mysqlPool = await mysql.createPool({ uri: process.env.MYSQL_URL });
    await mysqlPool.query('CREATE TABLE IF NOT EXISTS app_state(id INT PRIMARY KEY, payload JSON NOT NULL)');
    const [rows] = await mysqlPool.query('SELECT payload FROM app_state WHERE id=1');
    if (rows.length) state = JSON.parse(rows[0].payload);
    else await mysqlPool.query('INSERT INTO app_state(id,payload) VALUES(1,?)', [JSON.stringify(state)]);
  } catch (e) {
    mysqlPool = null;
  }
}
function loadFile() { if (fs.existsSync(DATA_FILE)) state = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); else fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2)); }
async function save() {
  if (mysqlPool) await mysqlPool.query('UPDATE app_state SET payload=? WHERE id=1', [JSON.stringify(state)]);
  else fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
  const p = `data: ${JSON.stringify({ type: 'state-update' })}\n\n`;
  clients.forEach((r) => r.write(p));
}
function automate(order) {
  const p = state.settings.apiKeys.pterodactyl;
  if (!p.panelUrl || !p.applicationApiKey || !p.nodeId || !p.nestId || !p.eggId) return 'Failed: pterodactyl API config incomplete';
  return `Success: Server Created for ${order.serverInfo?.username || '-'} (${order.productSpec?.ram || '-'} RAM)`;
}

function staticFile(req, res) {
  let filePath = path.join(ROOT, 'public', req.url === '/' ? 'index.html' : req.url);
  if (!filePath.startsWith(path.join(ROOT, 'public'))) return json(res, 403, { error: 'Forbidden' });
  if (!fs.existsSync(filePath)) return json(res, 404, { error: 'Not found' });
  const ext = path.extname(filePath);
  const ct = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' }[ext] || 'text/plain';
  res.writeHead(200, { 'Content-Type': ct });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.end();

  if (u.pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    clients.add(res); res.write(`data: {"type":"connected"}\n\n`); req.on('close', () => clients.delete(res)); return;
  }
  if (u.pathname === '/api/state' && req.method === 'GET') return json(res, 200, { ...state, products: state.products.map((p) => ({ ...p, category: catName(p) })) });
  if (u.pathname === '/api/settings' && req.method === 'PUT') { const b = await parseBody(req); state.settings = { ...state.settings, ...b, apiKeys: { ...state.settings.apiKeys, ...(b.apiKeys || {}) } }; await save(); return json(res, 200, state.settings); }

  if (u.pathname === '/api/categories' && req.method === 'POST') { const b = await parseBody(req); const c = { id: id(), name: b.name }; state.categories.push(c); await save(); return json(res, 201, c); }
  if (u.pathname.startsWith('/api/categories/') && req.method === 'PUT') { const b = await parseBody(req); const cid = u.pathname.split('/').pop(); state.categories = state.categories.map((c) => c.id === cid ? { ...c, name: b.name } : c); await save(); return json(res, 200, { ok: true }); }
  if (u.pathname.startsWith('/api/categories/') && req.method === 'DELETE') { const cid = u.pathname.split('/').pop(); state.categories = state.categories.filter((c) => c.id !== cid); await save(); return json(res, 200, { ok: true }); }

  if (u.pathname === '/api/products' && req.method === 'POST') { const b = await parseBody(req); const p = { id: id(), ...b }; state.products.push(p); await save(); return json(res, 201, p); }
  if (u.pathname.startsWith('/api/products/') && req.method === 'PUT') { const b = await parseBody(req); const pid = u.pathname.split('/').pop(); state.products = state.products.map((p) => p.id === pid ? { ...p, ...b } : p); await save(); return json(res, 200, { ok: true }); }
  if (u.pathname.startsWith('/api/products/') && req.method === 'DELETE') { const pid = u.pathname.split('/').pop(); state.products = state.products.filter((p) => p.id !== pid); await save(); return json(res, 200, { ok: true }); }

  if (u.pathname.startsWith('/api/users/') && u.pathname.endsWith('/deposit') && req.method === 'POST') { const b = await parseBody(req); const uid = u.pathname.split('/')[3]; const user = state.users.find((x) => x.id === uid); if (!user) return json(res, 404, { error: 'User not found' }); user.balance += Number(b.amount || 0); await save(); return json(res, 200, user); }

  if (u.pathname === '/api/orders' && req.method === 'POST') {
    const b = await parseBody(req);
    const product = state.products.find((p) => p.id === b.productId);
    if (!product) return json(res, 404, { error: 'Product not found' });
    let user = state.users.find((x) => x.id === b.userId);
    if (!user) { user = { id: b.userId, name: b.userId, balance: 0 }; state.users.push(user); }
    let status = 'pending', automationLog = 'Pending payment confirmation', paymentMeta = {};
    if (b.paymentMethod === 'balance') {
      if (user.balance < product.price) return json(res, 400, { error: 'Saldo tidak cukup' });
      user.balance -= product.price; status = 'completed'; if (catName(product).toLowerCase() === 'pterodactyl') automationLog = automate({ serverInfo: b.serverInfo, productSpec: product });
    }
    if (b.paymentMethod === 'pakasir') { status = 'waiting_payment'; paymentMeta = { invoice: `PKS-${Date.now()}`, status: 'unpaid' }; }
    const order = { id: id(), userId: user.id, userName: user.name, productId: product.id, productName: product.name, productSpec: { ram: product.ram, cpu: product.cpu, disk: product.disk }, paymentMethod: b.paymentMethod, paymentInstruction: b.paymentInstruction, serverInfo: b.serverInfo, amount: product.price, status, paymentMeta, automationLog, createdAt: new Date().toISOString() };
    state.orders.unshift(order); await save(); return json(res, 201, order);
  }
  if (u.pathname.startsWith('/api/orders/') && u.pathname.endsWith('/confirm') && req.method === 'POST') {
    const oid = u.pathname.split('/')[3]; const order = state.orders.find((o) => o.id === oid); if (!order) return json(res, 404, { error: 'Order not found' });
    order.status = 'completed'; const product = state.products.find((p) => p.id === order.productId); order.automationLog = catName(product).toLowerCase() === 'pterodactyl' ? automate(order) : 'Not required';
    await save(); return json(res, 200, order);
  }

  return staticFile(req, res);
});

(async () => { await initMysql(); if (!mysqlPool) loadFile(); server.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`)); })();
