const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const Store = require('electron-store');
const { Pool } = require('pg');
const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ── Single instance lock ─────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) { app.quit(); }

const store = new Store();
const networkMode = store.get('networkMode', 'server');
const isServerMode = networkMode === 'server';
const isClientMode = networkMode === 'client';

// ── PostgreSQL Pool ───────────────────────────────────────────────────────────
let pool = null;

function createPool(overrides = {}) {
  const cfg = store.get('dbConfig', {});
  return new Pool({
    host: overrides.host || cfg.host || process.env.DB_HOST || 'localhost',
    port: overrides.port || cfg.port || parseInt(process.env.DB_PORT) || 5432,
    database: overrides.database || cfg.database || process.env.DB_NAME || 'atg_wholesale',
    user: overrides.user || cfg.user || process.env.DB_USER || 'atg_user',
    password: overrides.password || cfg.password || process.env.DB_PASSWORD || 'atg_pass123',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
}

// Helper: run a query (server mode only)
async function query(text, params) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

// ── SSE broadcaster ──────────────────────────────────────────────────────────
const sseClients = new Set();

function broadcast(type) {
  const data = JSON.stringify({ type });
  sseClients.forEach(res => {
    try { res.write(`data: ${data}\n\n`); } catch { }
  });
}

// ── Database Schema ──────────────────────────────────────────────────────────
async function initDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      item_code TEXT UNIQUE NOT NULL,
      description TEXT NOT NULL,
      category TEXT DEFAULT '',
      size_range TEXT DEFAULT '',
      purchase_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
      sale_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
      packing_qty INTEGER NOT NULL DEFAULT 6,
      photo_path TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      permissions TEXT DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      purchase_date DATE NOT NULL,
      invoice_no TEXT,
      supplier_name TEXT NOT NULL,
      total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      discount NUMERIC(10,2) DEFAULT 0,
      misc_charges NUMERIC(10,2) DEFAULT 0,
      notes TEXT,
      is_posted INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS purchase_items (
      id SERIAL PRIMARY KEY,
      purchase_id INTEGER REFERENCES purchases(id) ON DELETE CASCADE,
      item_code TEXT,
      item_description TEXT NOT NULL,
      packets INTEGER NOT NULL DEFAULT 0,
      rate NUMERIC(10,2) NOT NULL DEFAULT 0,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS purchase_returns (
      id SERIAL PRIMARY KEY,
      return_date DATE NOT NULL,
      return_no TEXT,
      invoice_no TEXT,
      supplier_name TEXT NOT NULL,
      total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      notes TEXT,
      is_posted INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS purchase_return_items (
      id SERIAL PRIMARY KEY,
      return_id INTEGER REFERENCES purchase_returns(id) ON DELETE CASCADE,
      item_code TEXT,
      item_description TEXT NOT NULL,
      packets INTEGER NOT NULL DEFAULT 0,
      rate NUMERIC(10,2) NOT NULL DEFAULT 0,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      sale_date DATE NOT NULL,
      invoice_no TEXT,
      customer_name TEXT,
      customer_phone TEXT,
      total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      total_packets INTEGER DEFAULT 0,
      discount NUMERIC(10,2) DEFAULT 0,
      misc_charges NUMERIC(10,2) DEFAULT 0,
      payment_method TEXT DEFAULT 'Cash',
      notes TEXT,
      user_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER REFERENCES sales(id) ON DELETE CASCADE,
      item_code TEXT,
      item_description TEXT NOT NULL,
      packets INTEGER NOT NULL DEFAULT 0,
      sale_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
      purchase_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      profit NUMERIC(12,2) NOT NULL DEFAULT 0
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sales_returns (
      id SERIAL PRIMARY KEY,
      return_date DATE NOT NULL,
      return_no TEXT,
      invoice_no TEXT,
      customer_name TEXT,
      total_amount NUMERIC(12,2) DEFAULT 0,
      notes TEXT,
      is_posted INTEGER DEFAULT 0,
      user_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sales_return_items (
      id SERIAL PRIMARY KEY,
      return_id INTEGER REFERENCES sales_returns(id) ON DELETE CASCADE,
      item_code TEXT,
      item_description TEXT,
      packets INTEGER DEFAULT 0,
      price NUMERIC(10,2) DEFAULT 0,
      amount NUMERIC(12,2) DEFAULT 0
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id SERIAL PRIMARY KEY,
      item_code TEXT NOT NULL,
      adjustment_qty INTEGER NOT NULL,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS genders (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
      );
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
      );
      CREATE TABLE IF NOT EXISTS size_ranges (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
      );
      CREATE TABLE IF NOT EXISTS packings (
        id SERIAL PRIMARY KEY,
        value INTEGER UNIQUE NOT NULL
      );
      CREATE TABLE IF NOT EXISTS brands (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
      );

      ALTER TABLE products ADD COLUMN IF NOT EXISTS year INTEGER;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT '';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) DEFAULT 0;

      CREATE TABLE IF NOT EXISTS profit_rules (
      id SERIAL PRIMARY KEY,
      company_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      size_range TEXT NOT NULL DEFAULT '',
      profit_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      UNIQUE(company_name, category, size_range)
    );

    CREATE TABLE IF NOT EXISTS overall_profit (
      id INTEGER PRIMARY KEY DEFAULT 1,
      profit_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT false
    )
  `);

  // Indexes
  await query('CREATE INDEX IF NOT EXISTS idx_purchase_items_item_code ON purchase_items(item_code)');
  await query('CREATE INDEX IF NOT EXISTS idx_sale_items_item_code ON sale_items(item_code)');
  await query('CREATE INDEX IF NOT EXISTS idx_purchase_return_items_item_code ON purchase_return_items(item_code)');
  await query('CREATE INDEX IF NOT EXISTS idx_sales_return_items_item_code ON sales_return_items(item_code)');
  await query('CREATE INDEX IF NOT EXISTS idx_stock_adj_item_code ON stock_adjustments(item_code)');

  // Migrations — add columns that may not exist in older DBs
  await query('ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS packing_qty INTEGER NOT NULL DEFAULT 0');
  await query("ALTER TABLE products ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT ''");
  try {
    // Migration: if gender is empty and category has Boy/Girl, move it
    await query("UPDATE products SET gender = category, category = '' WHERE gender = '' AND category IN ('Boy', 'Girl')");
    
    // Migration: year should be TEXT, not INTEGER (e.g. '2024-25')
    await query("ALTER TABLE products ALTER COLUMN year TYPE TEXT USING year::text");
    await query("ALTER TABLE products ADD COLUMN IF NOT EXISTS note TEXT DEFAULT ''");
  } catch(e) { console.error('Migration error:', e); }
  await query('ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS packing_qty INTEGER NOT NULL DEFAULT 0');
  try {
    await query('ALTER TABLE profit_rules ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0');
  } catch (e) {
    console.error('Migration discount_pct error:', e);
  }

  // Auto-number existing returns without return_no
  const prBig = await query("SELECT COUNT(*) FROM purchase_returns WHERE return_no IS NULL");
  if (parseInt(prBig.rows[0].count) > 0) {
    const allPR = await query("SELECT id FROM purchase_returns ORDER BY id ASC");
    for (let i = 0; i < allPR.rows.length; i++) {
      await query("UPDATE purchase_returns SET return_no = $1 WHERE id = $2", [String(i + 1), allPR.rows[i].id]);
    }
  }
  const srBig = await query("SELECT COUNT(*) FROM sales_returns WHERE return_no IS NULL");
  if (parseInt(srBig.rows[0].count) > 0) {
    const allSR = await query("SELECT id FROM sales_returns ORDER BY id ASC");
    for (let i = 0; i < allSR.rows.length; i++) {
      await query("UPDATE sales_returns SET return_no = $1 WHERE id = $2", [String(i + 1), allSR.rows[i].id]);
    }
  }

  console.log('[DB] Schema initialized');
}

// ── Stock calculation helper ──────────────────────────────────────────────────
async function getStock(itemCode) {
  const r = await query(`
    SELECT
      COALESCE((SELECT SUM(packets) FROM purchase_items WHERE item_code=$1),0) -
      COALESCE((SELECT SUM(packets) FROM sale_items WHERE item_code=$1),0) +
      COALESCE((SELECT SUM(packets) FROM purchase_return_items WHERE item_code=$1),0) * -1 +
      COALESCE((SELECT SUM(packets) FROM sales_return_items WHERE item_code=$1),0) +
      COALESCE((SELECT SUM(adjustment_qty) FROM stock_adjustments WHERE item_code=$1),0)
      AS stock
  `, [itemCode]);
  return parseInt(r.rows[0].stock) || 0;
}

// ── Express API server ────────────────────────────────────────────────────────
let expressServer = null;

function startExpressServer() {
  const expressApp = express();
  expressApp.use(cors());
  expressApp.use(express.json({ limit: '10mb' }));

  const API_PORT = parseInt(process.env.API_PORT) || 3002;
  const NETWORK_TOKEN = store.get('networkToken') || process.env.NETWORK_TOKEN || '';

  function auth(req, res, next) {
    const token = req.headers['x-token'] || req.query.token;
    if (NETWORK_TOKEN && token !== NETWORK_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
    next();
  }

  // SSE endpoint
  expressApp.get('/api/events', auth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  });

  // Generic proxy endpoint — client posts { channel, args } and gets back the result
  expressApp.post('/api/ipc', auth, async (req, res) => {
    const { channel, args } = req.body;
    try {
      const result = await handleIPC(channel, ...(Array.isArray(args) ? args : [args]));
      res.json({ success: true, data: result });
    } catch (e) {
      res.json({ success: false, error: e.message });
    }
  });

  expressServer = expressApp.listen(API_PORT, '0.0.0.0', () => {
    console.log(`[API] Express server running on port ${API_PORT}`);
  });
}

// ── Central IPC handler (called both locally and via Express proxy) ───────────
async function handleIPC(channel, ...args) {
  const data = args[0];

  switch (channel) {
    // ─── AUTH ─────────────────────────────────────────────────────────────────
    case 'get-genders': { const r = await query('SELECT * FROM genders ORDER BY name'); return r.rows; }
      case 'add-gender': { await query('INSERT INTO genders (name) VALUES ($1) ON CONFLICT DO NOTHING', [data]); broadcast('genders'); return { success: true }; }
      case 'update-gender': { await query('UPDATE genders SET name=$1 WHERE id=$2', [data.name, data.id]); broadcast('genders'); return { success: true }; }
      case 'delete-gender': { await query('DELETE FROM genders WHERE id=$1', [data]); broadcast('genders'); return { success: true }; }

      case 'get-categories': { const r = await query('SELECT * FROM categories ORDER BY name'); return r.rows; }
      case 'add-category': { await query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [data]); broadcast('categories'); return { success: true }; }
      case 'update-category': { await query('UPDATE categories SET name=$1 WHERE id=$2', [data.name, data.id]); broadcast('categories'); return { success: true }; }
      case 'delete-category': { await query('DELETE FROM categories WHERE id=$1', [data]); broadcast('categories'); return { success: true }; }

      case 'get-size-ranges': { const r = await query('SELECT * FROM size_ranges ORDER BY name'); return r.rows; }
      case 'add-size-range': { await query('INSERT INTO size_ranges (name) VALUES ($1) ON CONFLICT DO NOTHING', [data]); broadcast('size_ranges'); return { success: true }; }
      case 'update-size-range': { await query('UPDATE size_ranges SET name=$1 WHERE id=$2', [data.name, data.id]); broadcast('size_ranges'); return { success: true }; }
      case 'delete-size-range': { await query('DELETE FROM size_ranges WHERE id=$1', [data]); broadcast('size_ranges'); return { success: true }; }

      case 'get-packings': { const r = await query('SELECT * FROM packings ORDER BY value'); return r.rows; }
      case 'add-packing': { await query('INSERT INTO packings (value) VALUES ($1) ON CONFLICT DO NOTHING', [data]); broadcast('packings'); return { success: true }; }
      case 'update-packing': { await query('UPDATE packings SET value=$1 WHERE id=$2', [data.value, data.id]); broadcast('packings'); return { success: true }; }
      case 'delete-packing': { await query('DELETE FROM packings WHERE id=$1', [data]); broadcast('packings'); return { success: true }; }

      case 'get-brands': { const r = await query('SELECT * FROM brands ORDER BY name'); return r.rows; }
      case 'add-brand': { await query('INSERT INTO brands (name) VALUES ($1) ON CONFLICT DO NOTHING', [data]); broadcast('brands'); return { success: true }; }
      case 'update-brand': { await query('UPDATE brands SET name=$1 WHERE id=$2', [data.name, data.id]); broadcast('brands'); return { success: true }; }
      case 'delete-brand': { await query('DELETE FROM brands WHERE id=$1', [data]); broadcast('brands'); return { success: true }; }

      case 'check-any-users': {
      const r = await query('SELECT COUNT(*) FROM users');
      return parseInt(r.rows[0].count) > 0;
    }
    case 'register': {
      const { username, password } = data;
      const hash = await bcrypt.hash(password, 10);
      const existing = await query('SELECT COUNT(*) FROM users');
      const isFirst = parseInt(existing.rows[0].count) === 0;
      const role = isFirst ? 'admin' : 'operator';
      const perms = '';
      await query('INSERT INTO users (username, password_hash, role, permissions) VALUES ($1,$2,$3,$4)', [username, hash, role, perms]);
      return { success: true };
    }
    case 'login': {
      const { username, password } = data;
      const r = await query('SELECT * FROM users WHERE username=$1', [username]);
      if (!r.rows.length) return { success: false, error: 'User not found' };
      const user = r.rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return { success: false, error: 'Invalid password' };
      let permissions = [];
      try {
        if (user.permissions) {
          permissions = user.permissions.startsWith('[') ? JSON.parse(user.permissions) : user.permissions.split(',').filter(Boolean);
        }
      } catch { }
      return { success: true, userId: user.id, username: user.username, role: user.role, permissions };
    }

    // ─── PRODUCTS ────────────────────────────────────────────────────────────
    case 'get-next-item-code': {
      const r = await query("SELECT item_code FROM products ORDER BY id DESC LIMIT 1");
      if (!r.rows.length) return '0001';
      const last = r.rows[0].item_code;
      const num = parseInt(last.replace(/\D/g, '')) || 0;
      return String(num + 1).padStart(4, '0');
    }
    case 'save-product': {
      const { itemCode, description, gender, category, sizeRange, purchaseRate, saleRate, packingQty, year, brand, discount, note } = data;
      const r = await query(
        'INSERT INTO products (item_code, description, gender, category, size_range, purchase_rate, sale_rate, packing_qty, year, brand, discount, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, item_code',
        [itemCode, description, gender || '', category || '', sizeRange || '', purchaseRate, saleRate, packingQty, year || null, brand || '', discount ? parseFloat(discount) : 0, note || '']
      );
      broadcast('products');
      return { success: true, id: r.rows[0].id, itemCode: r.rows[0].item_code };
    }
    case 'update-product': {
      const { id, itemCode, description, gender, category, sizeRange, purchaseRate, saleRate, packingQty, year, photoPath, brand, discount, note } = data;
      await query(
        'UPDATE products SET item_code=$1, description=$2, gender=$3, category=$4, size_range=$5, purchase_rate=$6, sale_rate=$7, packing_qty=$8, year=$9, photo_path=$10, brand=$11, discount=$12, note=$13, updated_at=NOW() WHERE id=$14',
        [itemCode, description, gender || '', category || '', sizeRange || '', purchaseRate, saleRate, packingQty, year || null, photoPath || null, brand || '', discount ? parseFloat(discount) : 0, note || '', id]
      );
      broadcast('products');
      return { success: true };
    }
    case 'get-products': {
      const r = await query('SELECT * FROM products ORDER BY id DESC');
      return r.rows;
    }
    case 'get-product-by-code': {
      const r = await query('SELECT * FROM products WHERE item_code ILIKE $1', [data]);
      return r.rows[0] || null;
    }
    case 'search-products': {
      const q = `%${data}%`;
      const r = await query('SELECT * FROM products WHERE item_code ILIKE $1 OR description ILIKE $1 ORDER BY id DESC LIMIT 50', [q]);
      return r.rows;
    }
    case 'delete-product': {
      await query('DELETE FROM products WHERE id=$1', [data]);
      broadcast('products');
      return { success: true };
    }
    case 'save-product-photo': {
      const { productId, photoData } = data;
      const photoDir = path.join(app.getPath('userData'), 'product_photos');
      if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });
      const photoPath = path.join(photoDir, `${productId}.jpg`);
      const base64 = photoData.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(photoPath, Buffer.from(base64, 'base64'));
      await query('UPDATE products SET photo_path=$1 WHERE id=$2', [photoPath, productId]);
      return { success: true, photoPath };
    }
    case 'get-product-photo': {
      const r = await query('SELECT photo_path FROM products WHERE id=$1', [data]);
      if (!r.rows.length || !r.rows[0].photo_path) return null;
      const p = r.rows[0].photo_path;
      if (!fs.existsSync(p)) return null;
      const buf = fs.readFileSync(p);
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    }

    // ─── COMPANIES ────────────────────────────────────────────────────────────
    case 'get-companies': {
      const r = await query('SELECT name FROM companies ORDER BY name ASC');
      return r.rows.map(r => r.name);
    }
    case 'save-company': {
      await query('INSERT INTO companies (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [data]);
      return { success: true };
    }
    case 'delete-company': {
      await query('DELETE FROM companies WHERE name=$1', [data]);
      return { success: true };
    }

    // ─── PROFIT RULES ────────────────────────────────────────────────────────
    case 'get-profit-rules': {
      const r = await query('SELECT * FROM profit_rules ORDER BY company_name, category, size_range');
      return r.rows;
    }
    case 'save-profit-rule': {
      const { company_name, category, size_range, profit_pct, discount_pct } = data;
      await query(
        `INSERT INTO profit_rules (company_name, category, size_range, profit_pct, discount_pct)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (company_name, category, size_range)
         DO UPDATE SET profit_pct = EXCLUDED.profit_pct, discount_pct = EXCLUDED.discount_pct`,
        [company_name, category || '', size_range || '', parseFloat(profit_pct) || 0, parseFloat(discount_pct) || 0]
      );
      return { success: true };
    }
    case 'delete-profit-rule': {
      await query('DELETE FROM profit_rules WHERE id=$1', [data]);
      return { success: true };
    }

    // ─── OVERALL PROFIT ──────────────────────────────────────────────────────
    case 'get-overall-profit': {
      const r = await query('SELECT * FROM overall_profit WHERE id=1');
      return r.rows[0] || { profit_pct: 0, discount_pct: 0, enabled: false };
    }
    case 'save-overall-profit': {
      const { profit_pct, discount_pct, enabled } = data;
      await query(
        `INSERT INTO overall_profit (id, profit_pct, discount_pct, enabled) VALUES (1, $1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET profit_pct = EXCLUDED.profit_pct, discount_pct = EXCLUDED.discount_pct, enabled = EXCLUDED.enabled`,
        [parseFloat(profit_pct) || 0, parseFloat(discount_pct) || 0, !!enabled]
      );
      return { success: true };
    }

    // ─── STOCK ────────────────────────────────────────────────────────────────
    case 'get-stock-list': {
      const prods = await query('SELECT * FROM products ORDER BY id DESC');
      const result = [];
      for (const p of prods.rows) {
        const stock = await getStock(p.item_code);
        result.push({ ...p, stock_packets: stock });
      }
      return result;
    }
    case 'get-stock-single': {
      return await getStock(data);
    }
    case 'adjust-stock': {
      const { itemCode, qty, notes } = data;
      await query('INSERT INTO stock_adjustments (item_code, adjustment_qty, notes) VALUES ($1,$2,$3)', [itemCode, qty, notes || '']);
      broadcast('stock');
      return { success: true };
    }

    // ─── PURCHASES ────────────────────────────────────────────────────────────
    case 'save-purchase': {
      const { purchaseDate, invoiceNo, supplierName, items, discount, miscCharges, notes } = data;
      const total = items.reduce((s, i) => s + i.amount, 0) - (discount || 0) + (miscCharges || 0);
      const pr = await query(
        'INSERT INTO purchases (purchase_date, invoice_no, supplier_name, total_amount, discount, misc_charges, notes, is_posted) VALUES ($1,$2,$3,$4,$5,$6,$7,1) RETURNING id',
        [purchaseDate, invoiceNo || null, supplierName, total, discount || 0, miscCharges || 0, notes || null]
      );
      const purchaseId = pr.rows[0].id;
      for (const item of items) {
        await query(
          'INSERT INTO purchase_items (purchase_id, item_code, item_description, packets, packing_qty, rate, amount) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [purchaseId, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.rate, item.amount]
        );
      }
      broadcast('purchases'); broadcast('stock');
      return { success: true, id: purchaseId };
    }
    case 'update-purchase': {
      const { id, purchaseDate, invoiceNo, supplierName, items, discount, miscCharges, notes } = data;
      const total = items.reduce((s, i) => s + i.amount, 0) - (discount || 0) + (miscCharges || 0);
      await query(
        'UPDATE purchases SET purchase_date=$1, invoice_no=$2, supplier_name=$3, total_amount=$4, discount=$5, misc_charges=$6, notes=$7 WHERE id=$8',
        [purchaseDate, invoiceNo || null, supplierName, total, discount || 0, miscCharges || 0, notes || null, id]
      );
      await query('DELETE FROM purchase_items WHERE purchase_id=$1', [id]);
      for (const item of items) {
        await query(
          'INSERT INTO purchase_items (purchase_id, item_code, item_description, packets, packing_qty, rate, amount) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [id, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.rate, item.amount]
        );
      }
      broadcast('purchases'); broadcast('stock');
      return { success: true };
    }
    case 'get-purchases': {
      const r = await query('SELECT * FROM purchases ORDER BY id DESC');
      return r.rows;
    }
    case 'get-purchase-items': {
      const r = await query('SELECT * FROM purchase_items WHERE purchase_id=$1 ORDER BY id', [data]);
      return r.rows;
    }
    case 'delete-purchase': {
      await query('DELETE FROM purchases WHERE id=$1', [data]);
      broadcast('purchases'); broadcast('stock');
      return { success: true };
    }

    // ─── PURCHASE RETURNS ─────────────────────────────────────────────────────
    case 'save-purchase-return': {
      const { returnDate, invoiceNo, supplierName, items, notes } = data;
      const total = items.reduce((s, i) => s + i.amount, 0);
      const maxNo = await query('SELECT MAX(CAST(return_no AS INTEGER)) FROM purchase_returns WHERE return_no ~ $1', ['^[0-9]+$']);
      const nextNo = String((parseInt(maxNo.rows[0].max) || 0) + 1);
      const rr = await query(
        'INSERT INTO purchase_returns (return_date, return_no, invoice_no, supplier_name, total_amount, notes, is_posted) VALUES ($1,$2,$3,$4,$5,$6,1) RETURNING id',
        [returnDate, nextNo, invoiceNo || null, supplierName, total, notes || null]
      );
      const returnId = rr.rows[0].id;
      for (const item of items) {
        await query(
          'INSERT INTO purchase_return_items (return_id, item_code, item_description, packets, rate, amount) VALUES ($1,$2,$3,$4,$5,$6)',
          [returnId, item.itemCode, item.itemDescription, item.packets, item.rate, item.amount]
        );
      }
      broadcast('purchase-returns'); broadcast('stock');
      return { success: true, id: returnId, returnNo: nextNo };
    }
    case 'update-purchase-return': {
      const { id, returnDate, invoiceNo, supplierName, items, notes } = data;
      const total = items.reduce((s, i) => s + i.amount, 0);
      await query('UPDATE purchase_returns SET return_date=$1, invoice_no=$2, supplier_name=$3, total_amount=$4, notes=$5 WHERE id=$6',
        [returnDate, invoiceNo || null, supplierName, total, notes || null, id]);
      await query('DELETE FROM purchase_return_items WHERE return_id=$1', [id]);
      for (const item of items) {
        await query('INSERT INTO purchase_return_items (return_id, item_code, item_description, packets, rate, amount) VALUES ($1,$2,$3,$4,$5,$6)',
          [id, item.itemCode, item.itemDescription, item.packets, item.rate, item.amount]);
      }
      broadcast('purchase-returns'); broadcast('stock');
      return { success: true };
    }
    case 'get-purchase-returns': {
      const r = await query('SELECT * FROM purchase_returns ORDER BY id DESC');
      return r.rows;
    }
    case 'get-purchase-return-items': {
      const r = await query('SELECT * FROM purchase_return_items WHERE return_id=$1 ORDER BY id', [data]);
      return r.rows;
    }
    case 'delete-purchase-return': {
      await query('DELETE FROM purchase_returns WHERE id=$1', [data]);
      broadcast('purchase-returns'); broadcast('stock');
      return { success: true };
    }

    // ─── SALES ────────────────────────────────────────────────────────────────
    case 'save-sale': {
      const { saleDate, invoiceNo, customerName, customerPhone, items, discount, miscCharges, paymentMethod, notes, userId } = data;
      const subTotal = items.reduce((s, i) => s + i.amount, 0);
      const total = subTotal - (discount || 0) + (miscCharges || 0);
      const totalPackets = items.reduce((s, i) => s + i.packets, 0);
      const sr = await query(
        'INSERT INTO sales (sale_date, invoice_no, customer_name, customer_phone, total_amount, total_packets, discount, misc_charges, payment_method, notes, user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
        [saleDate, invoiceNo || null, customerName || null, customerPhone || null, total, totalPackets, discount || 0, miscCharges || 0, paymentMethod || 'Cash', notes || null, userId || null]
      );
      const saleId = sr.rows[0].id;
      for (const item of items) {
        const profit = (item.saleRate - item.purchaseRate) * item.packets;
        await query(
          'INSERT INTO sale_items (sale_id, item_code, item_description, packets, packing_qty, sale_rate, purchase_rate, amount, profit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [saleId, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.saleRate, item.purchaseRate, item.amount, profit]
        );
      }
      broadcast('sales'); broadcast('stock');
      return { success: true, id: saleId };
    }
    case 'update-sale': {
      const { id, saleDate, invoiceNo, customerName, customerPhone, items, discount, miscCharges, paymentMethod, notes } = data;
      const subTotal = items.reduce((s, i) => s + i.amount, 0);
      const total = subTotal - (discount || 0) + (miscCharges || 0);
      const totalPackets = items.reduce((s, i) => s + i.packets, 0);
      await query('UPDATE sales SET sale_date=$1, invoice_no=$2, customer_name=$3, customer_phone=$4, total_amount=$5, total_packets=$6, discount=$7, misc_charges=$8, payment_method=$9, notes=$10, updated_at=NOW() WHERE id=$11',
        [saleDate, invoiceNo || null, customerName || null, customerPhone || null, total, totalPackets, discount || 0, miscCharges || 0, paymentMethod || 'Cash', notes || null, id]);
      await query('DELETE FROM sale_items WHERE sale_id=$1', [id]);
      for (const item of items) {
        const profit = (item.saleRate - item.purchaseRate) * item.packets;
        await query('INSERT INTO sale_items (sale_id, item_code, item_description, packets, packing_qty, sale_rate, purchase_rate, amount, profit) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [id, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.saleRate, item.purchaseRate, item.amount, profit]);
      }
      broadcast('sales'); broadcast('stock');
      return { success: true };
    }
    case 'get-sales': {
      const { startDate, endDate, searchTerm } = data || {};
      let q = 'SELECT * FROM sales WHERE 1=1';
      const params = [];
      if (startDate) { params.push(startDate); q += ` AND sale_date >= $${params.length}`; }
      if (endDate) { params.push(endDate); q += ` AND sale_date <= $${params.length}`; }
      if (searchTerm) { params.push(`%${searchTerm}%`); q += ` AND (customer_name ILIKE $${params.length} OR invoice_no ILIKE $${params.length})`; }
      q += ' ORDER BY id DESC';
      const r = await query(q, params);
      return r.rows;
    }
    case 'get-sale-items': {
      const r = await query('SELECT * FROM sale_items WHERE sale_id=$1 ORDER BY id', [data]);
      return r.rows;
    }
    case 'delete-sale': {
      await query('DELETE FROM sales WHERE id=$1', [data]);
      broadcast('sales'); broadcast('stock');
      return { success: true };
    }
    case 'get-next-invoice-no': {
      const r = await query("SELECT MAX(CAST(invoice_no AS INTEGER)) FROM sales WHERE invoice_no ~ '^[0-9]+$'");
      return String((parseInt(r.rows[0].max) || 0) + 1);
    }

    // ─── SALES RETURNS ────────────────────────────────────────────────────────
    case 'save-sales-return': {
      const { returnDate, invoiceNo, customerName, items, notes, userId } = data;
      const total = items.reduce((s, i) => s + i.amount, 0);
      const maxNo = await query("SELECT MAX(CAST(return_no AS INTEGER)) FROM sales_returns WHERE return_no ~ '^[0-9]+$'");
      const nextNo = String((parseInt(maxNo.rows[0].max) || 0) + 1);
      const rr = await query(
        'INSERT INTO sales_returns (return_date, return_no, invoice_no, customer_name, total_amount, notes, is_posted, user_id) VALUES ($1,$2,$3,$4,$5,$6,1,$7) RETURNING id',
        [returnDate, nextNo, invoiceNo || null, customerName || null, total, notes || null, userId || null]
      );
      const returnId = rr.rows[0].id;
      for (const item of items) {
        await query('INSERT INTO sales_return_items (return_id, item_code, item_description, packets, price, amount) VALUES ($1,$2,$3,$4,$5,$6)',
          [returnId, item.itemCode, item.itemDescription, item.packets, item.price, item.amount]);
      }
      broadcast('sales-returns'); broadcast('stock');
      return { success: true, id: returnId, returnNo: nextNo };
    }
    case 'update-sales-return': {
      const { id, returnDate, invoiceNo, customerName, items, notes } = data;
      const total = items.reduce((s, i) => s + i.amount, 0);
      await query('UPDATE sales_returns SET return_date=$1, invoice_no=$2, customer_name=$3, total_amount=$4, notes=$5 WHERE id=$6',
        [returnDate, invoiceNo || null, customerName || null, total, notes || null, id]);
      await query('DELETE FROM sales_return_items WHERE return_id=$1', [id]);
      for (const item of items) {
        await query('INSERT INTO sales_return_items (return_id, item_code, item_description, packets, price, amount) VALUES ($1,$2,$3,$4,$5,$6)',
          [id, item.itemCode, item.itemDescription, item.packets, item.price, item.amount]);
      }
      broadcast('sales-returns'); broadcast('stock');
      return { success: true };
    }
    case 'get-sales-returns': {
      const r = await query('SELECT * FROM sales_returns ORDER BY id DESC');
      return r.rows;
    }
    case 'get-sales-return-items': {
      const r = await query('SELECT * FROM sales_return_items WHERE return_id=$1 ORDER BY id', [data]);
      return r.rows;
    }
    case 'delete-sales-return': {
      await query('DELETE FROM sales_returns WHERE id=$1', [data]);
      broadcast('sales-returns'); broadcast('stock');
      return { success: true };
    }

    // ─── REPORTS ──────────────────────────────────────────────────────────────
    case 'get-report-summary': {
      const { startDate, endDate } = data || {};
      const params = [startDate || '2000-01-01', endDate || '2099-12-31'];
      const sales = await query('SELECT COALESCE(SUM(total_amount),0) total, COALESCE(SUM(total_packets),0) packets FROM sales WHERE sale_date BETWEEN $1 AND $2', params);
      const purch = await query('SELECT COALESCE(SUM(total_amount),0) total FROM purchases WHERE purchase_date BETWEEN $1 AND $2', params);
      const profit = await query('SELECT COALESCE(SUM(si.profit),0) profit FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.sale_date BETWEEN $1 AND $2', params);
      const srTotal = await query('SELECT COALESCE(SUM(total_amount),0) total FROM sales_returns WHERE return_date BETWEEN $1 AND $2', params);
      return {
        totalSales: parseFloat(sales.rows[0].total),
        totalPackets: parseInt(sales.rows[0].packets),
        totalPurchases: parseFloat(purch.rows[0].total),
        totalProfit: parseFloat(profit.rows[0].profit),
        totalReturns: parseFloat(srTotal.rows[0].total),
      };
    }
    case 'get-report-top-items': {
      const { startDate, endDate } = data || {};
      const r = await query(`
        SELECT si.item_code, si.item_description, SUM(si.packets) packets, SUM(si.amount) amount, SUM(si.profit) profit
        FROM sale_items si JOIN sales s ON s.id=si.sale_id
        WHERE s.sale_date BETWEEN $1 AND $2
        GROUP BY si.item_code, si.item_description
        ORDER BY packets DESC LIMIT 20
      `, [startDate || '2000-01-01', endDate || '2099-12-31']);
      return r.rows;
    }

    // ─── USERS ────────────────────────────────────────────────────────────────
    case 'get-users': {
      const r = await query('SELECT id, username, role, permissions, created_at FROM users ORDER BY id');
      return r.rows;
    }
    case 'add-user': {
      const { username, password, role, permissions } = data;
      const hash = await bcrypt.hash(password, 10);
      await query('INSERT INTO users (username, password_hash, role, permissions) VALUES ($1,$2,$3,$4)', [username, hash, role || 'user', JSON.stringify(permissions || [])]);
      return { success: true };
    }
    case 'create-user': {
      const { username, password, role, permissions } = data;
      const hash = await bcrypt.hash(password, 10);
      const permsStr = Array.isArray(permissions) ? permissions.join(',') : (permissions || '');
      try {
        await query('INSERT INTO users (username, password_hash, role, permissions) VALUES ($1,$2,$3,$4)', [username, hash, role || 'operator', permsStr]);
        return { success: true };
      } catch (e) {
        if (e.code === '23505') return { success: false, error: 'Username already exists' };
        throw e;
      }
    }
    case 'update-user': {
      const { id, username, role, permissions, password } = data;
      const permsStr = Array.isArray(permissions) ? permissions.join(',') : (permissions || '');
      if (password) {
        const hash = await bcrypt.hash(password, 10);
        await query('UPDATE users SET username=$1, role=$2, permissions=$3, password_hash=$4 WHERE id=$5', [username, role, permsStr, hash, id]);
      } else {
        await query('UPDATE users SET username=$1, role=$2, permissions=$3 WHERE id=$4', [username, role, permsStr, id]);
      }
      return { success: true };
    }
    case 'delete-user': {
      await query('DELETE FROM users WHERE id=$1', [data]);
      return { success: true };
    }

    // ─── NETWORK ──────────────────────────────────────────────────────────────
    case 'get-network-settings': {
      return {
        networkMode: store.get('networkMode', 'server'),
        serverAddress: store.get('serverAddress', ''),
        networkToken: store.get('networkToken', ''),
        dbConfig: store.get('dbConfig', {}),
      };
    }
    case 'save-network-settings': {
      const { networkMode: nm, serverAddress, networkToken, dbConfig } = data;
      store.set('networkMode', nm);
      if (serverAddress) store.set('serverAddress', serverAddress);
      if (networkToken) store.set('networkToken', networkToken);
      if (dbConfig) store.set('dbConfig', dbConfig);
      return { success: true };
    }

    // ─── UTILS ────────────────────────────────────────────────────────────────
    case 'confirm-dialog': {
      const result = await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
        type: 'warning',
        buttons: ['Cancel', 'Yes'],
        defaultId: 1,
        cancelId: 0,
        title: 'Confirm',
        message: data || 'Are you sure?'
      });
      return result.response === 1;
    }
    case 'alert-dialog': {
      await dialog.showMessageBox(BrowserWindow.getFocusedWindow(), {
        type: 'info',
        buttons: ['OK'],
        title: 'Alert',
        message: data || 'Alert'
      });
      return { success: true };
    }

    // ─── NETWORK CONFIG (aliases used by NetworkSettings component) ───────────
    case 'get-network-config': {
      return {
        networkMode: store.get('networkMode', 'server'),
        serverAddress: store.get('serverAddress', ''),
        networkToken: store.get('networkToken', ''),
        dbConfig: store.get('dbConfig', {}),
      };
    }
    case 'save-network-config': {
      const { networkMode: nm, serverAddress, networkToken, dbConfig } = data;
      store.set('networkMode', nm || 'server');
      store.set('serverAddress', serverAddress || '');
      store.set('networkToken', networkToken || '');
      if (dbConfig) store.set('dbConfig', dbConfig);
      return { success: true };
    }
    case 'get-local-ips': {
      const os = require('os');
      const ips = [];
      for (const ifaces of Object.values(os.networkInterfaces())) {
        for (const iface of ifaces) {
          if (iface.family === 'IPv4' && !iface.internal) {
            ips.push(`${iface.address}:${parseInt(process.env.API_PORT) || 3002}`);
          }
        }
      }
      return ips;
    }
    case 'test-db-connection': {
      const testPool = new Pool({ host: data.host, port: data.port, database: data.database, user: data.user, password: data.password, connectionTimeoutMillis: 5000 });
      try { await testPool.query('SELECT 1'); await testPool.end(); return { success: true }; }
      catch (e) { await testPool.end().catch(() => { }); return { success: false, error: e.message }; }
    }
    case 'test-client-connection': {
      const { serverAddress: sa, networkToken: tok } = data || {};
      const nodeFetch = require('node-fetch');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await nodeFetch(`http://${sa}/api/events`, { headers: { 'x-token': tok || '' }, signal: controller.signal });
        clearTimeout(timer);
        return res.ok ? { success: true } : { success: false, error: `HTTP ${res.status}` };
      } catch (e) { clearTimeout(timer); return { success: false, error: e.message }; }
    }

    // ─── NEXT RETURN NUMBER ───────────────────────────────────────────────────
    case 'get-next-return-no': {
      const maxNo = await query("SELECT MAX(CAST(return_no AS INTEGER)) FROM sales_returns WHERE return_no ~ '^[0-9]+$'");
      return String((parseInt(maxNo.rows[0].max) || 0) + 1);
    }

    // ─── BACKUP ───────────────────────────────────────────────────────────────
    case 'create-backup': {
      const tables = ['products', 'companies', 'purchases', 'purchase_items', 'purchase_returns', 'purchase_return_items', 'sales', 'sale_items', 'sales_returns', 'sales_return_items', 'stock_adjustments'];
      const exportData = {};
      for (const t of tables) { const r = await query(`SELECT * FROM ${t} ORDER BY id`); exportData[t] = r.rows; }
      const backupDir = path.join(app.getPath('userData'), 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
      const filename = `backup_${ts}.json`;
      const filepath = path.join(backupDir, filename);
      fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));
      return { success: true, path: filepath };
    }
    case 'restore-backup': {
      const dlResult = await dialog.showOpenDialog(mainWindow, { filters: [{ name: 'JSON Backup', extensions: ['json'] }], properties: ['openFile'] });
      if (dlResult.canceled) return { success: false, error: 'Cancelled' };
      const raw = fs.readFileSync(dlResult.filePaths[0], 'utf-8');
      const exportData = JSON.parse(raw);
      const dropOrder = ['stock_adjustments', 'sales_return_items', 'sales_returns', 'sale_items', 'sales', 'purchase_return_items', 'purchase_returns', 'purchase_items', 'purchases', 'companies', 'products'];
      await query('BEGIN');
      try {
        for (const t of dropOrder) await query(`DELETE FROM ${t}`);
        for (const [table, rows] of Object.entries(exportData)) {
          for (const row of rows) {
            const cols = Object.keys(row).filter(k => k !== 'id');
            if (!cols.length) continue;
            const vals = cols.map(c => row[c]);
            const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
            await query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`, vals);
          }
        }
        await query('COMMIT');
        return { success: true };
      } catch (e) { await query('ROLLBACK'); return { success: false, error: e.message }; }
    }
    case 'get-backup-history': {
      const backupDir = path.join(app.getPath('userData'), 'backups');
      if (!fs.existsSync(backupDir)) return [];
      const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 10);
      return files.map(f => {
        const stats = fs.statSync(path.join(backupDir, f));
        return { filename: f, size: `${(stats.size / 1024).toFixed(1)} KB`, date: stats.mtime.toLocaleDateString() };
      });
    }

    default:
      throw new Error(`Unknown channel: ${channel}`);
  }
}

// ── Client mode forwarding ────────────────────────────────────────────────────
async function forwardToServer(channel, data) {
  const serverAddress = store.get('serverAddress', '');
  const token = store.get('networkToken', '');
  const nodeFetch = require('node-fetch');
  const res = await nodeFetch(`${serverAddress}/api/ipc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-token': token },
    body: JSON.stringify({ channel, args: [data] }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

// ── IPC registration ──────────────────────────────────────────────────────────
const LOCAL_CHANNELS = new Set([
  'get-network-settings', 'save-network-settings', 'get-network-config', 'save-network-config',
  'get-local-ips', 'test-db-connection', 'test-client-connection',
  'create-backup', 'restore-backup', 'get-backup-history',
  'relaunch-app', 'select-backup-dir', 'get-printers', 'print-receipt', 'print-pdf',
]);

function registerIPC() {
  const channels = [
    'check-any-users', 'register', 'login',
    'get-genders', 'add-gender', 'update-gender', 'delete-gender',
    'get-categories', 'add-category', 'update-category', 'delete-category',
    'get-size-ranges', 'add-size-range', 'update-size-range', 'delete-size-range',
    'get-packings', 'add-packing', 'update-packing', 'delete-packing',
    'get-brands', 'add-brand', 'update-brand', 'delete-brand',
    'get-next-item-code', 'save-product', 'update-product', 'get-products', 'get-product-by-code', 'search-products', 'delete-product', 'save-product-photo', 'get-product-photo',
    'get-companies', 'save-company', 'delete-company',
    'get-profit-rules', 'save-profit-rule', 'delete-profit-rule',
    'get-overall-profit', 'save-overall-profit', 'confirm-dialog', 'alert-dialog',
    'get-stock-list', 'get-stock-single', 'adjust-stock',
    'save-purchase', 'update-purchase', 'get-purchases', 'get-purchase-items', 'delete-purchase',
    'save-purchase-return', 'update-purchase-return', 'get-purchase-returns', 'get-purchase-return-items', 'delete-purchase-return',
    'save-sale', 'update-sale', 'get-sales', 'get-sale-items', 'delete-sale', 'get-next-invoice-no',
    'save-sales-return', 'update-sales-return', 'get-sales-returns', 'get-sales-return-items', 'delete-sales-return', 'get-next-return-no',
    'get-report-summary', 'get-report-top-items',
    'get-users', 'add-user', 'create-user', 'update-user', 'delete-user',
    'get-network-settings', 'save-network-settings', 'get-network-config', 'save-network-config',
    'get-local-ips', 'test-db-connection', 'test-client-connection',
    'create-backup', 'restore-backup', 'get-backup-history',
  ];

  channels.forEach(channel => {
    ipcMain.handle(channel, async (event, data) => {
      if (isClientMode && !LOCAL_CHANNELS.has(channel)) {
        return forwardToServer(channel, data);
      }
      return handleIPC(channel, data);
    });
  });

  // Print receipt (local only)
  ipcMain.handle('print-receipt', async (event, receiptData) => {
    return { success: true }; // placeholder — implement if thermal printer needed
  });

  // Relaunch
  ipcMain.handle('relaunch-app', () => { app.relaunch(); app.quit(); });

  // Select backup directory
  ipcMain.handle('select-backup-dir', async (event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });
}

// ── Electron app lifecycle ────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1100,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: 'Al-Touheed Wholesale',
  });

  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  Menu.setApplicationMenu(null);
}

app.whenReady().then(async () => {
  registerIPC();

  if (isServerMode) {
    try {
      pool = createPool();
      await pool.query('SELECT 1'); // test connection
      await initDatabase();
      startExpressServer();
    } catch (err) {
      console.error('[DB] Failed to connect to PostgreSQL:', err.message);
      dialog.showErrorBox('Database Error',
        `Cannot connect to PostgreSQL.\n\nError: ${err.message}\n\nPlease ensure PostgreSQL is running and the .env file has correct credentials.\n\nYou can run as Client mode to connect to another PC's database.`
      );
    }
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (expressServer) expressServer.close();
    if (pool) pool.end();
    app.quit();
  }
});
