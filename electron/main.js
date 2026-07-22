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

// ── ADVANCED BACKUP LOGIC ──────────────────────────────────────────────────
let isRestoring = false;

function getSystemId() {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        return iface.mac;
      }
    }
  }
  return 'unknown-system-id';
}

function getLocalDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function findBackupDrive() {
  const systemId = getSystemId();
  const currentPath = store.get('backupDrivePath');

  if (currentPath) {
    try {
      const atgDir = path.join(currentPath, 'SHOP_Backup');
      const idFile = path.join(atgDir, '.shop_system_id');
      if (fs.existsSync(idFile)) {
        const usbId = fs.readFileSync(idFile, 'utf8').trim();
        if (usbId === systemId) return currentPath;
      } else if (fs.existsSync(atgDir)) {
        fs.writeFileSync(idFile, systemId);
        return currentPath;
      }
    } catch (e) { }
  }
  return null;
}

function saveDailySnapshotJSON(exportData, backupRoot) {
  const today = getLocalDateStr();
  const dailyDir = path.join(backupRoot, 'daily');
  fs.mkdirSync(dailyDir, { recursive: true });

  const dailyFile = path.join(dailyDir, `shop_${today}.json`);
  fs.writeFileSync(dailyFile, JSON.stringify(exportData, null, 2));

  // Keep last 30
  const files = fs.readdirSync(dailyDir)
    .filter(f => f.startsWith('shop_') && f.endsWith('.json'))
    .sort();
  if (files.length > 30) {
    const toDelete = files.slice(0, files.length - 30);
    toDelete.forEach(f => {
      try { fs.unlinkSync(path.join(dailyDir, f)); } catch (e) { }
    });
  }
}

const BACKUP_TABLES = [
  'users', 'genders', 'categories', 'size_ranges', 'packings', 'brands', 'manufacturers', 'companies', 'profit_rules', 'overall_profit', 'manufacturer_brands',
  'products', 'stock_adjustments', 'purchases', 'purchase_items', 'purchase_returns', 'purchase_return_items',
  'sales', 'sale_items', 'sales_returns', 'sales_return_items'
];

async function executeAutoBackup() {
  if (isRestoring) return;
  try {
    const backupRoot = findBackupDrive();
    if (!backupRoot) {
      store.set('lastBackupStatus', 'Drive not found (unplugged or missing)');
      return;
    }
    const atgDir = path.join(backupRoot, 'SHOP_Backup');
    fs.mkdirSync(atgDir, { recursive: true });

    const exportData = {};
    for (const t of BACKUP_TABLES) {
      const res = await query(`SELECT * FROM ${t} ORDER BY id`);
      exportData[t] = res.rows;
    }

    const liveFile = path.join(atgDir, 'shop.json');
    fs.writeFileSync(liveFile, JSON.stringify(exportData, null, 2));

    saveDailySnapshotJSON(exportData, atgDir);

    store.set('lastBackupTime', new Date().toISOString());
    store.set('lastBackupStatus', 'OK');
  } catch (err) {
    console.error('AutoBackup failed:', err);
    store.set('lastBackupStatus', 'Error: ' + err.message);
  }
}

async function runRestore(fileToRestore, skipBackup = false) {
  if (isRestoring) return { success: false, error: 'A restore is already in progress.' };
  if (!fs.existsSync(fileToRestore)) return { success: false, error: 'Backup file not found: ' + fileToRestore };

  try {
    isRestoring = true;
    const raw = fs.readFileSync(fileToRestore, 'utf-8');
    let parsed = JSON.parse(raw);
    let fileData = parsed.data ? parsed : { data: parsed };

    await query('BEGIN');
    await query(`TRUNCATE ${BACKUP_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    for (const table of BACKUP_TABLES) {
      const rows = fileData.data[table] || fileData[table];
      if (!rows || rows.length === 0) continue;
      const columns = Object.keys(rows[0]);
      const colNames = columns.map(c => `"${c}"`).join(', ');
      for (const row of rows) {
        const values = columns.map(c => row[c]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        await query(`INSERT INTO "${table}" (${colNames}) VALUES (${placeholders})`, values);
      }
      try {
        await query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1) + 1, false) FROM "${table}"`);
      } catch(e) {}
    }
    await query('COMMIT');
    
    broadcast('stock'); broadcast('purchases'); broadcast('sales'); broadcast('purchase-returns'); broadcast('sales-returns');
    isRestoring = false;

    if (!skipBackup) {
      executeAutoBackup().catch(err => console.error('[AutoBackup After Restore] Error:', err));
    }

    return { success: true, message: 'Database restored successfully!' };
  } catch (err) {
    isRestoring = false;
    await query('ROLLBACK');
    return { success: false, error: 'Restore failed: ' + err.message };
  }
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
      session_id INTEGER DEFAULT 0,
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

  try {
    await query('ALTER TABLE products ADD COLUMN session_id INTEGER DEFAULT 0');
  } catch (err) { /* Column might already exist */ }

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
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_inv_no TEXT;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_date DATE;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS vehicle_no TEXT;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS godown TEXT;
    ALTER TABLE purchases ADD COLUMN IF NOT EXISTS blt_number TEXT;
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

      CREATE TABLE IF NOT EXISTS manufacturers (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL
      );

      ALTER TABLE products ADD COLUMN IF NOT EXISTS year INTEGER;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT '';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) DEFAULT 0;

      CREATE TABLE IF NOT EXISTS manufacturer_brands (
        id SERIAL PRIMARY KEY,
        company_name TEXT NOT NULL,
        brand_name TEXT NOT NULL,
        purchase_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        net_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
        discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        UNIQUE(company_name, brand_name)
      );

      ALTER TABLE manufacturer_brands ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;

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
    );

    CREATE TABLE IF NOT EXISTS expense_accounts (
      id SERIAL PRIMARY KEY,
      account_name TEXT UNIQUE NOT NULL,
      default_rate NUMERIC(10,2) NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS purchase_expenses (
      id SERIAL PRIMARY KEY,
      purchase_id INTEGER REFERENCES purchases(id) ON DELETE CASCADE,
      expense_account_id INTEGER REFERENCES expense_accounts(id) ON DELETE RESTRICT,
      account_name TEXT NOT NULL,
      cartons INTEGER NOT NULL DEFAULT 0,
      rate NUMERIC(10,2) NOT NULL DEFAULT 0,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      remarks TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      phone TEXT DEFAULT '',
      address TEXT DEFAULT '',
      initial_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
      opening_date DATE
    );

    CREATE TABLE IF NOT EXISTS supplier_payments (
      id SERIAL PRIMARY KEY,
      supplier_name TEXT NOT NULL,
      payment_date DATE NOT NULL,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      payment_mode TEXT DEFAULT 'Cash',
      notes TEXT DEFAULT ''
    );
  `);

  // Auto-migrate unique suppliers from purchases
  await query(`
    INSERT INTO suppliers (name, initial_balance)
    SELECT DISTINCT supplier_name, 0 FROM purchases
    WHERE supplier_name IS NOT NULL AND trim(supplier_name) != ''
    ON CONFLICT (name) DO NOTHING
  `);

  // Indexes
  await query('CREATE INDEX IF NOT EXISTS idx_purchase_items_item_code ON purchase_items(item_code)');
  await query('CREATE INDEX IF NOT EXISTS idx_sale_items_item_code ON sale_items(item_code)');
  await query('CREATE INDEX IF NOT EXISTS idx_purchase_return_items_item_code ON purchase_return_items(item_code)');
  await query('CREATE INDEX IF NOT EXISTS idx_sales_return_items_item_code ON sales_return_items(item_code)');
  await query('CREATE INDEX IF NOT EXISTS idx_stock_adj_item_code ON stock_adjustments(item_code)');

  // Migrations — add columns that may not exist in older DBs
  await query('ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_inv_no TEXT');
  await query('ALTER TABLE purchases ADD COLUMN IF NOT EXISTS supplier_date DATE');
  await query('ALTER TABLE purchases ADD COLUMN IF NOT EXISTS vehicle_no TEXT');
  await query("ALTER TABLE purchases ADD COLUMN IF NOT EXISTS godown TEXT DEFAULT '1-SHOP'");
  await query('ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS packing_qty INTEGER NOT NULL DEFAULT 0');
  await query('ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS pre_disc_price NUMERIC(10,2) DEFAULT 0');
  await query('ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS flat_discount NUMERIC(10,2) DEFAULT 0');
  await query('ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS disc_pct NUMERIC(5,2) DEFAULT 0');
  await query('ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0');
  await query('ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS net_rate NUMERIC(12,5) DEFAULT 0');
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
      COALESCE((SELECT SUM(pi.packets) FROM purchase_items pi JOIN purchases p ON pi.purchase_id = p.id WHERE pi.item_code=$1 AND p.is_posted = 1),0) -
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

      case 'get-expense-accounts': { const r = await query('SELECT * FROM expense_accounts ORDER BY account_name'); return r.rows; }
      case 'add-expense-account': { 
        try {
          await query('INSERT INTO expense_accounts (account_name, default_rate) VALUES ($1, $2) ON CONFLICT (account_name) DO UPDATE SET default_rate = EXCLUDED.default_rate', [data.account_name, data.default_rate]); 
          broadcast('expense_accounts'); 
          return { success: true }; 
        } catch (err) {
          return { success: false, error: err.message };
        }
      }
      case 'update-expense-account': { 
        await query('UPDATE expense_accounts SET account_name=$1, default_rate=$2 WHERE id=$3', [data.account_name, data.default_rate, data.id]); 
        broadcast('expense_accounts'); 
        return { success: true }; 
      }
      case 'delete-expense-account': { 
        await query('DELETE FROM expense_accounts WHERE id=$1', [data]); 
        broadcast('expense_accounts'); 
        return { success: true }; 
      }

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
    case 'check-duplicate-product': {
      const { description, gender, category, sizeRange, purchaseRate, saleRate, year, excludeId } = data;
      let sql = `SELECT * FROM products WHERE description ILIKE $1 AND gender ILIKE $2 AND category ILIKE $3 AND size_range ILIKE $4 AND purchase_rate = $5 AND sale_rate = $6 AND year = $7`;
      const params = [description.trim(), gender || '', category || '', sizeRange || '', purchaseRate, saleRate, year || ''];
      if (excludeId) {
        sql += ` AND id != $8`;
        params.push(excludeId);
      }
      sql += ` LIMIT 1`;
      const r = await query(sql, params);
      return r.rows.length > 0 ? r.rows[0] : null;
    }
    case 'save-product': {
      const { itemCode, description, gender, category, sizeRange, purchaseRate, saleRate, packingQty, year, brand, discount, note, sessionId } = data;
      const r = await query(
        'INSERT INTO products (item_code, description, gender, category, size_range, purchase_rate, sale_rate, packing_qty, year, brand, discount, note, session_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, item_code',
        [itemCode, description, gender || '', category || '', sizeRange || '', purchaseRate, saleRate, packingQty, year || null, brand || '', discount ? parseFloat(discount) : 0, note || '', sessionId || 0]
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
    case 'get-products-chunked': {
      const { limit, offset } = data;
      const countRes = await query('SELECT COUNT(*) as total FROM products');
      const r = await query('SELECT * FROM products ORDER BY id DESC LIMIT $1 OFFSET $2', [limit, offset]);
      return { products: r.rows, total: parseInt(countRes.rows[0].total) };
    }
    case 'get-product-by-code': {
      const r = await query('SELECT * FROM products WHERE item_code ILIKE $1', [data]);
      return r.rows[0] || null;
    }
    case 'get-product-photo': {
      const r = await query('SELECT photo_path FROM products WHERE id=$1', [data]);
      if (r.rows.length && r.rows[0].photo_path && fs.existsSync(r.rows[0].photo_path)) {
        return `file://${r.rows[0].photo_path}?t=${Date.now()}`;
      }
      return null;
    }

    case 'start-new-item-session': {
      const today = new Date().toISOString().split('T')[0];
      const lastSessionDate = store.get('last_item_session_date');
      
      if (lastSessionDate !== today) {
        store.set('last_item_session_date', today);
        store.set('last_item_session_id', 1);
        
        // Clean up previous days' sessions by setting them to 0 so they don't persist
        query('UPDATE products SET session_id = 0 WHERE session_id > 0 AND created_at < CURRENT_DATE').catch(console.error);
      } else {
        const current = store.get('last_item_session_id') || 0;
        store.set('last_item_session_id', current + 1);
      }
      return store.get('last_item_session_id');
    }
    
    case 'get-item-sessions': {
      const r = await query(`
        SELECT session_id, MIN(created_at) as started_at 
        FROM products 
        WHERE session_id > 0 AND created_at >= CURRENT_DATE
        GROUP BY session_id 
        ORDER BY session_id DESC 
        LIMIT 50
      `);
      return r.rows;
    }
    
    case 'get-products-by-session': {
      const r = await query('SELECT * FROM products WHERE session_id = $1 ORDER BY id ASC', [data]);
      return r.rows;
    }
    
    case 'get-products-by-session-range': {
      const { from, to } = data;
      // Fetch products between from and to (inclusive)
      const r = await query('SELECT * FROM products WHERE session_id >= $1 AND session_id <= $2 ORDER BY session_id ASC, id ASC', [from, to]);
      return r.rows;
    }

    case 'search-products': {
      const q = `%${data}%`;
      const exact = data;
      const prefix = `${data}%`;
      const r = await query(`
        SELECT * FROM products 
        WHERE item_code ILIKE $1 OR description ILIKE $1 
        ORDER BY 
          (item_code ILIKE $2) DESC,
          (item_code ILIKE $3) DESC,
          id DESC 
        LIMIT 50
      `, [q, exact, prefix]);
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

    // ── MANUFACTURER BRANDS (PURCHASE DISCOUNTS) ──
    case 'get-manufacturer-brands': {
      const r = await query('SELECT * FROM manufacturer_brands ORDER BY company_name, brand_name');
      return r.rows;
    }
    case 'get-raw-manufacturer-brands': {
      const r = await query('SELECT * FROM manufacturer_brands');
      return r.rows;
    }
    case 'save-manufacturer-discounts-bulk': {
      await query('BEGIN');
      try {
        await query('DELETE FROM manufacturer_brands');
        const rows = data;
        for (const row of rows) {
          const mfg = row.manufacturer;
          const b = row.brand || '';
          const pd = parseFloat(row.discount_pct) || 0;
          const da = parseFloat(row.discount_amount) || 0;
          if (!mfg || !b) continue;
          
          await query(
            `INSERT INTO manufacturer_brands (company_name, brand_name, purchase_discount_pct, discount_amount)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (company_name, brand_name) DO NOTHING`,
            [mfg, b, pd, da]
          );
        }
        await query('COMMIT');
        return { success: true };
      } catch (err) {
        await query('ROLLBACK');
        throw err;
      }
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
      const prods = await query(`
        SELECT p.*,
          COALESCE(CAST((
            COALESCE(purchases.qty, 0) - COALESCE(sales.qty, 0) + COALESCE(returns_in.qty, 0) - COALESCE(returns_out.qty, 0) + COALESCE(adjustments.qty, 0)
          ) AS INTEGER), 0) AS stock_packets
        FROM products p
        LEFT JOIN (
          SELECT pi.item_code, SUM(pi.packets) as qty 
          FROM purchase_items pi JOIN purchases pu ON pi.purchase_id = pu.id 
          WHERE pu.is_posted = 1 
          GROUP BY pi.item_code
        ) purchases ON purchases.item_code = p.item_code
        LEFT JOIN (
          SELECT item_code, SUM(packets) as qty FROM sale_items GROUP BY item_code
        ) sales ON sales.item_code = p.item_code
        LEFT JOIN (
          SELECT item_code, SUM(packets) as qty FROM purchase_return_items GROUP BY item_code
        ) returns_out ON returns_out.item_code = p.item_code
        LEFT JOIN (
          SELECT item_code, SUM(packets) as qty FROM sales_return_items GROUP BY item_code
        ) returns_in ON returns_in.item_code = p.item_code
        LEFT JOIN (
          SELECT item_code, SUM(adjustment_qty) as qty FROM stock_adjustments GROUP BY item_code
        ) adjustments ON adjustments.item_code = p.item_code
        ORDER BY p.id DESC
      `);
      return prods.rows;
    }
    case 'get-stock-list-chunked': {
      const { limit, offset } = data;
      const countRes = await query('SELECT COUNT(*) as total FROM products');
      const prods = await query(`
        SELECT p.*,
          COALESCE(CAST((
            COALESCE(purchases.qty, 0) - COALESCE(sales.qty, 0) + COALESCE(returns_in.qty, 0) - COALESCE(returns_out.qty, 0) + COALESCE(adjustments.qty, 0)
          ) AS INTEGER), 0) AS stock_packets
        FROM products p
        LEFT JOIN (
          SELECT pi.item_code, SUM(pi.packets) as qty 
          FROM purchase_items pi JOIN purchases pu ON pi.purchase_id = pu.id 
          WHERE pu.is_posted = 1 
          GROUP BY pi.item_code
        ) purchases ON purchases.item_code = p.item_code
        LEFT JOIN (
          SELECT item_code, SUM(packets) as qty FROM sale_items GROUP BY item_code
        ) sales ON sales.item_code = p.item_code
        LEFT JOIN (
          SELECT item_code, SUM(packets) as qty FROM purchase_return_items GROUP BY item_code
        ) returns_in ON returns_in.item_code = p.item_code
        LEFT JOIN (
          SELECT item_code, SUM(packets) as qty FROM sales_return_items GROUP BY item_code
        ) returns_out ON returns_out.item_code = p.item_code
        LEFT JOIN (
          SELECT item_code, SUM(adjustment_qty) as qty FROM stock_adjustments GROUP BY item_code
        ) adjustments ON adjustments.item_code = p.item_code
        ORDER BY p.id DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      return { items: prods.rows, total: parseInt(countRes.rows[0].total) };
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
      const { purchaseDate, invoiceNo, supplierName, items, expenses, discount, miscCharges, purchaseExpenseTotal, notes, supplierInvNo, supplierDate, vehicleNo, godown, bltNumber } = data;
      const total = items.reduce((s, i) => s + i.amount, 0) - (discount || 0) + (miscCharges || 0) + (purchaseExpenseTotal || 0);
      const pr = await query(
        'INSERT INTO purchases (purchase_date, invoice_no, supplier_name, total_amount, discount, misc_charges, notes, is_posted, supplier_inv_no, supplier_date, vehicle_no, godown, blt_number) VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12) RETURNING id',
        [purchaseDate, invoiceNo || null, supplierName, total, discount || 0, miscCharges || 0, notes || null, supplierInvNo || null, supplierDate || null, vehicleNo || null, godown || '1-SHOP', bltNumber || null]
      );
      const purchaseId = pr.rows[0].id;
      for (const item of items) {
        if (item.itemCode) {
          await query(
            'INSERT INTO products (item_code, description, purchase_rate, sale_rate) VALUES ($1, $2, $3, $4) ON CONFLICT (item_code) DO NOTHING',
            [item.itemCode, item.itemDescription || 'Unknown', parseFloat(item.rate) || 0, (parseFloat(item.rate) || 0) * 1.2]
          );
        }
        await query(
          'INSERT INTO purchase_items (purchase_id, item_code, item_description, packets, packing_qty, rate, amount, pre_disc_price, flat_discount, disc_pct, discount_amount, net_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
          [purchaseId, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.rate, item.amount, item.preDiscPrice || 0, item.flatDiscount || 0, item.discPct || 0, item.discountAmount || 0, item.netRate || 0]
        );
      }
      if (expenses && expenses.length > 0) {
        for (const exp of expenses) {
          await query(
            'INSERT INTO purchase_expenses (purchase_id, expense_account_id, account_name, cartons, rate, amount) VALUES ($1, $2, $3, $4, $5, $6)',
            [purchaseId, exp.expense_account_id, exp.account_name || '', exp.cartons || 0, exp.rate || 0, exp.amount || 0]
          );
        }
      }
      broadcast('purchases'); broadcast('stock');
      return { success: true, id: purchaseId };
    }
    case 'update-purchase': {
      const { id, purchaseDate, invoiceNo, supplierName, items, expenses, discount, miscCharges, purchaseExpenseTotal, notes, supplierInvNo, supplierDate, vehicleNo, godown, bltNumber } = data;
      const total = items.reduce((s, i) => s + i.amount, 0) - (discount || 0) + (miscCharges || 0) + (purchaseExpenseTotal || 0);
      await query(
        'UPDATE purchases SET purchase_date=$1, invoice_no=$2, supplier_name=$3, total_amount=$4, discount=$5, misc_charges=$6, notes=$7, supplier_inv_no=$8, supplier_date=$9, vehicle_no=$10, godown=$11, is_posted=0, blt_number=$13 WHERE id=$12',
        [purchaseDate, invoiceNo || null, supplierName, total, discount || 0, miscCharges || 0, notes || null, supplierInvNo || null, supplierDate || null, vehicleNo || null, godown || '1-SHOP', id, bltNumber || null]
      );
      await query('DELETE FROM purchase_items WHERE purchase_id=$1', [id]);
      for (const item of items) {
        if (item.itemCode) {
          await query(
            'INSERT INTO products (item_code, description, purchase_rate, sale_rate) VALUES ($1, $2, $3, $4) ON CONFLICT (item_code) DO NOTHING',
            [item.itemCode, item.itemDescription || 'Unknown', parseFloat(item.rate) || 0, (parseFloat(item.rate) || 0) * 1.2]
          );
        }
        await query(
          'INSERT INTO purchase_items (purchase_id, item_code, item_description, packets, packing_qty, rate, amount, pre_disc_price, flat_discount, disc_pct, discount_amount, net_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
          [id, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.rate, item.amount, item.preDiscPrice || 0, item.flatDiscount || 0, item.discPct || 0, item.discountAmount || 0, item.netRate || 0]
        );
      }
      await query('DELETE FROM purchase_expenses WHERE purchase_id=$1', [id]);
      if (expenses && expenses.length > 0) {
        for (const exp of expenses) {
          await query(
            'INSERT INTO purchase_expenses (purchase_id, expense_account_id, account_name, cartons, rate, amount) VALUES ($1, $2, $3, $4, $5, $6)',
            [id, exp.expense_account_id, exp.account_name || '', exp.cartons || 0, exp.rate || 0, exp.amount || 0]
          );
        }
      }
      broadcast('purchases'); broadcast('stock');
      return { success: true };
    }
    case 'get-purchases': {
      const res = await query(`
        SELECT p.*, 
               (SELECT SUM(pi.packets) FROM purchase_items pi WHERE pi.purchase_id = p.id) as total_qty
        FROM purchases p ORDER BY p.id DESC LIMIT 500
      `);
      return res.rows;
    }
    case 'get-purchase-items': {
      const r = await query('SELECT * FROM purchase_items WHERE purchase_id=$1 ORDER BY id', [data]);
      return r.rows;
    }
    case 'get-purchase-expenses': {
      const r = await query('SELECT * FROM purchase_expenses WHERE purchase_id=$1 ORDER BY id', [data]);
      return r.rows;
    }
    case 'get-purchase-barcode-data': {
      const r = await query(`
        SELECT 
          pi.item_code, 
          COALESCE(p.brand, '') as brand,
          COALESCE(p.description, pi.item_description, 'Unknown') as description,
          COALESCE(p.category, '') as category,
          COALESCE(p.size_range, '') as size_range,
          COALESCE(p.gender, '') as gender,
          pi.packets as quantity, 
          COALESCE(p.sale_rate, 0) as sale_rate, 
          COALESCE(p.packing_qty, 1) as packing_qty
        FROM purchase_items pi
        LEFT JOIN products p ON pi.item_code = p.item_code
        WHERE pi.purchase_id = $1
      `, [data]);
      console.log('Barcode Data:', r.rows);
      return r.rows;
    }
    case 'delete-purchase': {
      await query('DELETE FROM purchases WHERE id=$1', [data]);
      broadcast('purchases'); broadcast('stock');
      return { success: true };
    }
    case 'post-purchase': {
      await query('UPDATE purchases SET is_posted=1 WHERE id=$1', [data]);
      broadcast('purchases'); broadcast('stock');
      return { success: true };
    }
    case 'post-purchase-bulk': {
      const { fromId, toId } = data;
      await query('UPDATE purchases SET is_posted=1 WHERE id BETWEEN $1 AND $2 AND is_posted=0', [fromId, toId]);
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

    // ─── SUPPLIER LEDGER ──────────────────────────────────────────────────────
    case 'get-suppliers-ledger': {
      const res = await query(`
        SELECT 
          s.id,
          s.name,
          s.phone,
          s.address,
          s.initial_balance,
          s.opening_date,
          COALESCE(p.total_purchases, 0) as total_purchases,
          COALESCE(pr.total_returns, 0) as total_returns,
          COALESCE(sp.total_paid, 0) as total_paid,
          (s.initial_balance + COALESCE(p.total_purchases, 0) - COALESCE(pr.total_returns, 0) - COALESCE(sp.total_paid, 0)) as net_balance
        FROM suppliers s
        LEFT JOIN (
          SELECT supplier_name, SUM(total_amount) as total_purchases
          FROM purchases WHERE is_posted = 1 GROUP BY supplier_name
        ) p ON p.supplier_name = s.name
        LEFT JOIN (
          SELECT supplier_name, SUM(total_amount) as total_returns
          FROM purchase_returns WHERE is_posted = 1 GROUP BY supplier_name
        ) pr ON pr.supplier_name = s.name
        LEFT JOIN (
          SELECT supplier_name, SUM(amount) as total_paid
          FROM supplier_payments GROUP BY supplier_name
        ) sp ON sp.supplier_name = s.name
        ORDER BY s.name ASC
      `);
      return res.rows;
    }
    case 'update-supplier-balance': {
      const { id, initial_balance } = data;
      await query('UPDATE suppliers SET initial_balance = $1 WHERE id = $2', [parseFloat(initial_balance) || 0, id]);
      return { success: true };
    }
    case 'add-supplier-payment': {
      const { supplier_name, payment_date, amount, payment_mode, notes } = data;
      await query('INSERT INTO supplier_payments (supplier_name, payment_date, amount, payment_mode, notes) VALUES ($1,$2,$3,$4,$5)',
        [supplier_name, payment_date, parseFloat(amount) || 0, payment_mode || 'Cash', notes || '']
      );
      return { success: true };
    }
    case 'get-supplier-statement': {
      const { supplier_name } = data;
      const supplierRow = await query('SELECT initial_balance FROM suppliers WHERE name = $1', [supplier_name]);
      const initial_balance = supplierRow.rows[0]?.initial_balance || 0;
      
      const res = await query(`
        SELECT 
          'Purchase' as type,
          purchase_date as txn_date,
          invoice_no as ref_no,
          total_amount as amount,
          notes
        FROM purchases
        WHERE supplier_name = $1 AND is_posted = 1
        
        UNION ALL
        
        SELECT 
          'Return' as type,
          return_date as txn_date,
          return_no as ref_no,
          total_amount as amount,
          notes
        FROM purchase_returns
        WHERE supplier_name = $1 AND is_posted = 1
        
        UNION ALL
        
        SELECT 
          'Payment' as type,
          payment_date as txn_date,
          'PAY-' || id as ref_no,
          amount,
          notes
        FROM supplier_payments
        WHERE supplier_name = $1
        
        ORDER BY txn_date ASC
      `, [supplier_name]);
      
      return { initial_balance, transactions: res.rows };
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

    // ── MANUFACTURERS ──
    case 'get-manufacturers': {
      const r = await query('SELECT * FROM manufacturers ORDER BY name');
      return r.rows;
    }
    case 'add-manufacturer': {
      await query('INSERT INTO manufacturers (name) VALUES ($1) ON CONFLICT DO NOTHING', [data]);
      return { success: true };
    }
    case 'delete-manufacturer': {
      await query('DELETE FROM manufacturers WHERE id=$1', [data]);
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
    case 'setup-database': {
      const masterPassword = data;
      const setupPool = new Pool({
        host: 'localhost',
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password: masterPassword,
        connectionTimeoutMillis: 5000
      });
      try {
        const roleCheck = await setupPool.query("SELECT 1 FROM pg_roles WHERE rolname='atg_user'");
        if (roleCheck.rowCount === 0) {
          await setupPool.query("CREATE ROLE atg_user WITH LOGIN PASSWORD 'atg_pass123' SUPERUSER");
        }
        const dbCheck = await setupPool.query("SELECT 1 FROM pg_database WHERE datname='atg_wholesale'");
        if (dbCheck.rowCount === 0) {
          await setupPool.query("CREATE DATABASE atg_wholesale OWNER atg_user");
        }
        
        // Now try to reconnect the main pool to the new database and initialize tables
        if (pool) await pool.end().catch(()=>{});
        pool = createPool();
        await initDatabase();
        
        // Reconnect Express Server
        if (expressServer) { expressServer.close(); expressServer = null; }
        startExpressServer();
        dbStatus = { connected: true, error: null };
        
        // Auto-load default data removed as per request
        
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      } finally {
        await setupPool.end().catch(() => {});
      }
    }
    case 'test-client-connection': {
      let { serverAddress: sa, networkToken: tok } = data || {};
      if (sa && !/^https?:\/\//i.test(sa)) sa = `http://${sa}`;
      const nodeFetch = require('node-fetch');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const res = await nodeFetch(`${sa}/api/events`, { headers: { 'x-token': tok || '' }, signal: controller.signal });
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
    // ─── ADVANCED BACKUP ────────────────────────────────────────────────────────
    case 'get-backup-settings': {
      const backupRoot = findBackupDrive(); 
      const configuredPath = store.get('backupDrivePath') || '';

      let dailySnapshots = [];
      if (backupRoot) {
        const dailyDir = path.join(backupRoot, 'daily');
        try {
          if (fs.existsSync(dailyDir)) {
            dailySnapshots = fs.readdirSync(dailyDir)
              .filter(f => f.startsWith('shop_') && f.endsWith('.json'))
              .sort().reverse() 
              .map(f => ({
                filename: f,
                date: f.replace('shop_', '').replace('.json', ''),
                path: path.join(dailyDir, f),
                size: fs.statSync(path.join(dailyDir, f)).size,
              }));
          }
        } catch (e) { }
      }
      return {
        backupPath: backupRoot || configuredPath,
        isDriveConnected: !!backupRoot,
        lastBackupTime: store.get('lastBackupTime') || null,
        lastBackupStatus: store.get('lastBackupStatus') || null,
        dailySnapshots,
      };
    }
    case 'set-backup-path': {
      const drivePath = data;
      if (!drivePath) {
        store.delete('backupDrivePath');
        return { success: true, message: 'Backup disabled' };
      }
      if (!fs.existsSync(drivePath)) {
        return { success: false, error: 'Path does not exist' };
      }

      store.set('backupDrivePath', drivePath);

      const atgDir = path.join(drivePath, 'SHOP_Backup');
      fs.mkdirSync(atgDir, { recursive: true });

      const idFile = path.join(atgDir, '.shop_system_id');
      if (!fs.existsSync(idFile)) {
        fs.writeFileSync(idFile, getSystemId());
      }

      const liveBackupFile = path.join(atgDir, 'shop.json');
      const hasExistingBackup = fs.existsSync(liveBackupFile);

      return { success: true, hasExistingBackup, message: 'Backup drive connected.' };
    }
    case 'test-backup': {
      const backupRoot = findBackupDrive(); 
      if (!backupRoot) {
        store.set('lastBackupStatus', 'Drive not found (unplugged or missing)');
        return { success: false, error: 'No backup drive found. Please plug it in.' };
      }
      try {
        const atgDir = path.join(backupRoot, 'SHOP_Backup');
        fs.mkdirSync(atgDir, { recursive: true });

        const exportData = {};
        for (const t of BACKUP_TABLES) { 
          const r = await query(`SELECT * FROM ${t} ORDER BY id`); 
          exportData[t] = r.rows; 
        }

        const liveFile = path.join(atgDir, 'shop.json');
        fs.writeFileSync(liveFile, JSON.stringify(exportData, null, 2));

        saveDailySnapshotJSON(exportData, atgDir);

        store.set('lastBackupTime', new Date().toISOString());
        store.set('lastBackupStatus', 'OK');
        return { success: true };
      } catch (err) {
        store.set('lastBackupStatus', 'Error: ' + err.message);
        return { success: false, error: err.message };
      }
    }
    case 'restore-from-backup': {
      const specificFile = data;
      const backupRoot = store.get('backupDrivePath');
      if (!backupRoot && !specificFile) return { success: false, error: 'No backup path configured' };

      const fileToRestore = specificFile || path.join(backupRoot, 'SHOP_Backup', 'shop.json');
      return await runRestore(fileToRestore);
    }

    default:
      throw new Error(`No handler registered for '${channel}'`);
  }
}

// ── Client mode forwarding ────────────────────────────────────────────────────
async function forwardToServer(channel, data) {
  let serverAddress = store.get('serverAddress', '');
  if (serverAddress && !/^https?:\/\//i.test(serverAddress)) serverAddress = `http://${serverAddress}`;
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
  'get-local-ips', 'test-db-connection', 'test-client-connection', 'setup-database',
  'get-backup-settings', 'set-backup-path', 'test-backup', 'restore-from-backup',
  'relaunch-app', 'select-backup-dir', 'get-printers', 'print-receipt', 'print-pdf', 'print-barcodes-pdf', 'print-raw'
]);

function registerIPC() {
  const channels = [
    'check-any-users', 'register', 'login',
    'get-genders', 'add-gender', 'update-gender', 'delete-gender',
    'get-categories', 'add-category', 'update-category', 'delete-category',
    'get-size-ranges', 'add-size-range', 'update-size-range', 'delete-size-range',
    'get-packings', 'add-packing', 'update-packing', 'delete-packing',
    'get-brands', 'add-brand', 'update-brand', 'delete-brand',
    'get-expense-accounts', 'add-expense-account', 'update-expense-account', 'delete-expense-account',
    'get-purchase-expenses',
    'get-manufacturers', 'add-manufacturer', 'delete-manufacturer',
    'get-next-item-code', 'save-product', 'update-product', 'get-products', 'get-products-chunked', 'get-product-by-code', 'search-products', 'delete-product', 'save-product-photo', 'get-product-photo', 'start-new-item-session', 'get-item-sessions', 'get-products-by-session', 'get-products-by-session-range', 'check-duplicate-product',
    'get-companies', 'save-company', 'delete-company',
    'get-profit-rules', 'save-profit-rule', 'delete-profit-rule',
    'get-manufacturer-brands', 'get-raw-manufacturer-brands', 'save-manufacturer-discounts-bulk',
    'get-overall-profit', 'save-overall-profit', 'confirm-dialog', 'alert-dialog',
    'get-stock-list', 'get-stock-list-chunked', 'get-stock-single', 'adjust-stock',
    'save-purchase', 'update-purchase', 'get-purchases', 'get-purchase-items', 'delete-purchase', 'post-purchase', 'post-purchase-bulk', 'get-purchase-barcode-data',
    'save-purchase-return', 'update-purchase-return', 'get-purchase-returns', 'get-purchase-return-items', 'delete-purchase-return',
    'get-suppliers-ledger', 'update-supplier-balance', 'add-supplier-payment', 'get-supplier-statement',
    'save-sale', 'update-sale', 'get-sales', 'get-sale-items', 'delete-sale', 'get-next-invoice-no',
    'save-sales-return', 'update-sales-return', 'get-sales-returns', 'get-sales-return-items', 'delete-sales-return', 'get-next-return-no',
    'get-report-summary', 'get-report-top-items',
    'get-users', 'add-user', 'create-user', 'update-user', 'delete-user',
    'get-network-settings', 'save-network-settings', 'get-network-config', 'save-network-config',
    'get-local-ips', 'test-db-connection', 'test-client-connection', 'setup-database',
    'get-backup-settings', 'set-backup-path', 'test-backup', 'restore-from-backup'
  ];

  const AUTO_BACKUP_TRIGGERS = new Set([
    'save-product', 'update-product', 'delete-product',
    'add-brand', 'update-brand', 'delete-brand',
    'add-category', 'update-category', 'delete-category',
    'add-packing', 'update-packing', 'delete-packing',
    'add-gender', 'update-gender', 'delete-gender',
    'add-size-range', 'update-size-range', 'delete-size-range',
    'save-profit-rule', 'delete-profit-rule', 'save-overall-profit',
    'save-purchase', 'update-purchase', 'delete-purchase',
    'save-sale', 'update-sale', 'delete-sale',
    'save-purchase-return', 'delete-purchase-return',
    'save-sales-return', 'delete-sales-return'
  ]);

  channels.forEach(channel => {
    ipcMain.handle(channel, async (event, data) => {
      let result;
      if (isClientMode && !LOCAL_CHANNELS.has(channel)) {
        result = await forwardToServer(channel, data);
      } else {
        result = await handleIPC(channel, data);
      }
      
      if (AUTO_BACKUP_TRIGGERS.has(channel) && result && (result.success || result.id)) {
        executeAutoBackup().catch(err => console.error('[AutoBackup] Error:', err));
      }
      
      return result;
    });
  });

  // Print receipt (local only)
  ipcMain.handle('print-receipt', async (event, receiptData) => {
    return { success: true }; // placeholder — implement if thermal printer needed
  });

  // Print barcode handler - use PDF to avoid Windows print dialog crash
  ipcMain.handle('print-barcodes-pdf', async () => {
    try {
      if (mainWindow) {
        // Generate PDF instead of showing print dialog
        const data = await mainWindow.webContents.printToPDF({
          printBackground: true,
          marginsType: 1, // No margins
          pageSize: 'A4',
          landscape: false
        });

        // Save PDF to temp location
        const tempPath = path.join(app.getPath('temp'), `barcodes_${Date.now()}.pdf`);
        fs.writeFileSync(tempPath, data);

        // Open PDF in Chrome
        const { exec } = require('child_process');
        const chromePaths = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
        ];

        let chromeFound = false;
        for (const chromePath of chromePaths) {
          if (fs.existsSync(chromePath)) {
            exec(`"${chromePath}" "${tempPath}"`);
            chromeFound = true;
            break;
          }
        }

        // Fallback to default if Chrome not found
        if (!chromeFound) {
          require('electron').shell.openPath(tempPath);
        }
        return { success: true };
      }
      return { success: false, error: 'No main window' };
    } catch (error) {
      console.error('PDF print error:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-printers', async (event) => {
    // Try Electron's native API first
    try {
      const printers = await event.sender.getPrintersAsync();
      if (printers && printers.length > 0) return printers;
    } catch (e) {
      console.warn('[GET-PRINTERS] Electron native API failed, trying WMI fallback:', e.message);
    }

    // Fallback: WMI query — works on Windows 7 and all later versions
    const { exec } = require('child_process');
    return new Promise((resolve) => {
      const cmd = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-WmiObject Win32_Printer | Select-Object Name,Default | ConvertTo-Json"`;
      exec(cmd, { windowsHide: true }, (err, stdout) => {
        if (err) {
          console.error('[GET-PRINTERS] WMI fallback also failed:', err.message);
          resolve([]);
          return;
        }
        try {
          let parsed = JSON.parse(stdout.trim());
          // PowerShell returns a single object (not array) when there's only one printer
          if (!Array.isArray(parsed)) parsed = [parsed];
          const list = parsed.map(p => ({
            name: p.Name,
            displayName: p.Name,
            isDefault: !!p.Default
          }));
          resolve(list);
        } catch {
          console.error('[GET-PRINTERS] Could not parse WMI output');
          resolve([]);
        }
      });
    });
  });

  ipcMain.handle('print-raw', async (event, { printerName, data }) => {
    const { exec } = require('child_process');
    try {
      const tempDir = app.getPath('temp');
      const stamp = Date.now();
      const tempPath = path.join(tempDir, `label_${stamp}.prn`);
      const scriptPath = path.join(tempDir, `print_${stamp}.ps1`);

      // Write the raw TSPL bytes to a temp file. TSPL is ASCII so utf8 is fine;
      // the spooler sends these bytes through untouched (RAW datatype).
      fs.writeFileSync(tempPath, data);

      // PowerShell script that uses the winspool.drv RAW API to send bytes to
      // any locally-installed printer by its DISPLAY NAME (exactly as Electron's
      // getPrintersAsync returns it). This works regardless of whether the
      // printer is shared, and handles names with spaces/special chars.
      //
      // If the C# Add-Type compilation fails (e.g. older .NET, restricted env),
      // it falls back to resolving the printer's port via WMI (Win32_Printer),
      // which works on Windows 7 / PowerShell 2.0+ and all later versions.
      const psEsc = (s) => String(s).replace(/'/g, "''"); // escape for PS single-quoted string
      const psScript = `$ErrorActionPreference = 'Stop'
$printerName = '${psEsc(printerName)}'
$filePath = '${psEsc(tempPath)}'

# ---- Attempt 1: winspool.drv RAW API (most reliable) ----
$winspoolOk = $false
if ($PSVersionTable.PSVersion.Major -ge 3) {
  try {
    Add-Type @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOCINFOA {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPWStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

    public static void SendBytesToPrinter(string szPrinterName, byte[] bytes) {
        IntPtr hPrinter;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "ATG Label";
        di.pDataType = "RAW";
        if (!OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero))
            throw new Exception("OpenPrinter failed (Win32 error " + Marshal.GetLastWin32Error() + "). Printer not found: " + szPrinterName);
        try {
            if (!StartDocPrinter(hPrinter, 1, di)) throw new Exception("StartDocPrinter failed (" + Marshal.GetLastWin32Error() + ")");
            try {
                if (!StartPagePrinter(hPrinter)) throw new Exception("StartPagePrinter failed (" + Marshal.GetLastWin32Error() + ")");
                IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
                Marshal.Copy(bytes, 0, p, bytes.Length);
                int written;
                bool ok = WritePrinter(hPrinter, p, bytes.Length, out written);
                Marshal.FreeCoTaskMem(p);
                EndPagePrinter(hPrinter);
                if (!ok) throw new Exception("WritePrinter failed (" + Marshal.GetLastWin32Error() + ")");
            } finally { EndDocPrinter(hPrinter); }
        } finally { ClosePrinter(hPrinter); }
    }
}
'@
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    [RawPrinterHelper]::SendBytesToPrinter($printerName, $bytes)
    $winspoolOk = $true
    Write-Output 'PRINT_OK'
  } catch {
    Write-Output ('WINSPOOL_ERR: ' + $_.Exception.Message)
  }
}

# ---- Attempt 2: Resolve printer port via WMI (Win7+ compatible) ----
if (-not $winspoolOk) {
  try {
    # Get-WmiObject works on Windows 7 (PowerShell 2.0+), unlike Get-Printer (Win8+)
    $wmiPrinter = Get-WmiObject Win32_Printer -Filter "Name='$($printerName -replace "'","''")'" -ErrorAction Stop
    if (-not $wmiPrinter) {
      # Try case-insensitive partial match as a fallback
      $wmiPrinter = Get-WmiObject Win32_Printer | Where-Object { $_.Name -eq $printerName } | Select-Object -First 1
    }
    if ($wmiPrinter -and $wmiPrinter.PortName) {
      $port = $wmiPrinter.PortName
      # Check if port is a file-system path (e.g., USB001:, LPT1:, COM1:)
      Copy-Item -Path $filePath -Destination $port -Force -ErrorAction Stop
      Write-Output 'PRINT_OK'
    } else {
      Write-Output 'PORT_ERR: Could not resolve printer port via WMI'
    }
  } catch {
    Write-Output ('PORT_ERR: ' + $_.Exception.Message)
  }
}
`;
      fs.writeFileSync(scriptPath, psScript, 'utf8');

      const cleanup = () => {
        setTimeout(() => {
          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
          try { if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath); } catch {}
        }, 5000);
      };

      const command = `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`;
      console.log(`[PRINT-RAW] Sending raw to "${printerName}" via spooler API`);

      return await new Promise((resolve) => {
        // 15 second timeout to prevent hanging indefinitely
        exec(command, { windowsHide: true, timeout: 15000 }, (error, stdout, stderr) => {
          const out = (stdout || '').trim();
          console.log('[PRINT-RAW] Result:', out, '| Stderr:', stderr, '| Error:', error && error.message);

          if (out.includes('PRINT_OK')) {
            cleanup();
            resolve({ success: true });
            return;
          }

          // Check if it timed out
          let timeoutMsg = '';
          if (error && error.killed) {
            timeoutMsg = ' (Timed out while communicating with the printer)';
            console.error('[PRINT-RAW] Process killed due to timeout (Attempt 1 & 2)');
          }

          // Both winspool and port-based approaches failed — try legacy share path
          // as a last resort (only works if printer is shared).
          const computerName = process.env.COMPUTERNAME || 'localhost';
          let dest = printerName;
          if (!printerName.startsWith('\\\\') && !printerName.includes(':')) {
            dest = `\\\\${computerName}\\${printerName}`;
          }
          const fallbackCmd = `print /d:"${dest}" "${tempPath}"`;
          console.log(`[PRINT-RAW] Primary methods failed${timeoutMsg}, trying share fallback: ${fallbackCmd}`);

          // 10 second timeout for fallback
          exec(fallbackCmd, { windowsHide: true, timeout: 10000 }, (err2, out2) => {
            cleanup();
            if (!err2 && !(out2 && out2.includes('Unable to initialize'))) {
              resolve({ success: true, message: out2 });
            } else {
              if (err2 && err2.killed) {
                timeoutMsg = ' (Timed out on share fallback)';
              }
              // Collect all error details for a helpful message
              const winspoolErr = out.match(/WINSPOOL_ERR:\s*(.*)/)?.[1] || '';
              const portErr = out.match(/PORT_ERR:\s*(.*)/)?.[1] || '';
              const detail = winspoolErr || portErr || (error && error.message) || stderr || 'Unknown error';
              resolve({
                success: false,
                error: `Could not print to "${printerName}".\n\n${detail}${timeoutMsg}\n\nCheck that the printer is powered on, has labels loaded, and is not in an error/paused state in Windows.`
              });
            }
          });
        });
      });
    } catch (err) {
      console.error('Print Raw Error:', err);
      return { success: false, error: err.message };
    }
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
let dbStatus = { connected: false, error: null };

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    icon: path.join(__dirname, '../build/icon.png'),
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

// IPC handler for DB status (always available, even before login)
ipcMain.handle('get-db-status', () => dbStatus);

app.whenReady().then(async () => {
  registerIPC();

  if (isServerMode) {
    try {
      pool = createPool();
      await pool.query('SELECT 1'); // test connection
      await initDatabase();
      startExpressServer();
      dbStatus = { connected: true, error: null };
    } catch (err) {
      console.error('[DB] Failed to connect to PostgreSQL:', err.message);
      dbStatus = { connected: false, error: err.message };
    }
  } else {
    // Client mode — no local DB needed
    dbStatus = { connected: true, error: null, clientMode: true };
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
