const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const Store = require('electron-store');
const { Pool, types } = require('pg');
// Keep DATE fields (OID 1082) as YYYY-MM-DD strings without converting to UTC Date objects
types.setTypeParser(1082, (val) => val);
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

// Helper: parse payment method string to extract total amount received
function parsePaymentAmount(paymentMethodStr) {
  if (!paymentMethodStr) return 0;
  const parts = paymentMethodStr.split(',');
  let total = 0;
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.lastIndexOf(':');
    if (colonIdx !== -1) {
      const amount = parseFloat(trimmed.substring(colonIdx + 1).trim()) || 0;
      total += amount;
    }
  }
  return total;
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

// Tables that have a serial 'id' primary key
const BACKUP_TABLES = [
  // Auth & config
  'users',
  // Product meta
  'genders', 'categories', 'size_ranges', 'packings', 'brands', 'manufacturers', 'companies',
  'profit_rules', 'overall_profit', 'manufacturer_brands',
  // Products & stock
  'products', 'stock_adjustments',
  // Customers & Suppliers
  'customers', 'suppliers',
  // Chart of Accounts & Vouchers
  'gl_accounts', 'vouchers', 'voucher_details',
  // Expense accounts (must be before purchase_expenses which references it)
  'expense_accounts',
  // Purchases
  'purchases', 'purchase_items', 'purchase_expenses', 'purchase_returns', 'purchase_return_items',
  // Sales
  'sales', 'sale_items', 'sales_returns', 'sales_return_items',
  // Payments
  'supplier_payments',
  // Other
  'cities',
];
// Tables without a serial id column (need separate handling)
const BACKUP_TABLES_NO_ID = ['daily_sessions', 'global_counters'];

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

    let exportData = {};
    const networkMode = store.get('networkMode', 'server');
    if (networkMode === 'client') {
      exportData = await forwardToServer('export-database-dump', {});
    } else {
      for (const t of BACKUP_TABLES) {
        const res = await query(`SELECT * FROM ${t} ORDER BY id`);
        exportData[t] = res.rows;
      }
      for (const t of BACKUP_TABLES_NO_ID) {
        const res = await query(`SELECT * FROM ${t}`);
        exportData[t] = res.rows;
      }
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

async function runRestoreData(parsedData, skipBackup = false) {
  if (isRestoring) return { success: false, error: 'A restore is already in progress.' };
  if (!parsedData) return { success: false, error: 'Invalid or empty backup data provided.' };

  try {
    isRestoring = true;
    let fileData = parsedData.data ? parsedData : { data: parsedData };

    await query('BEGIN');

    // Truncate all tables in reverse dependency order to avoid FK violations
    await query(`TRUNCATE ${BACKUP_TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    for (const t of BACKUP_TABLES_NO_ID) {
      await query(`TRUNCATE ${t}`);
    }

    // Restore all tables with id
    for (const table of BACKUP_TABLES) {
      const rows = fileData.data ? fileData.data[table] : fileData[table];
      if (!rows || rows.length === 0) continue;
      const columns = Object.keys(rows[0]);
      const colNames = columns.map(c => `"${c}"`).join(', ');
      for (const row of rows) {
        const values = columns.map(c => row[c]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        await query(`INSERT INTO "${table}" (${colNames}) VALUES (${placeholders})`, values);
      }
      try {
        await query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1, false)`);
      } catch (e) { /* table may not have a sequence */ }
    }

    // Restore tables without id
    for (const table of BACKUP_TABLES_NO_ID) {
      const rows = fileData.data ? fileData.data[table] : fileData[table];
      if (!rows || rows.length === 0) continue;
      const columns = Object.keys(rows[0]);
      const colNames = columns.map(c => `"${c}"`).join(', ');
      for (const row of rows) {
        const values = columns.map(c => row[c]);
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        await query(`INSERT INTO "${table}" (${colNames}) VALUES (${placeholders})`, values);
      }
    }

    await query('COMMIT');

    for (const ch of ['stock', 'purchases', 'sales', 'purchase-returns', 'sales-returns',
      'customers', 'suppliers', 'gl-accounts', 'vouchers']) {
      broadcast(ch);
    }
    isRestoring = false;

    if (!skipBackup) {
      executeAutoBackup().catch(err => console.error('[AutoBackup After Restore] Error:', err));
    }

    return { success: true, message: 'Database restored successfully!' };
  } catch (err) {
    isRestoring = false;
    try { await query('ROLLBACK'); } catch (_) { }
    console.error('[Restore] Error:', err);
    return { success: false, error: 'Restore failed: ' + err.message };
  }
}

async function runRestore(fileToRestore, skipBackup = false) {
  if (!fs.existsSync(fileToRestore)) return { success: false, error: 'Backup file not found: ' + fileToRestore };
  try {
    const raw = fs.readFileSync(fileToRestore, 'utf-8');
    const parsed = JSON.parse(raw);
    return await runRestoreData(parsed, skipBackup);
  } catch (err) {
    return { success: false, error: 'Invalid backup file format: ' + err.message };
  }
}

// ── Database Schema ──────────────────────────────────────────────────────────
async function initDatabase() {
  await query(`
      CREATE TABLE IF NOT EXISTS daily_sessions (
        date DATE PRIMARY KEY,
        last_id INTEGER NOT NULL DEFAULT 0
      )
    `);

  await query(`
      CREATE TABLE IF NOT EXISTS global_counters (
        name TEXT PRIMARY KEY,
        value INTEGER NOT NULL DEFAULT 0
      )
    `);

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
      customer_prev_balance NUMERIC(15,2) DEFAULT 0,
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

      CREATE TABLE IF NOT EXISTS cities (
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
      ALTER TABLE manufacturer_brands ADD COLUMN IF NOT EXISTS supplier_id INTEGER;

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
      city TEXT DEFAULT '',
      address TEXT DEFAULT '',
      initial_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
      opening_date DATE
    );

    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS city TEXT DEFAULT '';

    CREATE TABLE IF NOT EXISTS supplier_payments (
      id SERIAL PRIMARY KEY,
      supplier_name TEXT NOT NULL,
      payment_date DATE NOT NULL,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      payment_mode TEXT DEFAULT 'Cash',
      notes TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      city TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gl_accounts (
      id SERIAL PRIMARY KEY,
      account_name TEXT UNIQUE NOT NULL,
      account_type TEXT NOT NULL,
      reference_id INTEGER,
      opening_balance NUMERIC(15,2) DEFAULT 0,
      balance_type TEXT DEFAULT 'Dr',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS vouchers (
      id SERIAL PRIMARY KEY,
      voucher_no TEXT UNIQUE NOT NULL,
      voucher_date DATE NOT NULL,
      voucher_type TEXT NOT NULL,
      remarks TEXT DEFAULT '',
      user_id INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS voucher_details (
      id SERIAL PRIMARY KEY,
      voucher_id INTEGER REFERENCES vouchers(id) ON DELETE CASCADE,
      account_id INTEGER REFERENCES gl_accounts(id) ON DELETE RESTRICT,
      description TEXT DEFAULT '',
      reference_no TEXT DEFAULT '',
      debit NUMERIC(15,2) DEFAULT 0,
      credit NUMERIC(15,2) DEFAULT 0
    );
  `);

  // Seed default Pakistan cities list (only runs once, when the table is empty)
  try {
    const cityCountRes = await query('SELECT COUNT(*)::int AS c FROM cities');
    if (cityCountRes.rows[0].c === 0) {
      const DEFAULT_CITIES = [
        "Islamabad", "Lahore", "Karachi", "Faisalabad", "Rawalpindi", "Multan", "Gujranwala",
        "Peshawar", "Quetta", "Sargodha", "Sialkot", "Abbottabad", "Attock", "Badin", "Bagh",
        "Bahawalnagar", "Bahawalpur", "Bannu", "Bhakkar", "Bhalwal", "Burewala", "Chakwal",
        "Chaman", "Charsadda", "Chiniot", "Chishtian", "Chitral", "Dadu", "Daska",
        "Dera Ghazi Khan", "Dera Ismail Khan", "Ghotki", "Gilgit", "Gojra", "Gujar Khan",
        "Gujrat", "Gwadar", "Hafizabad", "Hangu", "Haripur", "Hasilpur", "Hub", "Hunza",
        "Hyderabad", "Jacobabad", "Jalalpur Jattan", "Jampur", "Jamshoro", "Jhang", "Jhelum",
        "Kabal", "Kamalia", "Kamber Ali Khan", "Kamoke", "Kandhkot", "Karak", "Kasur",
        "Khairpur", "Khanewal", "Khanpur", "Khushab", "Khuzdar", "Kohat", "Kot Addu", "Kotli",
        "Larkana", "Layyah", "Lodhran", "Loralai", "Mandi Bahauddin", "Mansehra", "Mardan",
        "Mianwali", "Mingora", "Mirpur (AJK)", "Mirpur Khas", "Muridke", "Murree",
        "Muzaffarabad", "Muzaffargarh", "Nankana Sahib", "Narowal", "Nawabshah", "Nowshera",
        "Okara", "Pakpattan", "Pishin", "Rahim Yar Khan", "Rajanpur", "Rawalakot", "Sadiqabad",
        "Sahiwal", "Sambrial", "Samundri", "Shahdadkot", "Sheikhupura", "Shikarpur", "Sibi",
        "Skardu", "Sukkur", "Swabi", "Swat", "Tando Adam", "Tando Allahyar", "Tank", "Taxila",
        "Toba Tek Singh", "Turbat", "Umerkot", "Vehari", "Wah Cantt", "Wazirabad", "Zhob"
      ];
      for (const cityName of DEFAULT_CITIES) {
        await query('INSERT INTO cities (name) VALUES ($1) ON CONFLICT DO NOTHING', [cityName]);
      }
    }
  } catch (e) {
    console.error('Seed cities error:', e);
  }

  // Auto-migrate unique suppliers from purchases
  await query(`
    INSERT INTO suppliers (name, initial_balance)
    SELECT DISTINCT supplier_name, 0 FROM purchases
    WHERE supplier_name IS NOT NULL AND trim(supplier_name) != ''
    ON CONFLICT (name) DO NOTHING
  `);

  // Ensure freight/expense accounts are also available in GL for voucher entry.
  await query(`
    INSERT INTO gl_accounts (account_name, account_type, opening_balance, balance_type)
    SELECT ea.account_name, 'Expense', 0, 'Cr'
    FROM expense_accounts ea
    LEFT JOIN gl_accounts g ON LOWER(TRIM(g.account_name)) = LOWER(TRIM(ea.account_name))
    WHERE g.id IS NULL
  `);

  // Sync past purchase_expenses records with updated expense account names and ensure expense_account_id is linked
  await query(`
    UPDATE purchase_expenses pe
    SET account_name = ea.account_name,
        expense_account_id = COALESCE(pe.expense_account_id, ea.id)
    FROM expense_accounts ea
    WHERE (pe.expense_account_id = ea.id OR (pe.expense_account_id IS NULL AND LOWER(TRIM(pe.account_name)) = LOWER(TRIM(ea.account_name))))
      AND pe.account_name != ea.account_name
  `);

  // Link any unlinked purchase_expenses that match current expense_accounts by ID
  await query(`
    UPDATE purchase_expenses pe
    SET expense_account_id = ea.id
    FROM expense_accounts ea
    WHERE pe.expense_account_id IS NULL AND LOWER(TRIM(pe.account_name)) = LOWER(TRIM(ea.account_name))
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

  // Purchase Returns migrations
  await query('ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS supplier_inv_no TEXT');
  await query('ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS supplier_date DATE');
  await query('ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS vehicle_no TEXT');
  await query("ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS godown TEXT DEFAULT '1-SHOP'");
  await query('ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS blt_number TEXT');
  await query('ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS freight_account_name TEXT');
  await query('ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS ctn_qty INTEGER DEFAULT 0');
  await query('ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) DEFAULT 0');
  await query('ALTER TABLE purchase_returns ADD COLUMN IF NOT EXISTS misc_charges NUMERIC(10,2) DEFAULT 0');

  await query('ALTER TABLE purchase_return_items ADD COLUMN IF NOT EXISTS packing_qty INTEGER NOT NULL DEFAULT 0');
  await query('ALTER TABLE purchase_return_items ADD COLUMN IF NOT EXISTS pre_disc_price NUMERIC(10,2) DEFAULT 0');
  await query('ALTER TABLE purchase_return_items ADD COLUMN IF NOT EXISTS flat_discount NUMERIC(10,2) DEFAULT 0');
  await query('ALTER TABLE purchase_return_items ADD COLUMN IF NOT EXISTS disc_pct NUMERIC(5,2) DEFAULT 0');
  await query('ALTER TABLE purchase_return_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0');
  await query('ALTER TABLE purchase_return_items ADD COLUMN IF NOT EXISTS net_rate NUMERIC(12,5) DEFAULT 0');
  await query("ALTER TABLE products ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT ''");
  try {
    // Migration: if gender is empty and category has Boy/Girl, move it
    await query("UPDATE products SET gender = category, category = '' WHERE gender = '' AND category IN ('Boy', 'Girl')");

    // Migration: year should be TEXT, not INTEGER (e.g. '2024-25')
    await query("ALTER TABLE products ALTER COLUMN year TYPE TEXT USING year::text");
    await query("ALTER TABLE products ADD COLUMN IF NOT EXISTS note TEXT DEFAULT ''");
    await query("ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT ''");
  } catch (e) {
    console.error('Migration products column error:', e);
  }
  try {
    await query('ALTER TABLE customers ADD COLUMN IF NOT EXISTS initial_balance NUMERIC(15,2) NOT NULL DEFAULT 0');
  } catch (e) {
    console.error('Migration customer initial_balance error:', e);
  }
  await query('ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS packing_qty INTEGER NOT NULL DEFAULT 0');
  await query('ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) DEFAULT 0');
  try {
    await query('ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_prev_balance NUMERIC(15,2) DEFAULT 0');
  } catch (e) {
    console.error('Migration customer_prev_balance error:', e);
  }
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

  // Auto-migrate Suppliers, Customers, and Manufacturers to GL Accounts and Suppliers table
  try {
    await query(`
      INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type)
      SELECT 'Supplier - ' || name, 'Supplier', id, 'Cr' FROM suppliers
      WHERE name IS NOT NULL AND trim(name) != ''
      ON CONFLICT (account_name) DO NOTHING
    `);
    await query(`
      INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type)
      SELECT 'Customer - ' || name, 'Customer', id, 'Dr' FROM customers
      WHERE name IS NOT NULL AND trim(name) != ''
      ON CONFLICT (account_name) DO NOTHING
    `);
    // Migrate manufacturers to both GL accounts and suppliers table
    await query(`
      INSERT INTO suppliers (name, initial_balance)
      SELECT name, 0 FROM manufacturers
      WHERE name IS NOT NULL AND trim(name) != ''
      ON CONFLICT (name) DO NOTHING
    `);
    await query(`
      INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type)
      SELECT 'Supplier - ' || m.name, 'Supplier', s.id, 'Cr' 
      FROM manufacturers m
      JOIN suppliers s ON s.name = m.name
      WHERE m.name IS NOT NULL AND trim(m.name) != ''
      ON CONFLICT (account_name) DO NOTHING
    `);
  } catch (e) { console.error('Migration GL accounts error:', e); }

  console.log('[DB] Schema initialized');
}

// ── Stock calculation helper ──────────────────────────────────────────────────
async function getStock(itemCode) {
  const r = await query(`
    SELECT
      COALESCE((SELECT SUM(pi.packets) FROM purchase_items pi JOIN purchases p ON pi.purchase_id = p.id WHERE pi.item_code=$1),0) -
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
function getLocalDateString(d = new Date()) {
  if (!d) return '';
  if (typeof d === 'string') {
    const trimmed = d.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const year = parsed.getFullYear();
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const day = String(parsed.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return trimmed.slice(0, 10);
  }
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(d).slice(0, 10);
}

function getLocalTimestampString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function normalizeBalanceType(balanceType) {
  const s = String(balanceType || 'Dr').replace(/\./g, '').trim().toUpperCase();
  return s.startsWith('C') ? 'Cr' : 'Dr';
}

function signedOpeningBalance(openingBalance, balanceType) {
  const amt = Math.abs(parseFloat(openingBalance) || 0);
  return normalizeBalanceType(balanceType) === 'Cr' ? amt : -amt;
}

function isBankOrDigitalPayment(fullMethodName, bankNames = []) {
  if (!fullMethodName) return false;
  const m = fullMethodName.trim().toLowerCase();
  if (!m || m.startsWith('credit') || m.startsWith('unpaid') || m.startsWith('return')) return false;

  const keywords = ['jazzcash', 'easypais', 'nayapay', 'sadapay', 'upaisa', 'sadaqat', 'raast', 'transfer', 'bank', 'cheque', 'online', 'card', 'visa', 'mastercard'];
  if (keywords.some(kw => m.includes(kw))) return true;

  const baseMethod = m.split(' (')[0].trim();

  for (const b of bankNames) {
    const cleanB = b.split(' (')[0].trim();
    if (!cleanB) continue;
    if (m === cleanB || baseMethod === cleanB || m.includes(cleanB) || cleanB.includes(baseMethod)) return true;
    const bNoBank = cleanB.replace(/\s+bank$/i, '').trim();
    const baseNoBank = baseMethod.replace(/\s+bank$/i, '').trim();
    if (bNoBank && baseNoBank && (bNoBank === baseNoBank || m.includes(bNoBank) || bNoBank.includes(baseMethod))) {
      return true;
    }
  }

  return false;
}

// ── Central IPC handler (called both locally and via Express proxy) ───────────
async function getBankStatementData({ accountId, accountName, startDate, endDate }) {
  let accountRow;
  if (accountId) {
    accountRow = await query('SELECT * FROM gl_accounts WHERE id = $1', [accountId]);
  } else if (accountName) {
    accountRow = await query('SELECT * FROM gl_accounts WHERE LOWER(TRIM(account_name)) = LOWER(TRIM($1))', [accountName]);
  }

  const account = accountRow?.rows[0];
  if (!account) {
    return { account: null, transactions: [], initial_balance: 0, final_balance: 0, total_debit: 0, total_credit: 0 };
  }

  const initial_balance = parseFloat(account.opening_balance) || 0;
  const balance_type = normalizeBalanceType(account.balance_type);
  const accName = account.account_name || accountName || '';

  const params = [account.id];

  const txnsRes = await query(`
    SELECT v.voucher_date, v.voucher_type, v.voucher_no, v.remarks, vd.description, vd.reference_no, vd.debit, vd.credit,
           COALESCE(v.created_at, v.voucher_date::timestamp) as raw_date, v.id as v_id, vd.id as vd_id,
           (
             SELECT g_offset.account_name 
             FROM voucher_details vd_offset 
             JOIN gl_accounts g_offset ON g_offset.id = vd_offset.account_id 
             WHERE vd_offset.voucher_id = v.id 
               AND vd_offset.account_id != vd.account_id 
             ORDER BY vd_offset.id ASC
             LIMIT 1
           ) as offset_account_name
    FROM voucher_details vd 
    JOIN vouchers v ON vd.voucher_id = v.id 
    WHERE vd.account_id = $1
    ORDER BY v.voucher_date ASC, COALESCE(v.created_at, v.voucher_date::timestamp) ASC, v.id ASC, vd.id ASC
  `, params);

  // Fetch Bank / Cash payments recorded directly in Sales
  let salesDateFilter = '';
  const isCashAccount = account.account_type === 'Cash' || (accountName.toLowerCase().includes('cash') && !accountName.toLowerCase().includes('jazz'));
  const cleanAccName = accountName.replace(/'/g, "''").trim();
  const shortAccName = cleanAccName.replace(/\s+bank$/i, '').trim();

  let searchPattern = '';
  if (isCashAccount) {
    searchPattern = "payment_method ILIKE '%cash%' AND payment_method NOT ILIKE '%jazz%'";
  } else if (shortAccName && shortAccName.toLowerCase() !== cleanAccName.toLowerCase() && shortAccName.length >= 2) {
    searchPattern = `(payment_method ILIKE '%${cleanAccName}%' OR payment_method ILIKE '%${shortAccName}:%' OR payment_method ILIKE '%${shortAccName} (%')`;
  } else {
    searchPattern = `payment_method ILIKE '%${cleanAccName}%'`;
  }
  const salesParams = [];

  const transactions = (txnsRes.rows || []).map(t => {
    const accHeadName = (t.offset_account_name || '').replace(/^(Customer|Supplier) - /i, '').trim();
    const rawUserNotes = (t.remarks || t.description || '').trim();
    const userNotes = (rawUserNotes === 'Header offset' || rawUserNotes === 'CASH PAY' || rawUserNotes === 'Payment received from customer') ? '' : rawUserNotes;

    let remarkText = '';
    if (accHeadName) {
      if (userNotes) {
        remarkText = `${accHeadName} - ${userNotes}`;
      } else {
        remarkText = accHeadName;
      }
    } else {
      remarkText = userNotes || t.voucher_type || '';
    }

    let chequeVal = t.reference_no || '';
    if (!chequeVal && accHeadName) {
      chequeVal = accHeadName;
    }

    return {
      id: t.voucher_no || `txn-${Math.random()}`,
      date: t.voucher_date,
      type: t.voucher_type || 'JV',
      v_code: t.voucher_no || '',
      remarks: remarkText,
      cheque_no: chequeVal,
      debit: parseFloat(t.debit) || 0,
      credit: parseFloat(t.credit) || 0,
      raw_date: t.raw_date,
      sort_id: (parseInt(t.v_id) || 0) * 1000 + (parseInt(t.vd_id) || 0)
    };
  });

  const salesRes = await query(`
    SELECT sale_date, invoice_no, payment_method, notes, customer_name, total_amount, created_at, id
    FROM sales
    WHERE ${searchPattern}${salesDateFilter}
    ORDER BY sale_date ASC, created_at ASC, id ASC
  `, salesParams);

  // Append sale payments
  salesRes.rows.forEach(s => {
    if (!s.payment_method) return;
    const parts = s.payment_method.split(',');
    parts.forEach(part => {
      const partTrimmed = part.trim();
      if (!partTrimmed) return;
      const partLower = partTrimmed.toLowerCase();
      const accLower = accountName.toLowerCase();
      let isMatch = false;
      // If the full payment_method or part is 'Credit', or starts with 'credit', ignore it
      const fullLower = (s.payment_method || '').toLowerCase().trim();
      const isFullCredit = fullLower === 'credit' || fullLower === 'credit invoice' || fullLower.startsWith('credit:');

      if (!isFullCredit && !partLower.startsWith('credit') && !partLower.includes('credit:')) {
        if (partLower.includes(accLower)) {
          isMatch = true;
        } else if (isCashAccount) {
          // For cash accounts, match if the payment method is the account name itself or is a generic cash term
          // This handles both specific cash account names (e.g., "Main Cash: 5000") and generic terms (e.g., "Cash Received: 5000")
          const methodPart = partTrimmed.split(':')[0].trim().toLowerCase();
          const isGenericCashTerm = methodPart === 'cash' || methodPart === 'cash received' || methodPart === 'cash pay' || methodPart.startsWith('cash ');
          if (methodPart === accLower || (isGenericCashTerm && !partLower.includes('jazz'))) {
            isMatch = true;
          }
        }
      }

      if (isMatch) {
        const colonIdx = partTrimmed.lastIndexOf(':');
        let amt = 0;
        if (colonIdx !== -1) {
          amt = parseFloat(partTrimmed.slice(colonIdx + 1).trim()) || 0;
        } else {
          // Fallback to total_amount ONLY if there is no customer_name (counter customer) and payment_method is not credit.
          // Invoices for named customers with plain 'Cash' or 'Cash Received' without a colon amount were saved as credit/unpaid.
          if (!fullLower.includes('credit') && !s.customer_name) {
            amt = parseFloat(s.total_amount) || 0;
          }
        }

        if (amt > 0) {
          transactions.push({
            id: `sale-pay-${s.invoice_no}-${Math.random()}`,
            date: s.sale_date,
            type: 'SV',
            v_code: s.invoice_no || '',
            remarks: `Sale Payment: ${s.customer_name || 'Counter Customer'} (Inv #${s.invoice_no || ''})`,
            cheque_no: '',
            debit: amt,
            credit: 0,
            raw_date: s.created_at || s.sale_date,
            sort_id: parseInt(s.id) || 0
          });
        }
      }
    });
  });

  // Check if account is a Freight Account (in expense_accounts table or type Freight)
  const eaCheckStmt = await query(`SELECT 1 FROM expense_accounts WHERE LOWER(TRIM(account_name)) = LOWER(TRIM($1)) LIMIT 1`, [accName]);
  const isFreightAccStmt = (eaCheckStmt.rows && eaCheckStmt.rows.length > 0) || account.account_type === 'Freight';

  // Fetch Purchase Expenses for Expense / Freight accounts
  const isExpenseType = account.account_type === 'Expense' || account.account_type === 'Freight' || account.account_type === 'expense account';
  if (isExpenseType) {
    const peParams = [accName];

    const peRes = await query(`
      SELECT pe.id, pe.cartons, pe.rate, pe.amount, pe.remarks, p.purchase_date, p.invoice_no, p.supplier_name, p.created_at
      FROM purchase_expenses pe
      JOIN purchases p ON p.id = pe.purchase_id
      WHERE LOWER(TRIM(pe.account_name)) = LOWER(TRIM($1)) AND pe.amount > 0
      ORDER BY COALESCE(p.purchase_date, p.created_at::date) ASC, p.id ASC
    `, peParams);

    peRes.rows.forEach(pe => {
      const remarksText = pe.remarks ? pe.remarks : (pe.rate > 0 ? `FREIGHT CTN EXP ${pe.rate}/= Payable` : 'FREIGHT CTN EXP Payable');
      transactions.push({
        id: `pe-${pe.id}`,
        date: pe.purchase_date || pe.created_at,
        type: 'PV-' + (pe.invoice_no || pe.id),
        v_code: pe.invoice_no || String(pe.id),
        remarks: `${remarksText} (Supplier: ${pe.supplier_name || '—'})`,
        cheque_no: pe.cartons ? `${pe.cartons} Ctns` : '',
        debit: isFreightAccStmt ? 0 : (parseFloat(pe.amount) || 0),
        credit: isFreightAccStmt ? (parseFloat(pe.amount) || 0) : 0,
        raw_date: pe.created_at || pe.purchase_date,
        sort_id: parseInt(pe.id) || 0
      });
    });
  }

  // Sort transactions chronologically by created_at timestamp and sort_id
  transactions.sort((a, b) => {
    const timeA = a.raw_date ? new Date(a.raw_date).getTime() : new Date(a.date).getTime();
    const timeB = b.raw_date ? new Date(b.raw_date).getTime() : new Date(b.date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return (a.sort_id || 0) - (b.sort_id || 0);
  });

  let runningBalance = initial_balance;
  let startBal = initial_balance;
  let totalDebit = 0;
  let totalCredit = 0;
  const filteredTxns = [];

  transactions.forEach(t => {
    if (balance_type === 'Dr') {
      runningBalance += t.debit - t.credit;
    } else {
      runningBalance += t.credit - t.debit;
    }
    t.balance = Math.abs(runningBalance);
    t.balance_type = runningBalance >= 0 ? balance_type : (balance_type === 'Dr' ? 'Cr' : 'Dr');
    
    const dStr = t.date;
    if (startDate && dStr < startDate) {
      startBal = runningBalance;
    } else if (!endDate || dStr <= endDate) {
      totalDebit += t.debit;
      totalCredit += t.credit;
      filteredTxns.push(t);
    }
  });

  const finalBalance = runningBalance;
  const finalBalanceType = finalBalance >= 0 ? balance_type : (balance_type === 'Dr' ? 'Cr' : 'Dr');
  const startBalType = startBal >= 0 ? balance_type : (balance_type === 'Dr' ? 'Cr' : 'Dr');

  return {
    account,
    initial_balance: Math.abs(startBal),
    initial_balance_type: startBalType,
    transactions: filteredTxns,
    total_debit: totalDebit,
    total_credit: totalCredit,
    final_balance: Math.abs(finalBalance),
    final_balance_type: finalBalanceType
  };
}

async function getCustomerStatementData({ customerName, customerId, startDate, endDate }) {
  let custRow;
  if (customerId) {
    custRow = await query('SELECT * FROM customers WHERE id = $1', [customerId]);
  } else if (customerName) {
    custRow = await query('SELECT * FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [customerName]);
  }

  const cust = custRow?.rows[0];
  const name = cust?.name || customerName || '';
  const initial_balance = parseFloat(cust?.initial_balance) || 0;

  if (!name && !customerId) {
    return { customer: null, transactions: [], initial_balance: 0, final_balance: 0, signed_balance: 0 };
  }

  const cleanDateStr = (raw) => {
    if (!raw) return '';
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      if (trimmed.includes('T') || trimmed.includes(' ')) {
        const d = new Date(trimmed);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        }
      }
      return trimmed.slice(0, 10);
    }
    if (raw instanceof Date) {
      if (isNaN(raw.getTime())) return '';
      const year = raw.getFullYear();
      const month = String(raw.getMonth() + 1).padStart(2, '0');
      const day = String(raw.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return String(raw).slice(0, 10);
  };

  // Fetch Sales
  const salesRes = await query(`
    SELECT id, invoice_no, sale_date, created_at, total_amount, discount, misc_charges, payment_method, notes
    FROM sales
    WHERE (LOWER(TRIM(customer_name)) = LOWER(TRIM($1)) OR (customer_id IS NOT NULL AND customer_id = $2))
    ORDER BY sale_date ASC, created_at ASC
  `, [name, cust?.id || 0]);

  // Fetch Sales Returns
  const returnsRes = await query(`
    SELECT id, return_no, return_date, created_at, total_amount, notes
    FROM sales_returns
    WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM($1))
    ORDER BY return_date ASC, created_at ASC
  `, [name]);

  // Fetch Manual Vouchers for Customer GL account
  console.log('[STMT] Fetching statement for customer:', name, 'cust.id:', cust?.id);
  const vouchersRes = await query(`
    SELECT v.id, v.voucher_no, v.voucher_date, v.voucher_type, v.remarks, vd.description, vd.reference_no, vd.debit, vd.credit, v.created_at,
           (
             SELECT g_offset.account_name 
             FROM voucher_details vd_offset 
             JOIN gl_accounts g_offset ON g_offset.id = vd_offset.account_id 
             WHERE vd_offset.voucher_id = v.id 
               AND vd_offset.account_id != vd.account_id 
             ORDER BY vd_offset.id ASC
             LIMIT 1
           ) as bank_account_name
    FROM voucher_details vd
    JOIN vouchers v ON vd.voucher_id = v.id
    JOIN gl_accounts g ON g.id = vd.account_id
    WHERE (LOWER(TRIM(g.account_name)) = LOWER(TRIM($1)) OR (g.account_type = 'Customer' AND g.reference_id = $2))
    ORDER BY v.voucher_date ASC, v.created_at ASC
  `, ['Customer - ' + name, cust?.id || 0]);

  console.log('[STMT] Vouchers found count:', vouchersRes.rows.length);

  let seqCounter = 0;
  const txns = [];

  for (const s of salesRes.rows) {
    const invTotal = parseFloat(s.total_amount) || 0;
    const invDateStr = cleanDateStr(s.sale_date || s.created_at);
    const rawDate = s.created_at || s.sale_date;

    // Calculate payment total for this sale
    let totalPaidOnSale = 0;
    if (s.payment_method) {
      const parts = s.payment_method.split(',');
      for (const part of parts) {
        const colonIdx = part.lastIndexOf(':');
        if (colonIdx !== -1) {
          totalPaidOnSale += parseFloat(part.slice(colonIdx + 1).trim()) || 0;
        }
      }
    }

    // Customer ledger should never show more credit than the invoice itself.
    // Any amount received above the invoice total is treated as counter cash,
    // not as an advance on the customer's account.
    let remainingCustomerCredit = invTotal > 0 ? invTotal : 0;

    if (invTotal < 0) {
      // 1. Sale Return / Refund Invoice (Credit Entry to Customer)
      const absTotal = Math.abs(invTotal);
      const retRemarks = s.notes ? `Sale Return Invoice - ${s.notes}` : `Sale Return Invoice`;
      txns.push({
        id: `sale-inv-${s.id}`,
        date: invDateStr,
        type: `SV-${s.invoice_no || s.id}`,
        v_code: s.invoice_no || String(s.id),
        remarks: retRemarks,
        cheque_no: 'Return Refund',
        debit: 0,
        credit: absTotal,
        raw_date: rawDate,
        seq: ++seqCounter
      });
    } else {
      const isCreditSale = totalPaidOnSale === 0 || (s.payment_method && s.payment_method.toLowerCase().includes('credit'));
      const isPartialSale = totalPaidOnSale > 0 && totalPaidOnSale < invTotal;

      let defaultRemark = 'Sale Invoice';
      if (isCreditSale) {
        defaultRemark = 'Credit Sale Invoice (Unpaid)';
      } else if (isPartialSale) {
        defaultRemark = 'Credit Sale Invoice (Partially Paid)';
      }

      const invRemarks = s.notes ? `${defaultRemark} - ${s.notes}` : defaultRemark;

      // 1. Invoice Debit Entry
      txns.push({
        id: `sale-inv-${s.id}`,
        date: invDateStr,
        type: `SV-${s.invoice_no || s.id}`,
        v_code: s.invoice_no || String(s.id),
        remarks: invRemarks,
        cheque_no: isCreditSale ? 'Credit Sale' : '',
        debit: invTotal,
        credit: 0,
        raw_date: rawDate,
        seq: ++seqCounter
      });

      // 2. Immediate Payments on Sale (Credit entries) — show full typed amount, no cap
      if (s.payment_method) {
        const parts = s.payment_method.split(',');
        for (const part of parts) {
          const colonIdx = part.lastIndexOf(':');
          if (colonIdx === -1) continue;
          const fullMethod = part.slice(0, colonIdx).trim();
          const amt = parseFloat(part.slice(colonIdx + 1).trim()) || 0;
          if (amt <= 0) continue;
          // Skip credit entries
          if (fullMethod.toLowerCase().startsWith('credit')) continue;

          const methodLower = fullMethod.trim().toLowerCase();
          const isCashPayment = methodLower === 'cash' || methodLower === 'cash received' || methodLower === 'cash pay' || methodLower.startsWith('cash ');

          let remarkStr = isCashPayment
            ? `Cash Received on Sale Inv. No.${s.invoice_no || s.id}`
            : `Bank Received on Sale Inv. No.${s.invoice_no || s.id} (${fullMethod})`;

          let chqStr = isCashPayment ? 'Cash Received' : fullMethod;
          if (fullMethod.includes('(')) {
            const pIdx = fullMethod.indexOf('(');
            chqStr = fullMethod.substring(pIdx + 1, fullMethod.length - 1).trim();
          }

          txns.push({
            id: `sale-pay-${s.id}-${fullMethod}`,
            date: invDateStr,
            type: `SV-${s.invoice_no || s.id}`,
            v_code: s.invoice_no || String(s.id),
            remarks: remarkStr,
            cheque_no: chqStr,
            debit: 0,
            credit: amt,   // full typed amount — no cap at invoice total
            raw_date: rawDate,
            seq: ++seqCounter
          });
        }
      }
    }
  }

  for (const r of returnsRes.rows) {
    const retDateStr = cleanDateStr(r.return_date || r.created_at);
    txns.push({
      id: `ret-${r.id}`,
      date: retDateStr,
      type: `SR-${r.return_no || r.id}`,
      v_code: r.return_no || String(r.id),
      remarks: r.notes || 'RETURN',
      cheque_no: '',
      debit: 0,
      credit: parseFloat(r.total_amount) || 0,
      raw_date: r.created_at || r.return_date,
      seq: ++seqCounter
    });
  }

  for (const v of vouchersRes.rows) {
    const vDateStr = cleanDateStr(v.voucher_date || v.created_at);
    let typeCode = v.voucher_type;
    if (typeCode === 'Cash Receipt') typeCode = 'CR';
    else if (typeCode === 'Cash Payment') typeCode = 'CP';
    else if (typeCode === 'Bank Receipt') typeCode = 'BR';
    else if (typeCode === 'Bank Payment') typeCode = 'BP';
    else if (typeCode === 'Journal') typeCode = 'JV';

    const accHeadName = (v.bank_account_name || '').replace(/^(Customer|Supplier) - /i, '').trim();
    const rawUserNotes = (v.remarks || v.description || '').trim();
    const userNotes = (rawUserNotes === 'Header offset' || rawUserNotes === 'CASH PAY' || rawUserNotes === 'Payment received from customer') ? '' : rawUserNotes;

    let remarkText = '';
    if (accHeadName) {
      if (userNotes) {
        remarkText = `${accHeadName} - ${userNotes}`;
      } else {
        remarkText = accHeadName;
      }
    } else {
      remarkText = userNotes || (typeCode === 'BP' ? 'Bank Payment' : typeCode === 'BR' ? 'Bank Receipt' : typeCode === 'CP' ? 'Cash Payment' : typeCode === 'CR' ? 'Cash Receipt' : 'Journal Entry');
    }

    let chequeVal = v.reference_no || '';
    if (!chequeVal) {
      if (typeCode === 'CP' || typeCode === 'CR') {
        chequeVal = 'Cash Received';
      } else if (accHeadName) {
        chequeVal = accHeadName;
      }
    }

    console.log('[STMT Voucher Processing]', {
      voucher_id: v.id,
      voucher_no: v.voucher_no,
      voucher_type: v.voucher_type,
      v_remarks: v.remarks,
      vd_description: v.description,
      bank_account_name: v.bank_account_name,
      accHeadName,
      computedRemark: remarkText
    });

    txns.push({
      id: `vouch-${v.id}`,
      date: vDateStr,
      type: `${typeCode}-${v.voucher_no || v.id}`,
      v_code: v.voucher_no || String(v.id),
      remarks: remarkText,
      cheque_no: chequeVal,
      debit: parseFloat(v.debit) || 0,
      credit: parseFloat(v.credit) || 0,
      raw_date: v.created_at || v.voucher_date,
      seq: ++seqCounter
    });
  }

  // Sort all transactions chronologically by created_at timestamp and sequence
  txns.sort((a, b) => {
    const timeA = new Date(a.raw_date).getTime();
    const timeB = new Date(b.raw_date).getTime();
    if (timeA !== timeB) return timeA - timeB;
    return a.seq - b.seq;
  });

  // Compute running balance & filter by date range
  let currentBal = initial_balance;
  let startBal = initial_balance;
  const filteredTxns = [];

  for (const t of txns) {
    const dStr = t.date;
    if (startDate && dStr < startDate) {
      startBal += (t.debit - t.credit);
      currentBal += (t.debit - t.credit);
    } else if (!endDate || dStr <= endDate) {
      currentBal += (t.debit - t.credit);
      filteredTxns.push({
        ...t,
        balance: Math.abs(currentBal),
        balance_type: currentBal >= 0 ? 'Dr' : 'Cr'
      });
    }
  }

  return {
    customer: cust || { name, phone: '', city: '', address: '' },
    initial_balance: startBal,
    initial_balance_type: startBal >= 0 ? 'Dr' : 'Cr',
    transactions: filteredTxns,
    total_debit: filteredTxns.reduce((s, t) => s + t.debit, 0),
    total_credit: filteredTxns.reduce((s, t) => s + t.credit, 0),
    final_balance: Math.abs(currentBal),
    final_balance_type: currentBal >= 0 ? 'Dr' : 'Cr',
    signed_balance: currentBal
  };
}

async function getAccountClosingBalance({ accountId }) {
  try {
    if (!accountId) return { signed_balance: 0, closing_balance: 0, balance_type: 'Dr', account_name: '' };

    const accRow = await query('SELECT * FROM gl_accounts WHERE id = $1', [accountId]);
    const acc = accRow?.rows[0];
    if (!acc) return { signed_balance: 0, closing_balance: 0, balance_type: 'Dr', account_name: '', error: `gl_account id=${accountId} not found` };

    const account_name = acc.account_name;
    const account_type = (acc.account_type || '').trim();
    const atype = account_type.toLowerCase();
    const opening_balance = parseFloat(acc.opening_balance) || 0;
    const balance_type = normalizeBalanceType(acc.balance_type);

    let totalDebit = 0;
    let totalCredit = 0;

    if (atype === 'customer') {
      let customerName = null;
      let customerId = acc.reference_id || 0;
      if (customerId && customerId > 0) {
        const c = await query('SELECT name, initial_balance FROM customers WHERE id = $1', [customerId]);
        if (c.rows && c.rows.length > 0) {
          customerName = c.rows[0].name;
          const custInitBal = parseFloat(c.rows[0].initial_balance) || 0;
          const salesRows = await query(
            `SELECT total_amount, payment_method FROM sales WHERE (LOWER(TRIM(customer_name)) = LOWER(TRIM($1)) OR customer_id = $2)`,
            [customerName, customerId]
          );
          let saleTotal = 0, salePaid = 0;
          salesRows.rows.forEach(s => {
            const invTotal = parseFloat(s.total_amount) || 0;
            if (invTotal === 0) return;
            let paid = 0;
            if (s.payment_method) {
              s.payment_method.split(',').forEach(part => {
                const colonIdx = part.lastIndexOf(':');
                if (colonIdx !== -1) paid += parseFloat(part.slice(colonIdx + 1).trim()) || 0;
              });
            }
            if (invTotal > 0) {
              paid = Math.min(paid, invTotal);
              saleTotal += invTotal;
              salePaid += paid;
            } else {
              salePaid += Math.abs(invTotal);
            }
          });
          const retSum = await query(
            `SELECT COALESCE(SUM(total_amount),0) as s FROM sales_returns WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM($1))`,
            [customerName]
          );
          const vouchSum = await query(
            `SELECT COALESCE(SUM(vd.debit),0) as td, COALESCE(SUM(vd.credit),0) as tc FROM voucher_details vd JOIN vouchers v ON vd.voucher_id = v.id JOIN gl_accounts g ON g.id = vd.account_id WHERE (LOWER(TRIM(g.account_name)) = LOWER(TRIM($1)) OR (g.account_type = 'Customer' AND g.reference_id = $2))`,
            ['Customer - ' + customerName, customerId]
          );
          totalDebit = saleTotal + parseFloat(vouchSum.rows[0].td);
          totalCredit = salePaid + parseFloat(retSum.rows[0].s) + parseFloat(vouchSum.rows[0].tc);
          let running = custInitBal + totalDebit - totalCredit;
          const finalType = running >= 0 ? 'Dr' : 'Cr';
          return {
            signed_balance: running,
            closing_balance: Math.abs(running),
            balance_type: finalType,
            account_name
          };
        }
      }

      customerName = account_name.replace(/^Customer\s*-\s*/i, '');
      if (customerName) {
        const custRow = await query('SELECT id, initial_balance FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [customerName]);
        const custId = custRow.rows[0]?.id || 0;
        const custInitBal = parseFloat(custRow.rows[0]?.initial_balance) || 0;
        const salesRows = await query(
          `SELECT total_amount, payment_method FROM sales WHERE (LOWER(TRIM(customer_name)) = LOWER(TRIM($1)) OR ($2 > 0 AND customer_id = $2))`,
          [customerName, custId]
        );
        let saleTotal = 0, salePaid = 0;
        salesRows.rows.forEach(s => {
          saleTotal += parseFloat(s.total_amount) || 0;
          if (s.payment_method) {
            s.payment_method.split(',').forEach(part => {
              const colonIdx = part.lastIndexOf(':');
              if (colonIdx !== -1) salePaid += parseFloat(part.slice(colonIdx + 1).trim()) || 0;
            });
          }
        });
        const retSum = await query(
          `SELECT COALESCE(SUM(total_amount),0) as s FROM sales_returns WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM($1))`,
          [customerName]
        );
        const vouchSum = await query(
          `SELECT COALESCE(SUM(vd.debit),0) as td, COALESCE(SUM(vd.credit),0) as tc FROM voucher_details vd JOIN vouchers v ON vd.voucher_id = v.id JOIN gl_accounts g ON g.id = vd.account_id WHERE (LOWER(TRIM(g.account_name)) = LOWER(TRIM($1)) OR ($2 > 0 AND g.account_type = 'Customer' AND g.reference_id = $2))`,
          ['Customer - ' + customerName, custId]
        );
        totalDebit = saleTotal + parseFloat(vouchSum.rows[0].td);
        totalCredit = salePaid + parseFloat(retSum.rows[0].s) + parseFloat(vouchSum.rows[0].tc);
        let running = custInitBal + totalDebit - totalCredit;
        const finalType = running >= 0 ? 'Dr' : 'Cr';
        return {
          signed_balance: running,
          closing_balance: Math.abs(running),
          balance_type: finalType,
          account_name
        };
      }
    }

    if (atype === 'supplier' || atype === 'accounts payable' || atype === 'vendor' || account_name.toLowerCase().startsWith('supplier -')) {
      let supplierName = null;
      let supplierId = acc.reference_id || 0;
      if (supplierId && supplierId > 0) {
        const s = await query('SELECT name, initial_balance FROM suppliers WHERE id = $1', [supplierId]);
        if (s.rows && s.rows.length > 0) {
          supplierName = s.rows[0].name;
          const suppInitBal = parseFloat(s.rows[0].initial_balance) || 0;
          const purSum = await query(`SELECT COALESCE(SUM(total_amount),0) as s FROM purchases WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($1)) AND is_posted = 1`, [supplierName]);
          const prSum = await query(`SELECT COALESCE(SUM(total_amount),0) as s FROM purchase_returns WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($1)) AND is_posted = 1`, [supplierName]);
          const paySum = await query(`SELECT COALESCE(SUM(amount),0) as s FROM supplier_payments WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($1))`, [supplierName]);
          const vouchSum = await query(
            `SELECT COALESCE(SUM(vd.debit),0) as td, COALESCE(SUM(vd.credit),0) as tc FROM voucher_details vd JOIN vouchers v ON vd.voucher_id = v.id JOIN gl_accounts g ON g.id = vd.account_id WHERE (LOWER(TRIM(replace(g.account_name, 'Supplier - ', ''))) = LOWER(TRIM($1)) OR (g.account_type = 'Supplier' AND g.reference_id = $2))`,
            [supplierName, supplierId]
          );
          totalCredit = parseFloat(purSum.rows[0].s) + parseFloat(vouchSum.rows[0].tc);
          totalDebit = parseFloat(prSum.rows[0].s) + parseFloat(paySum.rows[0].s) + parseFloat(vouchSum.rows[0].td);
          let running = suppInitBal + totalCredit - totalDebit;
          const finalType = running >= 0 ? 'Cr' : 'Dr';
          return {
            signed_balance: -running,
            closing_balance: Math.abs(running),
            balance_type: finalType,
            account_name
          };
        }
      }
      supplierName = account_name.replace(/^Supplier\s*-\s*/i, '').trim();
      if (supplierName) {
        const suppRow = await query('SELECT id, initial_balance FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [supplierName]);
        const suppId = suppRow.rows[0]?.id || 0;
        const suppInitBal = parseFloat(suppRow.rows[0]?.initial_balance) || 0;
        const purSum = await query(`SELECT COALESCE(SUM(total_amount),0) as s FROM purchases WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($1)) AND is_posted = 1`, [supplierName]);
        const prSum = await query(`SELECT COALESCE(SUM(total_amount),0) as s FROM purchase_returns WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($1)) AND is_posted = 1`, [supplierName]);
        const paySum = await query(`SELECT COALESCE(SUM(amount),0) as s FROM supplier_payments WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($1))`, [supplierName]);
        const vouchSum = await query(
          `SELECT COALESCE(SUM(vd.debit),0) as td, COALESCE(SUM(vd.credit),0) as tc FROM voucher_details vd JOIN vouchers v ON vd.voucher_id = v.id JOIN gl_accounts g ON g.id = vd.account_id WHERE (LOWER(TRIM(replace(g.account_name, 'Supplier - ', ''))) = LOWER(TRIM($1)) OR ($2 > 0 AND g.account_type = 'Supplier' AND g.reference_id = $2))`,
          [supplierName, suppId]
        );
        totalCredit = parseFloat(purSum.rows[0].s) + parseFloat(vouchSum.rows[0].tc);
        totalDebit = parseFloat(prSum.rows[0].s) + parseFloat(paySum.rows[0].s) + parseFloat(vouchSum.rows[0].td);
        let running = suppInitBal + totalCredit - totalDebit;
        const finalType = running >= 0 ? 'Cr' : 'Dr';
        return {
          signed_balance: -running,
          closing_balance: Math.abs(running),
          balance_type: finalType,
          account_name
        };
      }
    }

    const vouchSum = await query(
      `SELECT COALESCE(SUM(vd.debit),0) as td, COALESCE(SUM(vd.credit),0) as tc FROM voucher_details vd JOIN vouchers v ON vd.voucher_id = v.id WHERE vd.account_id = $1`,
      [acc.id]
    );
    totalDebit = parseFloat(vouchSum.rows[0].td);
    totalCredit = parseFloat(vouchSum.rows[0].tc);

    // Check if account is a Freight Account (created on Freight Expense page or type Freight)
    const eaCheck = await query(`SELECT 1 FROM expense_accounts WHERE LOWER(TRIM(account_name)) = LOWER(TRIM($1)) LIMIT 1`, [account_name]);
    const isFreightAcc = (eaCheck.rows && eaCheck.rows.length > 0) || atype === 'freight';

    if (isFreightAcc) {
      // Freight Carrier Account (Payable): Purchase expenses increase Credit (freight payable)
      const peSum = await query(
        `SELECT COALESCE(SUM(amount), 0) as s FROM purchase_expenses WHERE LOWER(TRIM(account_name)) = LOWER(TRIM($1))`,
        [account_name]
      );
      totalCredit += parseFloat(peSum.rows[0].s) || 0;
    } else if (atype === 'expense' || atype === 'expense account') {
      // Operating Expense Account: Direct expenses increase Debit
      const peSum = await query(
        `SELECT COALESCE(SUM(amount), 0) as s FROM purchase_expenses WHERE LOWER(TRIM(account_name)) = LOWER(TRIM($1))`,
        [account_name]
      );
      totalDebit += parseFloat(peSum.rows[0].s) || 0;
    }

    if (atype === 'bank' || atype === 'cash') {
      const isCashAccount = atype === 'cash' || (account_name.toLowerCase().includes('cash') && !account_name.toLowerCase().includes('jazz'));
      const cleanAccName = account_name.replace(/'/g, "''").trim();
      const shortAccName = cleanAccName.replace(/\s+bank$/i, '').trim();

      let searchPattern = '';
      if (isCashAccount) {
        searchPattern = "payment_method ILIKE '%cash%' AND payment_method NOT ILIKE '%jazz%'";
      } else if (shortAccName && shortAccName.toLowerCase() !== cleanAccName.toLowerCase() && shortAccName.length >= 2) {
        searchPattern = `(payment_method ILIKE '%${cleanAccName}%' OR payment_method ILIKE '%${shortAccName}:%' OR payment_method ILIKE '%${shortAccName} (%')`;
      } else {
        searchPattern = `payment_method ILIKE '%${cleanAccName}%'`;
      }

      const salesRes = await query(`SELECT payment_method, total_amount, customer_name FROM sales WHERE ${searchPattern}`);
      let saleDeposit = 0;
      salesRes.rows.forEach(s => {
        if (!s.payment_method) return;
        const parts = s.payment_method.split(',');
        parts.forEach(part => {
          const partTrimmed = part.trim();
          if (!partTrimmed) return;
          const partLower = partTrimmed.toLowerCase();
          const accLower = account_name.toLowerCase();
          let isMatch = false;
          const fullLower = (s.payment_method || '').toLowerCase().trim();
          const isFullCredit = fullLower === 'credit' || fullLower === 'credit invoice' || fullLower.startsWith('credit:');

          if (!isFullCredit && !partLower.startsWith('credit') && !partLower.includes('credit:')) {
            if (partLower.includes(accLower)) {
              isMatch = true;
            } else if (isCashAccount) {
              const methodPart = partTrimmed.split(':')[0].trim().toLowerCase();
              const isGenericCashTerm = methodPart === 'cash' || methodPart === 'cash received' || methodPart === 'cash pay' || methodPart.startsWith('cash ');
              if (methodPart === accLower || (isGenericCashTerm && !partLower.includes('jazz'))) {
                isMatch = true;
              }
            }
          }

          if (isMatch) {
            const colonIdx = partTrimmed.lastIndexOf(':');
            let amt = 0;
            if (colonIdx !== -1) {
              amt = parseFloat(partTrimmed.slice(colonIdx + 1).trim()) || 0;
            } else {
              if (!fullLower.includes('credit') && !s.customer_name) {
                amt = parseFloat(s.total_amount) || 0;
              }
            }
            if (amt > 0) {
              saleDeposit += amt;
            }
          }
        });
      });
      totalDebit += saleDeposit;
    }

    let running;
    if (balance_type === 'Cr') {
      running = opening_balance + totalCredit - totalDebit;
    } else {
      running = opening_balance + totalDebit - totalCredit;
    }
    const defaultType = balance_type;
    const oppositeType = defaultType === 'Cr' ? 'Dr' : 'Cr';
    const finalType = running >= 0 ? defaultType : oppositeType;

    return {
      signed_balance: finalType === 'Dr' ? Math.abs(running) : -Math.abs(running),
      closing_balance: Math.abs(running),
      balance_type: finalType,
      account_name
    };
  } catch (e) {
    console.error('getAccountClosingBalance ERROR for accountId=' + accountId, e);
    return { error: e.message || String(e), signed_balance: 0, closing_balance: 0, balance_type: 'Dr', account_name: '' };
  }
}

async function handleIPC(channel, ...args) {
  const data = args[0];

  switch (channel) {
    // ─── AUTH ─────────────────────────────────────────────────────────────────
    case 'get-genders': { const r = await query('SELECT * FROM genders ORDER BY name'); return r.rows; }
    case 'add-gender': { await query('INSERT INTO genders (name) VALUES ($1) ON CONFLICT DO NOTHING', [data]); broadcast('genders'); return { success: true }; }
    case 'update-gender': { await query('UPDATE genders SET name=$1 WHERE id=$2', [data.name, data.id]); broadcast('genders'); return { success: true }; }
    case 'delete-gender': { await query('DELETE FROM genders WHERE id=$1', [data]); broadcast('genders'); return { success: true }; }

    case 'get-customers': {
      const { searchTerm } = data || {};
      let q = 'SELECT * FROM customers WHERE 1=1';
      const params = [];
      if (searchTerm) {
        params.push(`%${searchTerm}%`);
        q += ` AND (name ILIKE $1 OR phone ILIKE $1 OR city ILIKE $1)`;
      }
      q += ' ORDER BY id DESC LIMIT 50';
      const r = await query(q, params);
      return r.rows;
    }
    case 'get-customer-balance': {
      const { customerName, customerId } = data || {};
      if (!customerName && !customerId) return { balance: 0 };

      try {
        const stmt = await getCustomerStatementData({ customerName, customerId });
        return { balance: stmt?.signed_balance || 0 };
      } catch (err) {
        console.error('Error fetching customer balance:', err);
        return { balance: 0, error: err.message };
      }
    }
    case 'add-customer': {
      const { name, phone, city, initial_balance } = data;
      const initBal = parseFloat(initial_balance) || 0;
      const rr = await query('INSERT INTO customers (name, phone, city, initial_balance) VALUES ($1, $2, $3, $4) RETURNING id', [name, phone, city, initBal]);
      const cId = rr.rows[0].id;
      await query(`INSERT INTO gl_accounts (account_name, account_type, reference_id, opening_balance, balance_type) VALUES ($1, 'Customer', $2, $3, 'Dr') ON CONFLICT (account_name) DO NOTHING`, ['Customer - ' + name, cId, Math.abs(initBal)]);
      broadcast('customers');
      return { success: true, id: cId };
    }
    case 'update-customer': {
      const { id, name, phone, city, initial_balance } = data;
      const initBal = parseFloat(initial_balance) || 0;
      await query('UPDATE customers SET name=$1, phone=$2, city=$3, initial_balance=$4 WHERE id=$5', [name, phone, city, initBal, id]);
      await query(`UPDATE gl_accounts SET account_name = $1, opening_balance = $2 WHERE account_type = 'Customer' AND reference_id = $3`, ['Customer - ' + name, Math.abs(initBal), id]);
      broadcast('customers');
      return { success: true };
    }
    case 'update-customer-balance': {
      const { id, initial_balance } = data;
      const initBal = parseFloat(initial_balance) || 0;
      await query('UPDATE customers SET initial_balance = $1 WHERE id = $2', [initBal, id]);
      await query('UPDATE gl_accounts SET opening_balance = $1 WHERE account_type = \'Customer\' AND reference_id = $2', [Math.abs(initBal), id]);
      broadcast('customers');
      return { success: true };
    }

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
    case 'update-brand': {
      try {
        const { id, name } = data;
        const newName = (name || '').trim();
        if (!newName) return { success: false, error: 'Brand name cannot be empty' };

        const prev = await query('SELECT name FROM brands WHERE id = $1', [id]);
        const oldName = prev.rows[0]?.name;

        await query('UPDATE brands SET name=$1 WHERE id=$2', [newName, id]);

        if (oldName && oldName.trim().toLowerCase() !== newName.toLowerCase()) {
          await query('UPDATE products SET brand=$1 WHERE LOWER(TRIM(brand))=LOWER(TRIM($2))', [newName, oldName]);
          await query('UPDATE manufacturer_brands SET brand_name=$1 WHERE LOWER(TRIM(brand_name))=LOWER(TRIM($2))', [newName, oldName]);
        }

        broadcast('brands');
        return { success: true };
      } catch (err) {
        console.error('Error updating brand:', err);
        return { success: false, error: err.message };
      }
    }
    case 'delete-brand': { await query('DELETE FROM brands WHERE id=$1', [data]); broadcast('brands'); return { success: true }; }
    case 'get-cities': { const r = await query('SELECT * FROM cities ORDER BY name'); return r.rows; }
    case 'add-city': { await query('INSERT INTO cities (name) VALUES ($1) ON CONFLICT DO NOTHING', [data]); broadcast('cities'); return { success: true }; }

    case 'get-expense-accounts': { const r = await query('SELECT * FROM expense_accounts ORDER BY account_name'); return r.rows; }
    case 'add-expense-account': {
      try {
        await query('INSERT INTO expense_accounts (account_name, default_rate) VALUES ($1, $2) ON CONFLICT (account_name) DO UPDATE SET default_rate = EXCLUDED.default_rate', [data.account_name, data.default_rate]);

        const glCheck = await query('SELECT id FROM gl_accounts WHERE LOWER(TRIM(account_name)) = LOWER(TRIM($1)) LIMIT 1', [data.account_name]);
        if (glCheck.rows.length === 0) {
          await query('INSERT INTO gl_accounts (account_name, account_type, opening_balance, balance_type) VALUES ($1, $2, 0, $3)', [data.account_name, 'Expense', 'Cr']);
        }

        broadcast('expense_accounts');
        broadcast('gl-accounts');
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
    case 'update-expense-account': {
      const oldAcc = await query('SELECT account_name FROM expense_accounts WHERE id=$1', [data.id]);
      const oldName = oldAcc.rows[0]?.account_name || '';

      console.log('[UPDATE-EXPENSE-ACCOUNT] Old name:', oldName, 'New name:', data.account_name, 'ID:', data.id);

      await query('UPDATE expense_accounts SET account_name=$1, default_rate=$2 WHERE id=$3', [data.account_name, data.default_rate, data.id]);

      if (oldName) {
        await query('UPDATE gl_accounts SET account_name=$1 WHERE LOWER(TRIM(account_name)) = LOWER(TRIM($2)) AND account_type = $3', [data.account_name, oldName, 'Expense']);
        // Update historical purchase_expenses records by expense_account_id and by old account name
        const peResult = await query('UPDATE purchase_expenses SET account_name=$1 WHERE expense_account_id=$2 OR LOWER(TRIM(account_name)) = LOWER(TRIM($3))', [data.account_name, data.id, oldName]);
        console.log('[UPDATE-EXPENSE-ACCOUNT] Updated purchase_expenses rows:', peResult.rowCount);
      }

      const glCheck = await query('SELECT id FROM gl_accounts WHERE LOWER(TRIM(account_name)) = LOWER(TRIM($1)) LIMIT 1', [data.account_name]);
      if (glCheck.rows.length === 0) {
        await query('INSERT INTO gl_accounts (account_name, account_type, opening_balance, balance_type) VALUES ($1, $2, 0, $3)', [data.account_name, 'Expense', 'Cr']);
      }

      broadcast('expense_accounts');
      broadcast('gl-accounts');
      return { success: true };
    }
    case 'delete-expense-account': {
      const oldAcc = await query('SELECT account_name FROM expense_accounts WHERE id=$1', [data]);
      const oldName = oldAcc.rows[0]?.account_name || '';

      await query('DELETE FROM expense_accounts WHERE id=$1', [data]);

      if (oldName) {
        await query(`
            DELETE FROM gl_accounts g
            WHERE LOWER(TRIM(g.account_name)) = LOWER(TRIM($1))
              AND g.account_type = 'Expense'
              AND NOT EXISTS (SELECT 1 FROM voucher_details vd WHERE vd.account_id = g.id)
          `, [oldName]);
      }

      broadcast('expense_accounts');
      broadcast('gl-accounts');
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
      const r = await query("SELECT item_code FROM products WHERE (NULLIF(regexp_replace(item_code, '\\D', '', 'g'), '')::numeric) < 185342 ORDER BY (NULLIF(regexp_replace(item_code, '\\D', '', 'g'), '')::numeric) DESC LIMIT 1");
      if (!r.rows.length) return '0001';
      const last = r.rows[0].item_code;
      const num = parseInt(last.replace(/\D/g, '')) || 0;
      return String(num + 1).padStart(4, '0');
    }
    case 'check-duplicate-product': {
      const { description, gender, category, sizeRange, purchaseRate, saleRate, year, brand, excludeId } = data;
      let sql = `SELECT * FROM products WHERE description ILIKE $1 AND gender ILIKE $2 AND category ILIKE $3 AND size_range ILIKE $4 AND purchase_rate = $5 AND sale_rate = $6 AND year = $7 AND brand ILIKE $8`;
      const params = [description.trim(), gender || '', category || '', sizeRange || '', purchaseRate, saleRate, year || '', brand || ''];
      if (excludeId) {
        sql += ` AND id != $9`;
        params.push(excludeId);
      }
      sql += ` LIMIT 1`;
      const r = await query(sql, params);
      return r.rows.length > 0 ? r.rows[0] : null;
    }
    case 'save-product': {
      const { itemCode, description, gender, category, sizeRange, purchaseRate, saleRate, packingQty, year, brand, discount, note, sessionId, createdBy } = data;
      const r = await query(
        'INSERT INTO products (item_code, description, gender, category, size_range, purchase_rate, sale_rate, packing_qty, year, brand, discount, note, session_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, item_code',
        [itemCode, description, gender || '', category || '', sizeRange || '', purchaseRate, saleRate, packingQty, year || null, brand || '', discount ? parseFloat(discount) : 0, note || '', sessionId || 0, createdBy || 'Unknown']
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
      const r = await query(`
        SELECT p.*,
          COALESCE(CAST((
            COALESCE(purchases.qty, 0) - COALESCE(sales.qty, 0) + COALESCE(returns_in.qty, 0) - COALESCE(returns_out.qty, 0) + COALESCE(adjustments.qty, 0)
          ) AS INTEGER), 0) AS stock_packets
        FROM products p
        LEFT JOIN (
          SELECT pi.item_code, SUM(pi.packets) as qty 
          FROM purchase_items pi JOIN purchases pu ON pi.purchase_id = pu.id 
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
        WHERE p.item_code ILIKE $1
      `, [data]);
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
      try {
        const res = await query(`
          INSERT INTO daily_sessions (date, last_id)
          VALUES (CURRENT_DATE, 1)
          ON CONFLICT (date) DO UPDATE SET last_id = daily_sessions.last_id + 1
          RETURNING last_id
        `);
        const newId = res.rows[0].last_id;

        // Clean up previous days' sessions by setting them to 0 so they don't persist
        // We do this silently in the background
        query('UPDATE products SET session_id = 0 WHERE session_id > 0 AND created_at < CURRENT_DATE').catch(console.error);

        return newId;
      } catch (err) {
        console.error('Error getting next session ID:', err);
        return 1; // Fallback
      }
    }

    case 'get-item-sessions': {
      const showAll = data?.showAll || false;
      const r = await query(`
        SELECT p.session_id, MIN(p.created_at) as started_at, MAX(p.brand) as brand, MAX(p.created_by) as created_by
        FROM products p
        WHERE p.session_id > 0 AND p.created_at >= CURRENT_DATE
        ${showAll ? '' : `AND NOT EXISTS (
          SELECT 1 FROM purchase_items pi WHERE pi.item_code = p.item_code
        )`}
        GROUP BY p.session_id 
        ORDER BY p.session_id DESC 
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
        SELECT p.*,
          COALESCE(CAST((
            COALESCE(purchases.qty, 0) - COALESCE(sales.qty, 0) + COALESCE(returns_in.qty, 0) - COALESCE(returns_out.qty, 0) + COALESCE(adjustments.qty, 0)
          ) AS INTEGER), 0) AS stock_packets
        FROM products p
        LEFT JOIN (
          SELECT pi.item_code, SUM(pi.packets) as qty 
          FROM purchase_items pi JOIN purchases pu ON pi.purchase_id = pu.id 
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
        WHERE p.item_code ILIKE $1 OR p.description ILIKE $1 
        ORDER BY 
          (p.item_code ILIKE $2) DESC,
          (p.item_code ILIKE $3) DESC,
          p.id DESC 
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
      const r = await query(`
        SELECT mb.*, s.name AS supplier_name
        FROM manufacturer_brands mb
        LEFT JOIN suppliers s ON s.id = mb.supplier_id
        ORDER BY mb.company_name, mb.brand_name
      `);
      return r.rows;
    }
    case 'get-raw-manufacturer-brands': {
      const r = await query(`
        SELECT mb.*, s.name AS supplier_name
        FROM manufacturer_brands mb
        LEFT JOIN suppliers s ON s.id = mb.supplier_id
      `);
      return r.rows;
    }
    case 'get-suppliers-list': {
      const r = await query('SELECT id, name FROM suppliers ORDER BY name');
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
          const supplierId = row.supplier_id ? parseInt(row.supplier_id) : null;
          if (!mfg || !b) continue;

          await query(
            `INSERT INTO manufacturer_brands (company_name, brand_name, purchase_discount_pct, discount_amount, supplier_id)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (company_name, brand_name) DO NOTHING`,
            [mfg, b, pd, da, supplierId]
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
      const total = items.reduce((s, i) => s + i.amount, 0) - (discount || 0) + (miscCharges || 0);
      const cleanPurchaseDate = getLocalDateString(purchaseDate || new Date());
      const cleanSupplierDate = supplierDate ? getLocalDateString(supplierDate) : null;
      console.log('[SAVE-PURCHASE] cleanPurchaseDate:', cleanPurchaseDate, 'cleanSupplierDate:', cleanSupplierDate);
      const pr = await query(
        'INSERT INTO purchases (purchase_date, invoice_no, supplier_name, total_amount, discount, misc_charges, notes, is_posted, supplier_inv_no, supplier_date, vehicle_no, godown, blt_number) VALUES ($1::DATE,$2,$3,$4,$5,$6,$7,0,$8,$9::DATE,$10,$11,$12) RETURNING id',
        [cleanPurchaseDate, invoiceNo || null, supplierName, total, discount || 0, miscCharges || 0, notes || null, supplierInvNo || null, cleanSupplierDate, vehicleNo || null, godown || '1-SHOP', bltNumber || null]
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
      const total = items.reduce((s, i) => s + i.amount, 0) - (discount || 0) + (miscCharges || 0);
      const cleanPurchaseDate = getLocalDateString(purchaseDate || new Date());
      const cleanSupplierDate = supplierDate ? getLocalDateString(supplierDate) : null;
      console.log('[UPDATE-PURCHASE] cleanPurchaseDate:', cleanPurchaseDate, 'cleanSupplierDate:', cleanSupplierDate);
      await query(
        'UPDATE purchases SET purchase_date=$1::DATE, invoice_no=$2, supplier_name=$3, total_amount=$4, discount=$5, misc_charges=$6, notes=$7, supplier_inv_no=$8, supplier_date=CASE WHEN $9::DATE IS NOT NULL THEN $9::DATE ELSE supplier_date END, vehicle_no=$10, godown=$11, is_posted=0, blt_number=$12 WHERE id=$13',
        [cleanPurchaseDate, invoiceNo || null, supplierName, total, discount || 0, miscCharges || 0, notes || null, supplierInvNo || null, cleanSupplierDate, vehicleNo || null, godown || '1-SHOP', bltNumber || null, id]
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
      const {
        returnDate, invoiceNo, supplierName, supplierDate, supplierInvNo,
        vehicleNo, godown, bltNumber, freightAccountName, ctnQty,
        discount, miscCharges, notes, items
      } = data;
      const total = items.reduce((s, i) => s + i.amount, 0) - (discount || 0) + (miscCharges || 0);

      if (supplierName && supplierName.trim()) {
        try {
          const suppRes = await query(
            'INSERT INTO suppliers (name, initial_balance) VALUES ($1, 0) ON CONFLICT (name) DO NOTHING RETURNING id',
            [supplierName.trim()]
          );
          let suppId = suppRes.rows[0]?.id;
          if (!suppId) {
            const sRow = await query('SELECT id FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [supplierName.trim()]);
            suppId = sRow.rows[0]?.id;
          }
          if (suppId) {
            await query(
              "INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type) VALUES ($1, 'Supplier', $2, 'Cr') ON CONFLICT (account_name) DO NOTHING",
              ['Supplier - ' + supplierName.trim(), suppId]
            );
          }
        } catch (e) {
          console.error('Auto-creating supplier in save-purchase-return error:', e);
        }
      }

      const maxNo = await query('SELECT MAX(CAST(return_no AS INTEGER)) FROM purchase_returns WHERE return_no ~ $1', ['^[0-9]+$']);
      const nextNo = String((parseInt(maxNo.rows[0].max) || 0) + 1);
      const rr = await query(
        `INSERT INTO purchase_returns (
          return_date, return_no, invoice_no, supplier_name, total_amount, discount, misc_charges, notes, is_posted,
          supplier_inv_no, supplier_date, vehicle_no, godown, blt_number, freight_account_name, ctn_qty
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10::DATE,$11,$12,$13,$14,$15) RETURNING id`,
        [
          returnDate, nextNo, invoiceNo || null, supplierName, total,
          discount || 0, miscCharges || 0, notes || null,
          supplierInvNo || null, supplierDate || null, vehicleNo || null,
          godown || '1-SHOP', bltNumber || null, freightAccountName || null, parseInt(ctnQty) || 0
        ]
      );
      const returnId = rr.rows[0].id;

      for (const item of items) {
        await query(
          `INSERT INTO purchase_return_items (
            return_id, item_code, item_description, packets, packing_qty, rate, amount,
            pre_disc_price, flat_discount, disc_pct, discount_amount, net_rate
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            returnId, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0,
            item.rate, item.amount, item.preDiscPrice || 0, item.flatDiscount || 0,
            item.discPct || 0, item.discountAmount || 0, item.netRate || 0
          ]
        );
      }

      broadcast('purchase-returns'); broadcast('stock'); broadcast('suppliers');
      return { success: true, id: returnId, returnNo: nextNo };
    }
    case 'update-purchase-return': {
      const {
        id, returnDate, invoiceNo, supplierName, supplierDate, supplierInvNo,
        vehicleNo, godown, bltNumber, freightAccountName, ctnQty,
        discount, miscCharges, notes, items
      } = data;
      const total = items.reduce((s, i) => s + i.amount, 0) - (discount || 0) + (miscCharges || 0);

      if (supplierName && supplierName.trim()) {
        try {
          const suppRes = await query(
            'INSERT INTO suppliers (name, initial_balance) VALUES ($1, 0) ON CONFLICT (name) DO NOTHING RETURNING id',
            [supplierName.trim()]
          );
          let suppId = suppRes.rows[0]?.id;
          if (!suppId) {
            const sRow = await query('SELECT id FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [supplierName.trim()]);
            suppId = sRow.rows[0]?.id;
          }
          if (suppId) {
            await query(
              "INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type) VALUES ($1, 'Supplier', $2, 'Cr') ON CONFLICT (account_name) DO NOTHING",
              ['Supplier - ' + supplierName.trim(), suppId]
            );
          }
        } catch (e) {
          console.error('Auto-creating supplier in update-purchase-return error:', e);
        }
      }

      await query(
        `UPDATE purchase_returns SET 
          return_date=$1, invoice_no=$2, supplier_name=$3, total_amount=$4, discount=$5, misc_charges=$6, notes=$7,
          supplier_inv_no=$8, supplier_date=CASE WHEN $9::DATE IS NOT NULL THEN $9::DATE ELSE supplier_date END,
          vehicle_no=$10, godown=$11, blt_number=$12, freight_account_name=$13, ctn_qty=$14
         WHERE id=$15`,
        [
          returnDate, invoiceNo || null, supplierName, total, discount || 0, miscCharges || 0, notes || null,
          supplierInvNo || null, supplierDate || null, vehicleNo || null, godown || '1-SHOP', bltNumber || null,
          freightAccountName || null, parseInt(ctnQty) || 0, id
        ]
      );

      await query('DELETE FROM purchase_return_items WHERE return_id=$1', [id]);

      for (const item of items) {
        await query(
          `INSERT INTO purchase_return_items (
            return_id, item_code, item_description, packets, packing_qty, rate, amount,
            pre_disc_price, flat_discount, disc_pct, discount_amount, net_rate
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            id, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0,
            item.rate, item.amount, item.preDiscPrice || 0, item.flatDiscount || 0,
            item.discPct || 0, item.discountAmount || 0, item.netRate || 0
          ]
        );
      }

      broadcast('purchase-returns'); broadcast('stock'); broadcast('suppliers');
      return { success: true };
    }
    case 'get-next-purchase-return-no': {
      const maxNo = await query('SELECT MAX(CAST(return_no AS INTEGER)) FROM purchase_returns WHERE return_no ~ $1', ['^[0-9]+$']);
      const nextNo = String((parseInt(maxNo.rows[0]?.max) || 0) + 1);
      return nextNo;
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
      broadcast('purchase-returns'); broadcast('stock'); broadcast('suppliers');
      return { success: true };
    }
    case 'save-purchase-return-pdf': {
      try {
        const { html, filename } = data || {};
        if (!html) return { success: false, error: 'No HTML content provided' };
        const { dialog, BrowserWindow, shell } = require('electron');
        const fs = require('fs');

        const saveResult = await dialog.showSaveDialog({
          title: 'Save Purchase Return PDF',
          defaultPath: filename || 'Purchase_Return.pdf',
          filters: [{ name: 'PDF Files (*.pdf)', extensions: ['pdf'] }]
        });

        if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true };

        return new Promise((resolve) => {
          try {
            const pdfWin = new BrowserWindow({
              show: false,
              webPreferences: { nodeIntegration: true, contextIsolation: false }
            });

            pdfWin.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);

            pdfWin.webContents.on('did-finish-load', async () => {
              try {
                const pdfBuffer = await pdfWin.webContents.printToPDF({
                  printBackground: true,
                  marginsType: 1,
                  pageSize: 'A4',
                  landscape: false
                });
                fs.writeFileSync(saveResult.filePath, pdfBuffer);
                pdfWin.close();
                resolve({ success: true, filePath: saveResult.filePath });
              } catch (err) {
                pdfWin.close();
                resolve({ success: false, error: err.message });
              }
            });
          } catch (err) {
            resolve({ success: false, error: err.message });
          }
        });
      } catch (err) {
        console.error('Error saving PDF:', err);
        return { success: false, error: err.message };
      }
    }
    case 'print-purchase-return-html': {
      try {
        const { html } = data || {};
        const { BrowserWindow } = require('electron');
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const url = require('url');

        const tempPath = path.join(os.tmpdir(), `purchase_return_print_${Date.now()}.html`);
        await fs.promises.writeFile(tempPath, html || '', 'utf8');

        const printWin = new BrowserWindow({ 
          show: true, 
          width: 920, 
          height: 950, 
          autoHideMenuBar: true, 
          title: 'Print Preview - Purchase Return' 
        });
        await printWin.loadURL(url.pathToFileURL(tempPath).href);
        printWin.on('closed', () => {
          fs.promises.unlink(tempPath).catch(() => {});
        });
        return { success: true };
      } catch (err) {
        console.error('Error printing HTML:', err);
        return { success: false, error: err.message };
      }
    }
    case 'save-manufacturer-stock-pdf': {
      try {
        const { html, filename } = data || {};
        if (!html) return { success: false, error: 'No HTML content provided' };
        const { dialog, BrowserWindow, shell } = require('electron');
        const fs = require('fs');

        const saveResult = await dialog.showSaveDialog({
          title: 'Save Manufacturer Stock Report PDF',
          defaultPath: filename || 'Manufacturer_Stock_Report.pdf',
          filters: [{ name: 'PDF Files (*.pdf)', extensions: ['pdf'] }]
        });

        if (saveResult.canceled || !saveResult.filePath) return { success: false, cancelled: true };

        return new Promise((resolve) => {
          try {
            const pdfWin = new BrowserWindow({
              show: false,
              webPreferences: { nodeIntegration: true, contextIsolation: false }
            });

            pdfWin.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);

            pdfWin.webContents.on('did-finish-load', async () => {
              try {
                const pdfBuffer = await pdfWin.webContents.printToPDF({
                  printBackground: true,
                  marginsType: 1,
                  pageSize: 'A4',
                  landscape: false
                });
                fs.writeFileSync(saveResult.filePath, pdfBuffer);
                pdfWin.close();
                resolve({ success: true, filePath: saveResult.filePath });
              } catch (err) {
                pdfWin.close();
                resolve({ success: false, error: err.message });
              }
            });
          } catch (err) {
            resolve({ success: false, error: err.message });
          }
        });
      } catch (err) {
        console.error('Error saving PDF:', err);
        return { success: false, error: err.message };
      }
    }
    case 'print-manufacturer-stock-html': {
      try {
        const { html } = data || {};
        const { BrowserWindow } = require('electron');
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const url = require('url');

        const tempPath = path.join(os.tmpdir(), `mfr_stock_print_${Date.now()}.html`);
        await fs.promises.writeFile(tempPath, html || '', 'utf8');

        const printWin = new BrowserWindow({ 
          show: true, 
          width: 950, 
          height: 950, 
          autoHideMenuBar: true, 
          title: 'Print Preview - Manufacturer Stock Report' 
        });
        await printWin.loadURL(url.pathToFileURL(tempPath).href);
        printWin.on('closed', () => {
          fs.promises.unlink(tempPath).catch(() => {});
        });
        return { success: true };
      } catch (err) {
        console.error('Error printing HTML:', err);
        return { success: false, error: err.message };
      }
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
          COALESCE(p.total_discount, 0) as total_discount,
          COALESCE(pr.total_returns, 0) as total_returns,
          COALESCE(sp.total_paid, 0) as total_paid,
          (s.initial_balance + COALESCE(p.total_purchases, 0) - COALESCE(pr.total_returns, 0) - COALESCE(sp.total_paid, 0)) as net_balance
        FROM suppliers s
        LEFT JOIN (
          SELECT 
            p.supplier_name, 
            SUM(p.total_amount) as total_purchases,
            SUM(p.discount + COALESCE((SELECT SUM(pi.pre_disc_price * pi.packets - pi.amount) FROM purchase_items pi WHERE pi.purchase_id = p.id), 0)) as total_discount
          FROM purchases p WHERE p.is_posted = 1 GROUP BY p.supplier_name
        ) p ON p.supplier_name = s.name
        LEFT JOIN (
          SELECT supplier_name, SUM(total_amount) as total_returns
          FROM purchase_returns WHERE is_posted = 1 GROUP BY supplier_name
        ) pr ON pr.supplier_name = s.name
        LEFT JOIN (
          SELECT 
            sp.supplier_name,
            SUM(sp.total_paid) as total_paid
          FROM (
            SELECT supplier_name, SUM(amount) as total_paid FROM supplier_payments GROUP BY supplier_name
            UNION ALL
            SELECT replace(g.account_name, 'Supplier - ', '') as supplier_name, SUM(vd.debit - vd.credit) as total_paid
            FROM voucher_details vd
            JOIN gl_accounts g ON g.id = vd.account_id
            WHERE g.account_type = 'Supplier'
            GROUP BY g.account_name
          ) sp GROUP BY sp.supplier_name
        ) sp ON sp.supplier_name = s.name
        ORDER BY s.name ASC
      `);
      return res.rows;
    }
    case 'update-supplier': {
      try {
        const { id, name, phone, city, initial_balance } = data;
        const newName = (name || '').trim();
        if (!newName) return { success: false, error: 'Supplier name cannot be empty' };

        const prev = await query('SELECT name FROM suppliers WHERE id = $1', [id]);
        const oldName = prev.rows[0]?.name;

        const initBal = initial_balance !== undefined ? (parseFloat(initial_balance) || 0) : undefined;
        if (initBal !== undefined) {
          await query('UPDATE suppliers SET name=$1, initial_balance=$2 WHERE id=$3', [newName, initBal, id]);
        } else {
          await query('UPDATE suppliers SET name=$1 WHERE id=$2', [newName, id]);
        }

        if (oldName && oldName.trim().toLowerCase() !== newName.toLowerCase()) {
          await query('UPDATE manufacturers SET name=$1 WHERE LOWER(TRIM(name))=LOWER(TRIM($2))', [newName, oldName]);
          await query('UPDATE manufacturer_brands SET company_name=$1 WHERE LOWER(TRIM(company_name))=LOWER(TRIM($2))', [newName, oldName]);
          await query('UPDATE purchases SET supplier_name=$1 WHERE LOWER(TRIM(supplier_name))=LOWER(TRIM($2))', [newName, oldName]);
          await query('UPDATE supplier_payments SET supplier_name=$1 WHERE LOWER(TRIM(supplier_name))=LOWER(TRIM($2))', [newName, oldName]);
          await query('UPDATE purchase_returns SET supplier_name=$1 WHERE LOWER(TRIM(supplier_name))=LOWER(TRIM($2))', [newName, oldName]);
          await query(`UPDATE gl_accounts SET account_name = $1 WHERE account_type = 'Supplier' AND (reference_id = $2 OR LOWER(TRIM(account_name)) = LOWER(TRIM($3)))`, ['Supplier - ' + newName, id, 'Supplier - ' + oldName]);
        }

        broadcast('suppliers');
        broadcast('manufacturers');
        broadcast('gl-accounts');
        broadcast('purchases');
        broadcast('purchase-returns');
        return { success: true };
      } catch (err) {
        console.error('Error updating supplier:', err);
        return { success: false, error: err.message };
      }
    }
    case 'delete-supplier': {
      try {
        const id = data;
        const prev = await query('SELECT name FROM suppliers WHERE id = $1', [id]);
        const oldName = prev.rows[0]?.name;

        if (oldName) {
          const purCheck = await query('SELECT id FROM purchases WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($1)) LIMIT 1', [oldName]);
          const payCheck = await query('SELECT id FROM supplier_payments WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($1)) LIMIT 1', [oldName]);
          const retCheck = await query('SELECT id FROM purchase_returns WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($1)) LIMIT 1', [oldName]);

          if (purCheck.rows.length > 0 || payCheck.rows.length > 0 || retCheck.rows.length > 0) {
            return {
              success: false,
              error: `Cannot delete '${oldName}' because financial transaction records exist. All purchase bills, payments, and ledger data remain safely preserved.`
            };
          }
        }

        await query('DELETE FROM suppliers WHERE id=$1', [id]);
        if (oldName) {
          await query('DELETE FROM manufacturers WHERE LOWER(TRIM(name))=LOWER(TRIM($1))', [oldName]);
        }

        broadcast('suppliers');
        broadcast('manufacturers');
        return { success: true };
      } catch (err) {
        console.error('Error deleting supplier:', err);
        return { success: false, error: err.message };
      }
    }
    case 'update-supplier-balance': {
      const { id, initial_balance } = data;
      const initBal = parseFloat(initial_balance) || 0;
      await query('UPDATE suppliers SET initial_balance = $1 WHERE id = $2', [initBal, id]);
      await query('UPDATE gl_accounts SET opening_balance = $1 WHERE account_type = \'Supplier\' AND reference_id = $2', [Math.abs(initBal), id]);
      broadcast('suppliers');
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
      console.log('[SUPP STMT] Fetching statement for supplier:', supplier_name);
      const supplierRow = await query('SELECT initial_balance FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [supplier_name]);
      const initial_balance = supplierRow.rows[0]?.initial_balance || 0;

      const res = await query(`
        SELECT 
          'PV-' || p.id as type,
          p.purchase_date as txn_date,
          p.invoice_no as ref_no,
          p.notes,
          p.supplier_date as supp_date,
          p.invoice_no as supp_inv_no,
          p.blt_number as bilty_no,
          COALESCE((SELECT SUM(cartons) FROM purchase_expenses WHERE purchase_id = p.id), 0) as ctn_bag,
          CAST(COALESCE((SELECT SUM(amount) FROM purchase_expenses WHERE purchase_id = p.id), 0) AS TEXT) as freight,
          COALESCE((SELECT SUM(packets) FROM purchase_items WHERE purchase_id = p.id), 0) as total_qty,
          COALESCE((SELECT SUM(pre_disc_price * packets) FROM purchase_items WHERE purchase_id = p.id), 0) as supplier_amount,
          (COALESCE((SELECT SUM(pre_disc_price * packets) FROM purchase_items WHERE purchase_id = p.id), 0) - COALESCE((SELECT SUM(amount) FROM purchase_items WHERE purchase_id = p.id), 0) + p.discount) as discount_amount,
          '' as cheque_no,
          0 as debit,
          p.total_amount as credit,
          COALESCE(p.created_at, p.purchase_date::timestamp) as raw_date,
          p.id as id
        FROM purchases p
        WHERE LOWER(TRIM(p.supplier_name)) = LOWER(TRIM($1)) AND p.is_posted = 1
        
        UNION ALL
        
        SELECT 
          'PR-' || r.id as type,
          r.return_date as txn_date,
          r.return_no as ref_no,
          r.notes as notes,
          r.supplier_date as supp_date,
          r.supplier_inv_no as supp_inv_no,
          r.blt_number as bilty_no,
          COALESCE(r.ctn_qty, COALESCE((SELECT SUM(packets) FROM purchase_return_items WHERE return_id = r.id), 0)) as ctn_bag,
          COALESCE(r.freight_account_name, '')::TEXT as freight,
          COALESCE((SELECT SUM(packets) FROM purchase_return_items WHERE return_id = r.id), 0) as total_qty,
          r.total_amount as supplier_amount,
          0 as discount_amount,
          '' as cheque_no,
          r.total_amount as debit,
          0 as credit,
          COALESCE(r.created_at, r.return_date::timestamp) as raw_date,
          r.id as id
        FROM purchase_returns r
        WHERE LOWER(TRIM(r.supplier_name)) = LOWER(TRIM($1)) AND r.is_posted = 1
        
        UNION ALL
        
        SELECT 
          CASE WHEN p.payment_mode = 'Cash' THEN 'CP-' || p.id ELSE 'BP-' || p.id END as type,
          p.payment_date as txn_date,
          'PAY-' || p.id as ref_no,
          p.payment_mode as notes,
          NULL as supp_date,
          '' as supp_inv_no,
          '' as bilty_no,
          0 as ctn_bag,
          ''::TEXT as freight,
          0 as total_qty,
          0 as supplier_amount,
          0 as discount_amount,
          p.notes as cheque_no,
          p.amount as debit,
          0 as credit,
          p.payment_date::timestamp as raw_date,
          p.id as id
        FROM supplier_payments p
        WHERE LOWER(TRIM(p.supplier_name)) = LOWER(TRIM($1))

        UNION ALL

        SELECT 
          v.voucher_type || '-' || v.voucher_no as type,
          v.voucher_date as txn_date,
          v.voucher_no as ref_no,
          CASE 
            WHEN (
              SELECT g_offset.account_name 
              FROM voucher_details vd_offset 
              JOIN gl_accounts g_offset ON g_offset.id = vd_offset.account_id 
              WHERE vd_offset.voucher_id = v.id 
                AND vd_offset.account_id != vd.account_id 
              ORDER BY vd_offset.id ASC
              LIMIT 1
            ) IS NOT NULL THEN
              REPLACE((
                SELECT g_offset.account_name 
                FROM voucher_details vd_offset 
                JOIN gl_accounts g_offset ON g_offset.id = vd_offset.account_id 
                WHERE vd_offset.voucher_id = v.id 
                  AND vd_offset.account_id != vd.account_id 
                ORDER BY vd_offset.id ASC
                LIMIT 1
              ), 'Bank - ', '') || CASE 
                WHEN COALESCE(vd.description, v.remarks, '') != '' 
                     AND COALESCE(vd.description, v.remarks, '') != 'Header offset' 
                     AND COALESCE(vd.description, v.remarks, '') != 'CASH PAY' 
                THEN ' - ' || COALESCE(vd.description, v.remarks)
                ELSE ''
              END
            ELSE COALESCE(vd.description, v.remarks, '')
          END as notes,
          NULL as supp_date,
          '' as supp_inv_no,
          '' as bilty_no,
          0 as ctn_bag,
          ''::TEXT as freight,
          0 as total_qty,
          0 as supplier_amount,
          0 as discount_amount,
          COALESCE(vd.reference_no, '') as cheque_no,
          vd.debit as debit,
          vd.credit as credit,
          COALESCE(v.created_at, v.voucher_date::timestamp) as raw_date,
          v.id as id
        FROM voucher_details vd
        JOIN vouchers v ON v.id = vd.voucher_id
        JOIN gl_accounts g ON g.id = vd.account_id
        WHERE g.account_type = 'Supplier' 
          AND (
            LOWER(TRIM(g.account_name)) = LOWER(TRIM($1)) 
            OR LOWER(TRIM(replace(g.account_name, 'Supplier - ', ''))) = LOWER(TRIM($1))
          )
        
        ORDER BY txn_date ASC, raw_date ASC, id ASC
      `, [supplier_name]);

      console.log(`[SUPP STMT] Returned ${res.rows.length} transactions for supplier:`, supplier_name);
      return { initial_balance, transactions: res.rows };
    }

    // ─── CUSTOMER STATEMENT HELPER ─────────────────────────────────────────────
    case 'get-customer-statement': {
      try {
        return await getCustomerStatementData(data || {});
      } catch (err) {
        console.error('Error in get-customer-statement:', err);
        return { error: err.message };
      }
    }
    case 'add-customer-payment': {
      try {
        const { customerName, customerId, paymentDate, amount, paymentMode, remarks, referenceNo, userId } = data;
        const numAmt = parseFloat(amount) || 0;
        if (numAmt <= 0) return { success: false, error: 'Amount must be greater than zero' };

        // 1. Get or create Customer GL Account
        let custGl = await query(`SELECT id FROM gl_accounts WHERE account_name = $1 OR (account_type = 'Customer' AND reference_id = $2)`, ['Customer - ' + customerName, customerId || 0]);
        let custAccId = custGl.rows[0]?.id;
        if (!custAccId) {
          const cr = await query(`INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type) VALUES ($1, 'Customer', $2, 'Dr') RETURNING id`, ['Customer - ' + customerName, customerId || null]);
          custAccId = cr.rows[0].id;
        }

        // 2. Get Cash or Bank GL Account
        let cashBankGl = await query(`SELECT id FROM gl_accounts WHERE account_name = $1 OR account_name ILIKE $2 LIMIT 1`, [paymentMode, `%${paymentMode}%`]);
        let cashBankAccId = cashBankGl.rows[0]?.id;
        if (!cashBankAccId) {
          const defaultCash = await query(`SELECT id FROM gl_accounts WHERE account_type = 'Cash' LIMIT 1`);
          cashBankAccId = defaultCash.rows[0]?.id;
        }

        // 3. Generate Voucher Number
        const vRes = await query(`UPDATE global_counters SET value = value + 1 WHERE name = 'voucher_no' RETURNING value`);
        const nextNo = String(vRes.rows[0]?.value || Date.now());
        const isCashMode = paymentMode.toLowerCase().includes('cash');
        const vCode = isCashMode ? `CP-${nextNo}` : `BR-${nextNo}`;
        const vType = isCashMode ? 'Cash Receipt' : 'Bank Receipt';

        // 4. Create Voucher Header
        const vr = await query(`INSERT INTO vouchers (voucher_no, voucher_date, voucher_type, remarks, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [vCode, paymentDate || cleanDateStr(new Date()), vType, remarks || 'CASH PAY', userId || null]);
        const voucherId = vr.rows[0].id;

        // 5. Create Voucher Details
        // Customer Account CREDITED (reduces customer debt)
        await query(`INSERT INTO voucher_details (voucher_id, account_id, description, reference_no, debit, credit) VALUES ($1, $2, $3, $4, 0, $5)`, [voucherId, custAccId, remarks || 'Payment received from customer', referenceNo || '', numAmt]);

        // Cash/Bank Account DEBITED (increases cash/bank balance)
        if (cashBankAccId) {
          await query(`INSERT INTO voucher_details (voucher_id, account_id, description, reference_no, debit, credit) VALUES ($1, $2, $3, $4, $5, 0)`, [voucherId, cashBankAccId, `Received from ${customerName}`, referenceNo || '', numAmt]);
        }

        broadcast('vouchers');
        broadcast('customers');
        return { success: true, voucherNo: vCode };
      } catch (err) {
        console.error('Error in add-customer-payment:', err);
        return { success: false, error: err.message };
      }
    }

    // ─── SALES ────────────────────────────────────────────────────────────────
    case 'get-customer-statement': {
      try {
        return await getCustomerStatementData(data || {});
      } catch (err) {
        console.error('Error in get-customer-statement:', err);
        return { error: err.message };
      }
    }
    case 'add-customer-payment': {
      try {
        const { customerName, customerId, paymentDate, amount, paymentMode, remarks, referenceNo, userId } = data;
        const numAmt = parseFloat(amount) || 0;
        if (numAmt <= 0) return { success: false, error: 'Amount must be greater than zero' };

        // 1. Get or create Customer GL Account
        let custGl = await query(`SELECT id FROM gl_accounts WHERE account_name = $1 OR (account_type = 'Customer' AND reference_id = $2)`, ['Customer - ' + customerName, customerId || 0]);
        let custAccId = custGl.rows[0]?.id;
        if (!custAccId) {
          const cr = await query(`INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type) VALUES ($1, 'Customer', $2, 'Dr') RETURNING id`, ['Customer - ' + customerName, customerId || null]);
          custAccId = cr.rows[0].id;
        }

        // 2. Get Cash or Bank GL Account
        let cashBankGl = await query(`SELECT id FROM gl_accounts WHERE account_name = $1 OR account_name ILIKE $2 LIMIT 1`, [paymentMode, `%${paymentMode}%`]);
        let cashBankAccId = cashBankGl.rows[0]?.id;
        if (!cashBankAccId) {
          const defaultCash = await query(`SELECT id FROM gl_accounts WHERE account_type = 'Cash' LIMIT 1`);
          cashBankAccId = defaultCash.rows[0]?.id;
        }

        // 3. Generate Voucher Number
        const vRes = await query(`UPDATE global_counters SET value = value + 1 WHERE name = 'voucher_no' RETURNING value`);
        const nextNo = String(vRes.rows[0]?.value || Date.now());
        const isCashMode = paymentMode.toLowerCase().includes('cash');
        const vCode = isCashMode ? `CP-${nextNo}` : `BR-${nextNo}`;
        const vType = isCashMode ? 'Cash Receipt' : 'Bank Receipt';

        // 4. Create Voucher Header
        const vr = await query(`INSERT INTO vouchers (voucher_no, voucher_date, voucher_type, remarks, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [vCode, paymentDate || cleanDateStr(new Date()), vType, remarks || 'CASH PAY', userId || null]);
        const voucherId = vr.rows[0].id;

        // 5. Create Voucher Details
        // Customer Account CREDITED (reduces customer debt)
        await query(`INSERT INTO voucher_details (voucher_id, account_id, description, reference_no, debit, credit) VALUES ($1, $2, $3, $4, 0, $5)`, [voucherId, custAccId, remarks || 'Payment received from customer', referenceNo || '', numAmt]);

        // Cash/Bank Account DEBITED (increases cash/bank balance)
        if (cashBankAccId) {
          await query(`INSERT INTO voucher_details (voucher_id, account_id, description, reference_no, debit, credit) VALUES ($1, $2, $3, $4, $5, 0)`, [voucherId, cashBankAccId, `Received from ${customerName}`, referenceNo || '', numAmt]);
        }

        broadcast('vouchers');
        broadcast('customers');
        return { success: true, voucherNo: vCode };
      } catch (err) {
        console.error('Error in add-customer-payment:', err);
        return { success: false, error: err.message };
      }
    }

    // ─── SALES ────────────────────────────────────────────────────────────────
    case 'get-customer-balance': {
      const { customerName, customerId } = data || {};
      if (!customerName && !customerId) return { balance: 0 };

      try {
        const stmt = await getCustomerStatementData({ customerName, customerId });
        return { balance: stmt?.signed_balance || 0 };
      } catch (err) {
        console.error('Error fetching customer balance:', err);
        return { balance: 0, error: err.message };
      }
    }
    case 'save-sale': {
      const { saleDate, invoiceNo, customerName, customerPhone, items, discount, miscCharges, paymentMethod, notes, userId, customerPrevBalance } = data;
      const subTotal = items.reduce((s, i) => s + i.amount, 0);
      const total = subTotal - (discount || 0) + (miscCharges || 0);
      const totalPackets = items.reduce((s, i) => s + i.packets, 0);

      let cId;
      if (customerName) {
        const existC = await query('SELECT id FROM customers WHERE name = $1', [customerName]);
        if (existC.rows && existC.rows.length > 0) {
          cId = existC.rows[0].id;
          await query('UPDATE customers SET phone = $2 WHERE id = $1', [cId, customerPhone || '']);
        } else {
          const cr = await query('INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id', [customerName, customerPhone || '']);
          cId = cr.rows[0].id;
        }
        await query(`INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type) VALUES ($1, 'Customer', $2, 'Dr') ON CONFLICT (account_name) DO NOTHING`, ['Customer - ' + customerName, cId]);
      }

      let finalInvoiceNo = invoiceNo;

      if (finalInvoiceNo && finalInvoiceNo.match(/^[0-9]+$/)) {
        const used = await query('SELECT id FROM sales WHERE invoice_no = $1', [finalInvoiceNo]);
        if (used.rows && used.rows.length > 0) {
          const res = await query(`UPDATE global_counters SET value = value + 1 WHERE name = 'invoice_no' RETURNING value`);
          finalInvoiceNo = String(res.rows[0].value);
        } else {
          await query(`UPDATE global_counters SET value = GREATEST(value, $1) WHERE name = 'invoice_no'`, [parseInt(finalInvoiceNo)]);
        }
      }

      const nowLocal = getLocalTimestampString();
      const sr = await query(
        'INSERT INTO sales (sale_date, invoice_no, customer_name, customer_phone, total_amount, total_packets, discount, misc_charges, payment_method, notes, user_id, customer_prev_balance, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id',
        [saleDate, finalInvoiceNo || null, customerName || null, customerPhone || null, total, totalPackets, discount || 0, miscCharges || 0, paymentMethod || 'Cash', notes || null, userId || null, customerPrevBalance || 0, nowLocal, nowLocal]
      );
      const saleId = sr.rows[0].id;
      for (const item of items) {
        const profit = (item.saleRate - item.purchaseRate) * item.packets;
        await query(
          'INSERT INTO sale_items (sale_id, item_code, item_description, packets, packing_qty, sale_rate, purchase_rate, amount, profit, discount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [saleId, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.saleRate, item.purchaseRate, item.amount, profit, item.discount || 0]
        );
      }

      broadcast('sales'); broadcast('stock'); broadcast('customers');
      return { success: true, id: saleId, invoiceNo: finalInvoiceNo };
    }
    case 'update-sale': {
      const { id, saleDate, invoiceNo, customerName, customerPhone, items, discount, miscCharges, paymentMethod, notes, customerPrevBalance } = data;
      const subTotal = items.reduce((s, i) => s + i.amount, 0);
      const total = subTotal - (discount || 0) + (miscCharges || 0);
      const totalPackets = items.reduce((s, i) => s + i.packets, 0);

      let cId;
      if (customerName) {
        const existC = await query('SELECT id FROM customers WHERE name = $1', [customerName]);
        if (existC.rows && existC.rows.length > 0) {
          cId = existC.rows[0].id;
          await query('UPDATE customers SET phone = $2 WHERE id = $1', [cId, customerPhone || '']);
        } else {
          const cr = await query('INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id', [customerName, customerPhone || '']);
          cId = cr.rows[0].id;
        }
        await query(`INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type) VALUES ($1, 'Customer', $2, 'Dr') ON CONFLICT (account_name) DO NOTHING`, ['Customer - ' + customerName, cId]);
      }

      const nowLocal = getLocalTimestampString();
      await query('UPDATE sales SET sale_date=$1, invoice_no=$2, customer_name=$3, customer_phone=$4, total_amount=$5, total_packets=$6, discount=$7, misc_charges=$8, payment_method=$9, notes=$10, customer_prev_balance=$11, updated_at=$12 WHERE id=$13',
        [saleDate, invoiceNo || null, customerName || null, customerPhone || null, total, totalPackets, discount || 0, miscCharges || 0, paymentMethod || 'Cash', notes || null, customerPrevBalance || 0, nowLocal, id]);
      await query('DELETE FROM sale_items WHERE sale_id=$1', [id]);
      for (const item of items) {
        const profit = (item.saleRate - item.purchaseRate) * item.packets;
        await query('INSERT INTO sale_items (sale_id, item_code, item_description, packets, packing_qty, sale_rate, purchase_rate, amount, profit, discount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [id, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.saleRate, item.purchaseRate, item.amount, profit, item.discount || 0]);
      }

      broadcast('sales'); broadcast('stock'); broadcast('customers');
      return { success: true };
    }
    case 'get-sales': {
      const { startDate, endDate, searchTerm } = data || {};
      let q = 'SELECT sales.*, users.username FROM sales LEFT JOIN users ON sales.user_id = users.id WHERE 1=1';
      const params = [];
      if (startDate) { params.push(startDate); q += ` AND sales.sale_date >= $${params.length}`; }
      if (endDate) { params.push(endDate); q += ` AND sales.sale_date <= $${params.length}`; }
      if (searchTerm) { params.push(`%${searchTerm}%`); q += ` AND (sales.customer_name ILIKE $${params.length} OR sales.invoice_no ILIKE $${params.length})`; }
      q += ' ORDER BY sales.id DESC';
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
      try {
        await query(`INSERT INTO global_counters (name, value)
          SELECT 'invoice_no', COALESCE(MAX(CAST(invoice_no AS INTEGER)), 0) FROM sales WHERE invoice_no ~ '^[0-9]+$'
          ON CONFLICT (name) DO NOTHING
        `);
        const res = await query(`SELECT value + 1 AS next_val FROM global_counters WHERE name = 'invoice_no'`);
        return String(res.rows[0].next_val);
      } catch (err) {
        console.error('Error getting next invoice no:', err);
        const r = await query("SELECT MAX(CAST(invoice_no AS INTEGER)) FROM sales WHERE invoice_no ~ '^[0-9]+$'");
        return String((parseInt(r.rows[0].max) || 0) + 1);
      }
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
      const result = await query('INSERT INTO manufacturers (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id', [data]);
      const mfgId = result.rows[0]?.id;
      if (mfgId) {
        // Create GL account
        await query(
          'INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type) VALUES ($1, $2, $3, $4) ON CONFLICT (account_name) DO NOTHING',
          ['Supplier - ' + data, 'Supplier', mfgId, 'Cr']
        );
        // Also create in suppliers table for full integration
        await query(
          'INSERT INTO suppliers (name, initial_balance) VALUES ($1, 0) ON CONFLICT (name) DO NOTHING',
          [data]
        );
        broadcast('gl-accounts');
        broadcast('suppliers');
      }
      return { success: true };
    }
    case 'update-manufacturer': {
      try {
        const { id, name } = data;
        const newName = (name || '').trim();
        if (!newName) return { success: false, error: 'Manufacturer name cannot be empty' };

        const prev = await query('SELECT name FROM manufacturers WHERE id = $1', [id]);
        const oldName = prev.rows[0]?.name;

        await query('UPDATE manufacturers SET name=$1 WHERE id=$2', [newName, id]);

        if (oldName && oldName.trim().toLowerCase() !== newName.toLowerCase()) {
          await query('UPDATE suppliers SET name=$1 WHERE LOWER(TRIM(name))=LOWER(TRIM($2))', [newName, oldName]);
          await query('UPDATE manufacturer_brands SET company_name=$1 WHERE LOWER(TRIM(company_name))=LOWER(TRIM($2))', [newName, oldName]);
          await query('UPDATE purchases SET supplier_name=$1 WHERE LOWER(TRIM(supplier_name))=LOWER(TRIM($2))', [newName, oldName]);
          await query('UPDATE supplier_payments SET supplier_name=$1 WHERE LOWER(TRIM(supplier_name))=LOWER(TRIM($2))', [newName, oldName]);
          await query('UPDATE purchase_returns SET supplier_name=$1 WHERE LOWER(TRIM(supplier_name))=LOWER(TRIM($2))', [newName, oldName]);
          await query(`UPDATE gl_accounts SET account_name = $1 WHERE account_type = 'Supplier' AND LOWER(TRIM(account_name)) = LOWER(TRIM($2))`, ['Supplier - ' + newName, 'Supplier - ' + oldName]);
        }

        broadcast('manufacturers');
        broadcast('suppliers');
        broadcast('gl-accounts');
        broadcast('purchases');
        broadcast('purchase-returns');
        return { success: true };
      } catch (err) {
        console.error('Error updating manufacturer:', err);
        return { success: false, error: err.message };
      }
    }
    case 'delete-manufacturer': {
      try {
        const id = data;
        const prev = await query('SELECT name FROM manufacturers WHERE id = $1', [id]);
        const oldName = prev.rows[0]?.name;

        if (oldName) {
          const purCheck = await query('SELECT id FROM purchases WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($1)) LIMIT 1', [oldName]);
          const payCheck = await query('SELECT id FROM supplier_payments WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($1)) LIMIT 1', [oldName]);
          const retCheck = await query('SELECT id FROM purchase_returns WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM($1)) LIMIT 1', [oldName]);

          if (purCheck.rows.length > 0 || payCheck.rows.length > 0 || retCheck.rows.length > 0) {
            return {
              success: false,
              error: `Cannot delete '${oldName}' because financial transaction records exist. All purchase bills, payments, and ledger data remain safely preserved.`
            };
          }
          await query('DELETE FROM suppliers WHERE LOWER(TRIM(name))=LOWER(TRIM($1))', [oldName]);
        }

        await query('DELETE FROM manufacturers WHERE id=$1', [id]);
        broadcast('manufacturers');
        broadcast('suppliers');
        return { success: true };
      } catch (err) {
        console.error('Error deleting manufacturer:', err);
        return { success: false, error: err.message };
      }
    }

    // ─── PAYMENTS ─────────────────────────────────────────────────────────────
    case 'get-payment-accounts': {
      return {
        savedAccounts: store.get('savedAccounts', []),
        defaultAccounts: store.get('defaultAccounts', {})
      };
    }
    case 'save-payment-accounts': {
      store.set('savedAccounts', data.savedAccounts || []);
      store.set('defaultAccounts', data.defaultAccounts || {});
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
        if (pool) await pool.end().catch(() => { });
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
        await setupPool.end().catch(() => { });
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
        // Also backup tables without id column
        for (const t of BACKUP_TABLES_NO_ID) {
          const r = await query(`SELECT * FROM ${t}`);
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
      if (!fs.existsSync(fileToRestore)) return { success: false, error: 'Backup file not found: ' + fileToRestore };

      try {
        const raw = fs.readFileSync(fileToRestore, 'utf-8');
        const parsed = JSON.parse(raw);

        const networkMode = store.get('networkMode', 'server');
        if (networkMode === 'client') {
          return await forwardToServer('import-database-restore', parsed);
        }
        return await runRestoreData(parsed);
      } catch (err) {
        return { success: false, error: 'Restore failed: ' + err.message };
      }
    }


    case 'get-freight-report': {
      const { startDate, endDate } = data;
      const res = await query(`
        SELECT 
          ('PE-' || pe.id)::text as id,
          pe.id as item_id,
          COALESCE(p.purchase_date, p.created_at::date) as purchase_date,
          COALESCE(p.created_at, p.purchase_date::timestamp) as sort_ts,
          pe.account_name,
          p.supplier_name,
          p.invoice_no,
          pe.cartons,
          pe.rate,
          pe.amount,
          COALESCE(pe.remarks, '') as remarks,
          'PURCHASE' as source
        FROM purchase_expenses pe
        JOIN purchases p ON p.id = pe.purchase_id
        WHERE pe.amount > 0
          AND COALESCE(p.purchase_date, p.created_at::date) BETWEEN $1 AND $2

        UNION ALL

        SELECT
          ('VD-' || vd.id)::text as id,
          vd.id as item_id,
          v.voucher_date as purchase_date,
          COALESCE(v.created_at, v.voucher_date::timestamp) as sort_ts,
          g.account_name,
          '' as supplier_name,
          v.voucher_no as invoice_no,
          0 as cartons,
          0 as rate,
          vd.debit as amount,
          COALESCE(NULLIF(vd.description, ''), v.remarks, '') as remarks,
          'VOUCHER' as source
        FROM voucher_details vd
        JOIN vouchers v ON v.id = vd.voucher_id
        JOIN gl_accounts g ON g.id = vd.account_id
        JOIN expense_accounts ea ON LOWER(TRIM(ea.account_name)) = LOWER(TRIM(g.account_name))
        WHERE vd.debit > 0
          AND v.voucher_date BETWEEN $1 AND $2

        ORDER BY purchase_date DESC, sort_ts DESC, item_id DESC
      `, [startDate, endDate]);
      return res.rows;
    }

    case 'get-freight-ledger': {
      const { startDate, endDate, accountName } = data || {};

      const baseTxSql = `
        SELECT
          COALESCE(p.purchase_date, p.created_at::date) as txn_date,
          pe.account_name,
          'PURCHASE' as source,
          ('PV-' || COALESCE(NULLIF(p.invoice_no, ''), p.id::text)) as type_code,
          COALESCE(NULLIF(p.invoice_no, ''), p.id::text) as vcode,
          COALESCE(NULLIF(p.invoice_no, ''), ('PUR-' || p.id::text)) as ref_no,
          CASE 
            WHEN pe.remarks IS NOT NULL AND TRIM(pe.remarks) != '' THEN pe.remarks
            WHEN pe.rate > 0 THEN 'FREIGHT CTN EXP ' || pe.rate::text || '/= Payable'
            ELSE 'FREIGHT CTN EXP Payable'
          END as remarks,
          '' as cheque_no,
          COALESCE(pe.cartons, 0) as ctns,
          0::numeric as debit,
          pe.amount as credit,
          COALESCE(p.created_at, p.purchase_date::timestamp) as sort_ts,
          pe.id as item_id,
          ('PE-' || pe.id)::text as row_id
        FROM purchase_expenses pe
        JOIN purchases p ON p.id = pe.purchase_id
        WHERE pe.amount > 0

        UNION ALL

        SELECT
          v.voucher_date as txn_date,
          g.account_name,
          'VOUCHER' as source,
          COALESCE(NULLIF(v.voucher_no, ''), ('VD-' || v.id::text)) as type_code,
          COALESCE(NULLIF(vd.reference_no, ''), NULLIF(v.voucher_no, ''), v.id::text) as vcode,
          COALESCE(NULLIF(v.voucher_no, ''), ('V-' || v.id::text)) as ref_no,
          COALESCE(NULLIF(vd.description, ''), NULLIF(v.remarks, ''), '') as remarks,
          COALESCE(vd.reference_no, '') as cheque_no,
          0 as ctns,
          vd.debit,
          vd.credit,
          COALESCE(v.created_at, v.voucher_date::timestamp) as sort_ts,
          vd.id as item_id,
          ('VD-' || vd.id)::text as row_id
        FROM voucher_details vd
        JOIN vouchers v ON v.id = vd.voucher_id
        JOIN gl_accounts g ON g.id = vd.account_id
        JOIN expense_accounts ea ON LOWER(TRIM(ea.account_name)) = LOWER(TRIM(g.account_name))
        WHERE vd.debit > 0 OR vd.credit > 0
      `;

      const glAccRes = await query(`
        SELECT g.account_name, g.opening_balance, g.balance_type
        FROM gl_accounts g
        JOIN expense_accounts ea ON LOWER(TRIM(ea.account_name)) = LOWER(TRIM(g.account_name))
      `);

      // Get all transactions for running balance calculation (no date filter for closing balance)
      const allTxParams = [];
      let accountFilterAllTx = '';
      if (accountName) {
        allTxParams.push(accountName);
        accountFilterAllTx = ` AND LOWER(TRIM(t.account_name)) = LOWER(TRIM($${allTxParams.length}))`;
      }

      const allTxRes = await query(`
        WITH tx AS (${baseTxSql})
        SELECT
          t.txn_date,
          t.account_name,
          t.source,
          t.type_code,
          t.vcode,
          t.ref_no,
          t.remarks,
          t.cheque_no,
          t.ctns,
          t.debit,
          t.credit,
          t.sort_ts,
          t.row_id
        FROM tx t
        WHERE 1=1
          ${accountFilterAllTx}
        ORDER BY t.txn_date ASC, t.sort_ts ASC, t.row_id ASC
      `, allTxParams);

      // Calculate initial balance from GL accounts (signed: Cr-positive, Dr-negative in credit-normal ledger)
      const openingByAccount = new Map();
      for (const row of glAccRes.rows) {
        if (accountName && row.account_name.toLowerCase().trim() !== accountName.toLowerCase().trim()) continue;
        openingByAccount.set(
          row.account_name.toLowerCase().trim(),
          signedOpeningBalance(row.opening_balance, row.balance_type || 'Cr')
        );
      }

      const initialBalance = accountName
        ? (openingByAccount.get(accountName.toLowerCase().trim()) || 0)
        : Array.from(openingByAccount.values()).reduce((s, v) => s + v, 0);

      // Process all transactions chronologically to calculate opening and closing balances
      // Following the same pattern as customer statement (lines 1433-1451)
      let currentBal = initialBalance;
      let startBal = initialBalance;
      const filteredTransactions = [];

      allTxRes.rows.forEach((r) => {
        const debit = parseFloat(r.debit) || 0;
        const credit = parseFloat(r.credit) || 0;
        const dStr = r.txn_date;

        if (startDate && dStr < startDate) {
          // Transaction is before start date - update both startBal and currentBal
          startBal = startBal + credit - debit;
          currentBal = currentBal + credit - debit;
        } else if (!endDate || dStr <= endDate) {
          // Transaction is within date range - update currentBal and add to filtered list
          currentBal = currentBal + credit - debit;
          filteredTransactions.push({
            date: r.txn_date,
            account_name: r.account_name || '',
            source: r.source,
            type: r.type_code,
            vcode: r.vcode,
            ref_no: r.ref_no,
            remarks: r.remarks,
            cheque_no: r.cheque_no,
            ctns: parseInt(r.ctns) || 0,
            debit,
            credit,
            balance: Math.abs(currentBal),
            balance_type: currentBal >= 0 ? 'Cr.' : 'Dr.'
          });
        }
        // If transaction is after end date, skip it entirely
      });

      const transactions = filteredTransactions;
      const totalDebit = transactions.reduce((s, t) => s + t.debit, 0);
      const totalCredit = transactions.reduce((s, t) => s + t.credit, 0);
      const closingSigned = currentBal;

      return {
        opening_balance: Math.abs(startBal),
        opening_type: startBal >= 0 ? 'Cr.' : 'Dr.',
        total_debit: totalDebit,
        total_credit: totalCredit,
        closing_balance: Math.abs(closingSigned),
        closing_type: closingSigned >= 0 ? 'Cr.' : 'Dr.',
        transactions
      };
    }

    case 'get-daily-report': {
      try {
        const { startDate, endDate, startTime, endTime, userId } = data;
        const start = startDate;
        const end = endDate;

        const hasTimeFilter = !!(startTime || endTime);
        const matchesTimeWindow = (createdAt) => {
          if (!hasTimeFilter || !createdAt) return true;
          const dt = new Date(createdAt);
          if (isNaN(dt.getTime())) return true;
          const h = String(dt.getHours()).padStart(2, '0');
          const m = String(dt.getMinutes()).padStart(2, '0');
          const timeStr = `${h}:${m}`;
          if (startTime && timeStr < startTime) return false;
          if (endTime && timeStr > endTime) return false;
          return true;
        };

        let userClause = '';
        const params = [start, end];
        if (userId && userId !== 'all') {
          params.push(userId);
          userClause = ` AND sales.user_id = $${params.length}`;
        }

        const salesRes = await query(`
          SELECT sales.id, sales.invoice_no, sales.sale_date, sales.created_at, sales.customer_name, sales.total_amount, sales.total_packets as total_quantity, sales.payment_method, sales.discount, sales.misc_charges, users.username as sold_by
          FROM sales
          LEFT JOIN users ON sales.user_id = users.id
          WHERE sales.sale_date::date BETWEEN $1 AND $2${userClause}
          ORDER BY sales.sale_date ASC, sales.created_at ASC
        `, params);
        const sales = salesRes.rows;

        // Fetch Bank Accounts for strict matching in Master Cashier Window & Daily Report
        const glRes = await query(`SELECT account_name FROM gl_accounts WHERE account_type = 'Bank'`);
        const bankAccountNames = glRes.rows.map(r => (r.account_name || '').toLowerCase().trim());

        const enrichedSales = [];
        const returnInvoices = [];
        for (const sale of sales) {
          if (!matchesTimeWindow(sale.created_at)) continue;
          const itemsRes = await query(`
            SELECT item_code, item_description, packets as quantity, sale_rate, purchase_rate, amount, profit
            FROM sale_items
            WHERE sale_id = $1
            ORDER BY id
          `, [sale.id]);
          const items = itemsRes.rows;

          const billAmt = parseFloat(sale.total_amount) || 0;
          const isReturnInvoice = billAmt < 0 || (sale.payment_method && sale.payment_method.toLowerCase().includes('return'));
          let cash = 0;
          let digital = 0;
          const breakdown = {};

          if (sale.payment_method) {
            const parts = sale.payment_method.split(',');
            for (const part of parts) {
              const colonIdx = part.lastIndexOf(':');
              if (colonIdx === -1) continue;
              const fullMethod = part.slice(0, colonIdx).trim();
              const amt = parseFloat(part.slice(colonIdx + 1).trim()) || 0;

              if (isBankOrDigitalPayment(fullMethod, bankAccountNames)) {
                digital += amt;
                breakdown[fullMethod] = (breakdown[fullMethod] || 0) + amt;
              } else if (fullMethod.toLowerCase().includes('cash') || (!fullMethod.toLowerCase().includes('credit') && !fullMethod.toLowerCase().includes('unpaid') && !fullMethod.toLowerCase().includes('return'))) {
                cash += amt;
              }
            }
          }

          const totalPaid = cash + digital;
          if (billAmt > 0 && totalPaid > billAmt && cash > 0) {
            const changeGiven = totalPaid - billAmt;
            cash = Math.max(0, cash - changeGiven);
          }
          const netTotalPaid = cash + digital;

          let credit = 0;
          if (billAmt >= 0 && !isReturnInvoice) {
            credit = Math.max(0, billAmt - netTotalPaid);
          }

          const totalProfit = items.reduce((s, i) => s + (parseFloat(i.profit) || 0), 0) + (parseFloat(sale.misc_charges) || 0) - (parseFloat(sale.discount) || 0);

          if (isReturnInvoice) {
            returnInvoices.push({
              id: `return-invoice-${sale.id}`,
              return_no: sale.invoice_no || sale.id,
              invoice_no: sale.invoice_no || sale.id,
              return_date: sale.sale_date,
              created_at: sale.created_at,
              customer_name: sale.customer_name,
              total_amount: Math.abs(billAmt),
              notes: sale.notes || 'Return Invoice',
              items: items.map(item => ({
                item_code: item.item_code,
                item_description: item.item_description,
                quantity: Math.abs(parseFloat(item.quantity) || 0),
                sale_rate: parseFloat(item.sale_rate) || 0,
                amount: Math.abs(parseFloat(item.amount) || 0),
                profit: parseFloat(item.profit) || 0
              })),
              isReturnInvoice: true,
              displayType: 'Return Invoice'
            });
          } else {
            enrichedSales.push({ ...sale, items, cash, digital, credit, billAmt, profit: totalProfit, breakdown, isReturnInvoice: false, displayType: null });
          }
        }

        const returnsRes = await query(`
          SELECT id, return_no, invoice_no, return_date, created_at, customer_name, total_amount
          FROM sales_returns
          WHERE return_date::date BETWEEN $1 AND $2
          ORDER BY return_date ASC, created_at ASC
        `, [start, end]);
        const returns = returnsRes.rows;

        const enrichedReturns = [];
        for (const ret of returns) {
          if (!matchesTimeWindow(ret.created_at)) continue;
          const itemsRes = await query(`
            SELECT 
              sri.item_code, sri.item_description, sri.packets as quantity, sri.price as sale_rate, sri.amount,
              COALESCE(
                (SELECT purchase_rate FROM sale_items WHERE item_code = sri.item_code LIMIT 1),
                0
              ) as purchase_rate
            FROM sales_return_items sri
            WHERE sri.return_id = $1
            ORDER BY sri.id
          `, [ret.id]);
          const items = itemsRes.rows.map(i => ({
            ...i,
            profit: ((parseFloat(i.sale_rate) || 0) - (parseFloat(i.purchase_rate) || 0)) * (parseFloat(i.quantity) || 0)
          }));
          enrichedReturns.push({ ...ret, items });
        }

        const totalSales = enrichedSales.reduce((sum, s) => sum + s.billAmt, 0);
        const totalSoldItems = enrichedSales.reduce((sum, s) => sum + (parseFloat(s.total_quantity) || 0), 0);
        const allReturns = [...enrichedReturns, ...returnInvoices];
        const totalReturns = allReturns.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0);
        const totalReturnedItems = allReturns.reduce((sum, r) => sum + r.items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0), 0);
        const grossProfit = enrichedSales.reduce((sum, s) => sum + (parseFloat(s.profit) || 0), 0);
        const profitLostOnReturns = allReturns.reduce((sum, r) => sum + r.items.reduce((s, i) => s + (parseFloat(i.profit) || 0), 0), 0);
        const netProfit = grossProfit - profitLostOnReturns;
        const totalCash = enrichedSales.reduce((sum, s) => sum + s.cash, 0);
        const totalDigital = enrichedSales.reduce((sum, s) => sum + s.digital, 0);
        const totalCredit = enrichedSales.reduce((sum, s) => sum + s.credit, 0);
        const netCash = totalCash - totalReturns;

        const digitalBreakdown = {};
        enrichedSales.forEach(s => {
          if (s.breakdown) {
            Object.keys(s.breakdown).forEach(method => {
              if (!digitalBreakdown[method]) digitalBreakdown[method] = { amount: 0, count: 0 };
              digitalBreakdown[method].amount += s.breakdown[method];
              digitalBreakdown[method].count += 1;
            });
          }
        });

        return {
          sales: enrichedSales,
          returns: allReturns,
          summary: {
            totalSales, totalSoldItems, totalReturns, totalReturnedItems,
            netSales: totalSales - totalReturns,
            totalCash, netCash, totalDigital, totalCredit, digitalBreakdown,
            grossProfit, profitLostOnReturns, netProfit
          }
        };
      } catch (err) {
        console.error('Error getting daily report:', err);
        return { error: err.message };
      }
    }

    case 'get-user-report': {
      try {
        const { startDate, endDate } = data;
        const usersRes = await query('SELECT id, username FROM users');
        const users = usersRes.rows;

        const report = [];
        for (const user of users) {
          const sRes = await query(`
            SELECT 
                COUNT(id) as invoice_count,
                SUM(total_packets) as item_count,
                SUM(total_amount) as total_sales
            FROM sales
            WHERE user_id = $1 AND sale_date::date BETWEEN $2 AND $3
          `, [user.id, startDate, endDate]);
          const salesStats = sRes.rows[0] || {};

          const rRes = await query(`
            SELECT 
                COUNT(id) as return_count,
                SUM(total_amount) as total_returned
            FROM sales_returns
            WHERE user_id = $1 AND return_date::date BETWEEN $2 AND $3
          `, [user.id, startDate, endDate]);
          const returnStats = rRes.rows[0] || {};

          const iRes = await query(`
            SELECT 
                sale_date, created_at, invoice_no, total_packets as total_quantity, total_amount, discount, misc_charges, payment_method
            FROM sales 
            WHERE user_id = $1 AND sale_date::date BETWEEN $2 AND $3
            ORDER BY created_at DESC
          `, [user.id, startDate, endDate]);

          const glResUser = await query(`SELECT account_name FROM gl_accounts WHERE account_type = 'Bank'`);
          const userBankNames = glResUser.rows.map(r => (r.account_name || '').toLowerCase().trim());

          let userCash = 0, userDigital = 0;
          const userDigitalBreakdown = {};
          iRes.rows.forEach(row => {
            let digital = 0;
            if (row.payment_method) {
              const parts = row.payment_method.split(',');
              for (const part of parts) {
                const colonIdx = part.lastIndexOf(':');
                if (colonIdx === -1) continue;
                const fullMethod = part.slice(0, colonIdx).trim();
                const amt = parseFloat(part.slice(colonIdx + 1).trim()) || 0;
                if (isBankOrDigitalPayment(fullMethod, userBankNames)) {
                  digital += amt;
                  userDigitalBreakdown[fullMethod] = (userDigitalBreakdown[fullMethod] || 0) + amt;
                }
              }
            }
            userDigital += digital;
            const billAmt = (parseFloat(row.total_amount) || 0) + (parseFloat(row.misc_charges) || 0) - (parseFloat(row.discount) || 0);
            userCash += Math.max(0, billAmt - digital);
          });

          if (parseInt(salesStats.invoice_count) > 0 || parseInt(returnStats.return_count) > 0) {
            report.push({
              username: user.username,
              invoiceCount: parseInt(salesStats.invoice_count) || 0,
              itemCount: parseInt(salesStats.item_count) || 0,
              totalSales: parseFloat(salesStats.total_sales) || 0,
              returnCount: parseInt(returnStats.return_count) || 0,
              totalReturned: parseFloat(returnStats.total_returned) || 0,
              cashSales: userCash,
              digitalSales: userDigital,
              digital_breakdown: userDigitalBreakdown,
              invoices: iRes.rows
            });
          }
        }
        return report;
      } catch (err) {
        console.error('Error in get-user-report:', err);
        return { error: err.message };
      }
    }

    case 'get-date-summary': {
      try {
        const { startDate, endDate } = data;
        const glResSummary = await query(`SELECT account_name FROM gl_accounts WHERE account_type = 'Bank'`);
        const summaryBankNames = glResSummary.rows.map(r => (r.account_name || '').toLowerCase().trim());

        const res = await query(`
          SELECT sale_date::date as day,
                 SUM(total_amount) as total_sales,
                 SUM(total_packets) as total_items,
                 STRING_AGG(payment_method || ':' || total_amount, ',') as payment_breakdown
          FROM sales
          WHERE sale_date::date BETWEEN $1 AND $2
          GROUP BY sale_date::date
          ORDER BY day ASC
        `, [startDate, endDate]);

        return res.rows.map(row => {
          let cash = 0, digital = 0;
          if (row.payment_breakdown) {
            row.payment_breakdown.split(',').forEach(part => {
              const colonIdx = part.lastIndexOf(':');
              if (colonIdx > -1) {
                const fullMethod = part.slice(0, colonIdx).trim();
                const amt = parseFloat(part.slice(colonIdx + 1)) || 0;
                if (isBankOrDigitalPayment(fullMethod, summaryBankNames)) {
                  digital += amt;
                } else if (fullMethod.toLowerCase().includes('cash') || (!fullMethod.toLowerCase().includes('credit') && !fullMethod.toLowerCase().includes('unpaid') && !fullMethod.toLowerCase().includes('return'))) {
                  cash += amt;
                }
              }
            });
          }
          return {
            date: row.day,
            total_sales: parseFloat(row.total_sales) || 0,
            items_sold: parseInt(row.total_items) || 0,
            cash_sales: cash,
            digital_sales: digital
          };
        });
      } catch (err) {
        console.error('Error in get-date-summary:', err);
        return { error: err.message };
      }
    }

    case 'get-sales-report': {
      try {
        const { startDate, endDate } = data;
        const tRes = await query(`
          SELECT 
            COUNT(id) as total_invoices,
            SUM(total_amount) as total_sales,
            SUM(total_packets) as total_items,
            SUM(discount) as total_discount,
            SUM(misc_charges) as total_misc_charges
          FROM sales 
          WHERE sale_date::date BETWEEN $1 AND $2
        `, [startDate, endDate]);

        const pRes = await query(`
          SELECT SUM(si.profit) as total_profit
          FROM sale_items si
          JOIN sales s ON si.sale_id = s.id
          WHERE s.sale_date::date BETWEEN $1 AND $2
        `, [startDate, endDate]);

        const iRes = await query(`
          SELECT 
            si.item_code, si.item_description as description, SUM(si.packets) as qty,
            SUM(si.amount) as amount, SUM(si.profit) as profit
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          WHERE s.sale_date::date BETWEEN $1 AND $2
          GROUP BY si.item_code, si.item_description
          ORDER BY qty DESC
        `, [startDate, endDate]);

        return {
          ...tRes.rows[0],
          total_profit: pRes.rows[0]?.total_profit || 0,
          items: iRes.rows
        };
      } catch (err) {
        console.error('Error in get-sales-report:', err);
        return { error: err.message };
      }
    }

    case 'get-supplier-stock-report': {
      try {
        const res = await query(`
          SELECT * FROM (
            SELECT
              p.item_code,
              p.description,
              p.category,
              p.size_range,
              p.gender,
              p.brand,
              p.year,
              CASE
                WHEN s.name IS NOT NULL THEN s.name
                WHEN s2.name IS NOT NULL THEN s2.name
                WHEN NULLIF(p.brand, '') IS NOT NULL THEN 'Unmapped: ' || p.brand
                ELSE 'Unassigned'
              END AS supplier_name,
              p.purchase_rate AS list_rate,
              p.sale_rate,
              CAST((
                COALESCE(purchases.qty, 0) - COALESCE(sales.qty, 0) + COALESCE(returns_in.qty, 0) - COALESCE(returns_out.qty, 0) + COALESCE(adjustments.qty, 0)
              ) AS INTEGER) AS stock_packets,
              CASE
                WHEN COALESCE(net_cost.total_packets, 0) > 0 THEN net_cost.total_net_amount / net_cost.total_packets
                ELSE p.purchase_rate
              END AS actual_rate,
              latest_purchase.net_rate AS latest_net_rate
            FROM products p
            LEFT JOIN manufacturer_brands mb ON LOWER(TRIM(mb.brand_name)) = LOWER(TRIM(p.brand))
            LEFT JOIN suppliers s ON s.id = mb.supplier_id
            LEFT JOIN suppliers s2 ON LOWER(TRIM(s2.name)) = LOWER(TRIM(mb.company_name))
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
            LEFT JOIN (
              SELECT pi.item_code, SUM(pi.packets) as total_packets, SUM(pi.net_rate * pi.packets) as total_net_amount
              FROM purchase_items pi JOIN purchases pu ON pi.purchase_id = pu.id
              WHERE pu.is_posted = 1 AND pi.net_rate > 0
              GROUP BY pi.item_code
            ) net_cost ON net_cost.item_code = p.item_code
            LEFT JOIN (
              SELECT item_code, net_rate FROM (
                SELECT 
                  pi.item_code, 
                  pi.net_rate,
                  ROW_NUMBER() OVER (PARTITION BY pi.item_code ORDER BY pu.id DESC, pi.id DESC) as rn
                FROM purchase_items pi
                JOIN purchases pu ON pi.purchase_id = pu.id
                WHERE pu.is_posted = 1 AND pi.net_rate > 0
              ) ranked
              WHERE rn = 1
            ) latest_purchase ON latest_purchase.item_code = p.item_code
          ) stock_data
          WHERE stock_packets > 0
          ORDER BY supplier_name, category, item_code
        `);
        return res.rows;
      } catch (err) {
        console.error('Error in get-supplier-stock-report:', err);
        return { error: err.message };
      }
    }

    case 'get-stock-report': {
      try {
        const res = await query(`
          SELECT 
            SUM(stock_packets * purchase_rate) as total_purchase_value,
            SUM(stock_packets * sale_rate) as total_sale_value,
            SUM(stock_packets) as total_items_in_stock
          FROM (
            SELECT p.purchase_rate, p.sale_rate,
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
          ) as stock_data
          WHERE stock_packets > 0
        `);
        return res.rows[0] || {};
      } catch (err) {
        console.error('Error in get-stock-report:', err);
        return { error: err.message };
      }
    }


    case 'get-receipt-settings': {
      try {
        const settingsPath = require('path').join(require('electron').app.getPath('userData'), 'receipt_settings.json');
        if (require('fs').existsSync(settingsPath)) {
          return JSON.parse(require('fs').readFileSync(settingsPath, 'utf8'));
        }
        return { copies: 1, printOnSave: true }; // default
      } catch (err) {
        console.error('Error reading receipt settings:', err);
        return {};
      }
    }

    case 'save-receipt-settings': {
      try {
        const settingsPath = require('path').join(require('electron').app.getPath('userData'), 'receipt_settings.json');
        require('fs').writeFileSync(settingsPath, JSON.stringify(data, null, 2), 'utf8');
        return { success: true };
      } catch (err) {
        console.error('Error saving receipt settings:', err);
        return { error: err.message };
      }
    }

    case 'get-gl-accounts': {
      let q = 'SELECT * FROM gl_accounts WHERE 1=1';
      const params = [];
      if (data && data.type) {
        params.push(data.type);
        q += ` AND account_type = $${params.length}`;
      } else if (data && Array.isArray(data.types) && data.types.length > 0) {
        const placeholders = data.types.map(t => {
          params.push(t);
          return `$${params.length}`;
        }).join(', ');
        q += ` AND account_type IN (${placeholders})`;
      }
      if (data && data.searchTerm) {
        params.push(`%${data.searchTerm}%`);
        q += ` AND account_name ILIKE $${params.length}`;
      }
      if (data && data.excludeExpenseAccounts) {
        q += ` AND LOWER(TRIM(account_name)) NOT IN (SELECT LOWER(TRIM(account_name)) FROM expense_accounts)`;
      }
      q += ' ORDER BY account_name';
      const r = await query(q, params);
      return r.rows;
    }
    case 'add-gl-account': {
      const { account_name, account_type, opening_balance, balance_type: rawBalanceType } = data;
      const balance_type = normalizeBalanceType(rawBalanceType);
      let refId = null;
      if (account_type === 'Customer') {
        const custName = account_name.startsWith('Customer - ') ? account_name.replace('Customer - ', '') : account_name;
        const exist = await query('SELECT id FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [custName]);
        if (exist.rows.length > 0) {
          refId = exist.rows[0].id;
        } else {
          const newC = await query('INSERT INTO customers (name) VALUES ($1) RETURNING id', [custName]);
          refId = newC.rows[0].id;
        }
        broadcast('customers');
      } else if (account_type === 'Supplier') {
        const suppName = account_name.startsWith('Supplier - ') ? account_name.replace('Supplier - ', '') : account_name;
        const exist = await query('SELECT id FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [suppName]);
        if (exist.rows.length > 0) {
          refId = exist.rows[0].id;
        } else {
          const newS = await query('INSERT INTO suppliers (name, initial_balance) VALUES ($1, $2) RETURNING id', [suppName, parseFloat(opening_balance) || 0]);
          refId = newS.rows[0].id;
        }
        broadcast('suppliers');
      }
      await query(
        'INSERT INTO gl_accounts (account_name, account_type, reference_id, opening_balance, balance_type) VALUES ($1, $2, $3, $4, $5)',
        [account_name, account_type, refId, opening_balance || 0, balance_type]
      );
      broadcast('gl-accounts');
      return { success: true };
    }
    case 'update-gl-account': {
      const { id, account_name, account_type, opening_balance, balance_type: rawBalanceType } = data;
      const balance_type = normalizeBalanceType(rawBalanceType);
      if (account_type === 'Customer') {
        const custName = account_name.startsWith('Customer - ') ? account_name.replace('Customer - ', '') : account_name;
        const glRow = await query('SELECT reference_id FROM gl_accounts WHERE id = $1', [id]);
        const refId = glRow.rows[0]?.reference_id;
        if (refId) {
          await query('UPDATE customers SET name = $1 WHERE id = $2', [custName, refId]);
        } else {
          const exist = await query('SELECT id FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [custName]);
          if (exist.rows.length > 0) {
            await query('UPDATE gl_accounts SET reference_id = $1 WHERE id = $2', [exist.rows[0].id, id]);
          } else {
            const newC = await query('INSERT INTO customers (name) VALUES ($1) RETURNING id', [custName]);
            await query('UPDATE gl_accounts SET reference_id = $1 WHERE id = $2', [newC.rows[0].id, id]);
          }
        }
        broadcast('customers');
      } else if (account_type === 'Supplier') {
        const suppName = account_name.startsWith('Supplier - ') ? account_name.replace('Supplier - ', '') : account_name;
        const glRow = await query('SELECT reference_id FROM gl_accounts WHERE id = $1', [id]);
        const refId = glRow.rows[0]?.reference_id;
        if (refId) {
          await query('UPDATE suppliers SET name = $1 WHERE id = $2', [suppName, refId]);
        } else {
          const exist = await query('SELECT id FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [suppName]);
          if (exist.rows.length > 0) {
            await query('UPDATE gl_accounts SET reference_id = $1 WHERE id = $2', [exist.rows[0].id, id]);
          } else {
            const newS = await query('INSERT INTO suppliers (name, initial_balance) VALUES ($1, $2) RETURNING id', [suppName, parseFloat(opening_balance) || 0]);
            await query('UPDATE gl_accounts SET reference_id = $1 WHERE id = $2', [newS.rows[0].id, id]);
          }
        }
        broadcast('suppliers');
      }
      await query(
        'UPDATE gl_accounts SET account_name=$1, account_type=$2, opening_balance=$3, balance_type=$4 WHERE id=$5',
        [account_name, account_type, opening_balance || 0, balance_type, id]
      );
      broadcast('gl-accounts');
      return { success: true };
    }
    case 'delete-gl-account': {
      await query('DELETE FROM gl_accounts WHERE id=$1', [data]);
      broadcast('gl-accounts');
      return { success: true };
    }
    case 'get-account-closing-balance': {
      try {
        return await getAccountClosingBalance(data || {});
      } catch (err) {
        console.error('Error fetching account closing balance:', err);
        return { signed_balance: 0, closing_balance: 0, balance_type: 'Dr', account_name: '', error: err.message };
      }
    }
    case 'get-vouchers': {
      const { startDate, endDate, type } = data || {};
      let q = 'SELECT * FROM vouchers WHERE 1=1';
      const params = [];
      if (startDate) { params.push(startDate); q += ` AND voucher_date >= $${params.length}`; }
      if (endDate) { params.push(endDate); q += ` AND voucher_date <= $${params.length}`; }
      if (type) { params.push(type); q += ` AND voucher_type = $${params.length}`; }
      q += ' ORDER BY id DESC LIMIT 500';
      const r = await query(q, params);
      return r.rows;
    }
    case 'get-voucher-details': {
      const r = await query('SELECT vd.*, a.account_name FROM voucher_details vd JOIN gl_accounts a ON vd.account_id = a.id WHERE vd.voucher_id=$1 ORDER BY vd.id', [data]);
      return r.rows;
    }
    case 'save-voucher': {
      const { id, voucher_no, voucher_date, voucher_type, remarks, user_id, details } = data;
      let voucher_id = id;

      if (id) {
        await query(
          'UPDATE vouchers SET voucher_no=$1, voucher_date=$2, voucher_type=$3, remarks=$4, user_id=$5 WHERE id=$6',
          [voucher_no, voucher_date, voucher_type, remarks || '', user_id || null, id]
        );
        await query('DELETE FROM voucher_details WHERE voucher_id=$1', [id]);
      } else {
        const v_res = await query(
          'INSERT INTO vouchers (voucher_no, voucher_date, voucher_type, remarks, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [voucher_no, voucher_date, voucher_type, remarks || '', user_id || null]
        );
        voucher_id = v_res.rows[0].id;
      }

      for (const d of details) {
        await query(
          'INSERT INTO voucher_details (voucher_id, account_id, description, reference_no, debit, credit) VALUES ($1, $2, $3, $4, $5, $6)',
          [voucher_id, d.account_id, d.description || '', d.reference_no || '', d.debit || 0, d.credit || 0]
        );
      }
      broadcast('vouchers');
      broadcast('customers');
      broadcast('suppliers');
      broadcast('gl-accounts');
      return { success: true, id: voucher_id };
    }
    case 'delete-voucher': {
      await query('DELETE FROM vouchers WHERE id=$1', [data]);
      broadcast('vouchers');
      broadcast('customers');
      broadcast('suppliers');
      broadcast('gl-accounts');
      return { success: true };
    }
    case 'get-ledger-report': {
      try {
        return await getBankStatementData(data || {});
      } catch (err) {
        console.error('Error in get-ledger-report:', err);
        return { account: null, transactions: [], initial_balance: 0, final_balance: 0, total_debit: 0, total_credit: 0, error: err.message };
      }
    }
    case 'get-cash-activity-report': {
      const { startDate, endDate } = data;
      const r = await query(`
        SELECT a.id, a.account_name, 
               COALESCE(SUM(vd.debit) FILTER (WHERE v.voucher_date < $1), 0) - COALESCE(SUM(vd.credit) FILTER (WHERE v.voucher_date < $1), 0) as prior_balance,
               COALESCE(SUM(vd.debit) FILTER (WHERE v.voucher_date >= $1 AND v.voucher_date <= $2), 0) as period_debit,
               COALESCE(SUM(vd.credit) FILTER (WHERE v.voucher_date >= $1 AND v.voucher_date <= $2), 0) as period_credit
        FROM gl_accounts a
        LEFT JOIN voucher_details vd ON a.id = vd.account_id
        LEFT JOIN vouchers v ON vd.voucher_id = v.id
        WHERE a.account_type IN ('Bank', 'Cash')
        GROUP BY a.id, a.account_name
      `, [startDate || null, endDate || null]);
      return r.rows;
    }

    case 'export-database-dump': {
      const exportData = {};
      for (const t of BACKUP_TABLES) {
        const res = await query(`SELECT * FROM ${t} ORDER BY id`);
        exportData[t] = res.rows;
      }
      for (const t of BACKUP_TABLES_NO_ID) {
        const res = await query(`SELECT * FROM ${t}`);
        exportData[t] = res.rows;
      }
      return exportData;
    }
    case 'import-database-restore': {
      try {
        const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
        if (win) {
          const { response } = await dialog.showMessageBox(win, {
            type: 'warning',
            buttons: ['Deny / Cancel', 'Accept & Restore Database'],
            defaultId: 0,
            cancelId: 0,
            title: '⚠️ Remote Database Restore Request',
            message: 'A Client PC is requesting to restore/overwrite the store database from a backup file.\n\nDo you want to ACCEPT and replace all database records with this backup?'
          });
          if (response !== 1) {
            return { success: false, error: 'Restore request was denied on the Server PC.' };
          }
        }
      } catch (e) {
        console.error('[ImportRestore] Dialog error:', e);
      }
      return await runRestoreData(data);
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
  'get-receipt-settings', 'save-receipt-settings',
  'get-local-ips', 'test-db-connection', 'test-client-connection', 'setup-database',
  'get-backup-settings', 'set-backup-path', 'test-backup', 'restore-from-backup',
  'relaunch-app', 'select-backup-dir', 'get-printers', 'print-receipt', 'save-invoice-pdf', 'print-pdf', 'print-barcodes-pdf', 'print-raw',
  'select-json-file', 'read-file'
]);

function registerIPC() {
  const channels = [
    'check-any-users', 'register', 'login',
    'get-genders', 'add-gender', 'update-gender', 'delete-gender',
    'get-categories', 'add-category', 'update-category', 'delete-category',
    'get-size-ranges', 'add-size-range', 'update-size-range', 'delete-size-range',
    'get-packings', 'add-packing', 'update-packing', 'delete-packing',
    'get-brands', 'add-brand', 'update-brand', 'delete-brand',
    'get-cities', 'add-city',
    'get-expense-accounts', 'add-expense-account', 'update-expense-account', 'delete-expense-account',
    'get-purchase-expenses', 'get-freight-report', 'get-freight-ledger',
    'get-manufacturers', 'add-manufacturer', 'update-manufacturer', 'delete-manufacturer',
    'get-next-item-code', 'save-product', 'update-product', 'get-products', 'get-products-chunked', 'get-product-by-code', 'search-products', 'delete-product', 'save-product-photo', 'get-product-photo', 'start-new-item-session', 'get-item-sessions', 'get-products-by-session', 'get-products-by-session-range', 'check-duplicate-product',
    'get-companies', 'save-company', 'delete-company',
    'get-profit-rules', 'save-profit-rule', 'delete-profit-rule',
    'get-manufacturer-brands', 'get-raw-manufacturer-brands', 'save-manufacturer-discounts-bulk', 'get-suppliers-list',
    'get-overall-profit', 'save-overall-profit', 'confirm-dialog', 'alert-dialog',
    'get-stock-list', 'get-stock-list-chunked', 'get-stock-single', 'adjust-stock',
    'save-purchase', 'update-purchase', 'get-purchases', 'get-purchase-items', 'delete-purchase', 'post-purchase', 'post-purchase-bulk', 'get-purchase-barcode-data',
    'save-purchase-return', 'update-purchase-return', 'get-purchase-returns', 'get-purchase-return-items', 'delete-purchase-return', 'get-next-purchase-return-no', 'save-purchase-return-pdf', 'print-purchase-return-html', 'save-manufacturer-stock-pdf', 'print-manufacturer-stock-html',
    'get-suppliers-ledger', 'update-supplier', 'update-supplier-balance', 'delete-supplier', 'add-supplier-payment', 'get-supplier-statement',
    'save-sale', 'update-sale', 'get-sales', 'get-sale-items', 'delete-sale', 'get-next-invoice-no',
    'get-customers', 'add-customer', 'get-customer-balance', 'update-customer', 'update-customer-balance', 'get-customer-statement', 'add-customer-payment',
    'save-sales-return', 'update-sales-return', 'get-sales-returns', 'get-sales-return-items', 'delete-sales-return', 'get-next-return-no',
    'get-report-summary', 'get-report-top-items', 'get-daily-report', 'get-user-report', 'get-date-summary', 'get-sales-report', 'get-stock-report', 'get-supplier-stock-report',
    'get-users', 'add-user', 'create-user', 'update-user', 'delete-user',
    'get-payment-accounts', 'save-payment-accounts',
    'get-network-settings', 'save-network-settings', 'get-network-config', 'save-network-config',
    'get-receipt-settings', 'save-receipt-settings',
    'get-local-ips', 'test-db-connection', 'test-client-connection', 'setup-database',
    'get-backup-settings', 'set-backup-path', 'test-backup', 'restore-from-backup', 'export-database-dump',
    'get-gl-accounts', 'add-gl-account', 'update-gl-account', 'delete-gl-account', 'get-account-closing-balance',
    'get-vouchers', 'get-voucher-details', 'save-voucher', 'delete-voucher',
    'get-ledger-report', 'get-cash-activity-report'
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
    return new Promise((resolve) => {
      try {
        let htmlContent = '';
        let printerName = null;
        let copies = 2; // default: seller + buyer

        if (typeof receiptData === 'string') {
          htmlContent = receiptData;
        } else if (receiptData && receiptData.html) {
          htmlContent = receiptData.html;
          printerName = receiptData.printer;
          if (receiptData.copies !== undefined) copies = receiptData.copies;
        }

        if (!htmlContent) {
          return resolve({ success: false, error: 'No HTML content provided' });
        }

        const printWin = new BrowserWindow({
          show: false,
          webPreferences: { nodeIntegration: true, contextIsolation: false }
        });

        printWin.loadURL(`data:text/html;base64,${Buffer.from(htmlContent || '').toString('base64')}`);

        // Guard against did-finish-load firing multiple times (known Electron issue with data URLs)
        let printed = false;
        printWin.webContents.on('did-finish-load', () => {
          if (printed) return;
          printed = true;

          const printOptions = {
            silent: true,
            printBackground: true,
            copies
          };

          if (printerName) {
            printOptions.deviceName = printerName;
            printOptions.silent = true;
          }

          printWin.webContents.print(printOptions, (success, errorType) => {
            printWin.close();
            if (success) {
              resolve({ success: true });
            } else {
              resolve({ success: false, error: errorType || 'Print failed' });
            }
          });
        });
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    });
  });

  // Save invoice/receipt HTML as a PDF file at a location the user chooses
  ipcMain.handle('save-invoice-pdf', async (event, data) => {
    let htmlContent = '';
    let defaultFileName = 'Invoice.pdf';
    if (typeof data === 'string') {
      htmlContent = data;
    } else if (data && data.html) {
      htmlContent = data.html;
      if (data.fileName) defaultFileName = data.fileName;
    }
    if (!htmlContent) return { success: false, error: 'No HTML content provided' };

    const parentWin = BrowserWindow.fromWebContents(event.sender);
    const saveResult = await dialog.showSaveDialog(parentWin, {
      title: 'Save Invoice as PDF',
      defaultPath: path.join(app.getPath('documents'), defaultFileName),
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });
    if (saveResult.canceled || !saveResult.filePath) return { success: false, canceled: true };

    return new Promise((resolve) => {
      try {
        const pdfWin = new BrowserWindow({
          show: false,
          webPreferences: { nodeIntegration: true, contextIsolation: false }
        });

        pdfWin.loadURL(`data:text/html;base64,${Buffer.from(htmlContent || '').toString('base64')}`);

        pdfWin.webContents.on('did-finish-load', async () => {
          try {
            const pdfBuffer = await pdfWin.webContents.printToPDF({
              printBackground: true,
              marginsType: 1,
              pageSize: 'A4',
              landscape: false
            });
            fs.writeFileSync(saveResult.filePath, pdfBuffer);
            pdfWin.close();
            require('electron').shell.openPath(saveResult.filePath);
            resolve({ success: true, filePath: saveResult.filePath });
          } catch (err) {
            pdfWin.close();
            resolve({ success: false, error: err.message });
          }
        });
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    });
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
          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { }
          try { if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath); } catch { }
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

  ipcMain.handle('select-json-file', async (event) => {
    const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      properties: ['openFile'],
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) throw new Error('File not found');
    return fs.readFileSync(filePath, 'utf-8');
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