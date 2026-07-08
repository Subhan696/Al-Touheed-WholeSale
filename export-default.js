const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const BACKUP_TABLES = [
  'users', 'genders', 'categories', 'size_ranges', 'packings', 'brands', 'companies', 'profit_rules', 'overall_profit',
  'products', 'stock_adjustments', 'purchases', 'purchase_items', 'purchase_returns', 'purchase_return_items',
  'sales', 'sale_items', 'sales_returns', 'sales_return_items'
];

async function exportDefaultData() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'atg_wholesale',
    user: 'atg_user',
    password: 'atg_pass123'
  });

  try {
    const exportData = {};
    for (const t of BACKUP_TABLES) {
      const res = await pool.query(`SELECT * FROM ${t} ORDER BY id`);
      exportData[t] = res.rows;
    }

    const outPath = path.join(__dirname, 'electron', 'default_data.json');
    fs.writeFileSync(outPath, JSON.stringify(exportData, null, 2));
    console.log('Successfully exported default data to:', outPath);
  } catch (err) {
    console.error('Export failed:', err);
  } finally {
    await pool.end();
  }
}

exportDefaultData();
