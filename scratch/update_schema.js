const fs = require('fs');
const path = require('path');

const mainJsPath = path.join(__dirname, '../electron/main.js');
let content = fs.readFileSync(mainJsPath, 'utf8');

if (!content.includes('ALTER TABLE products ADD COLUMN IF NOT EXISTS gender')) {
  content = content.replace(
    /await query\('ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS packing_qty INTEGER NOT NULL DEFAULT 0'\);/,
    `await query('ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS packing_qty INTEGER NOT NULL DEFAULT 0');\n  await query("ALTER TABLE products ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT ''");`
  );
  fs.writeFileSync(mainJsPath, content, 'utf8');
  console.log('Added gender column migration');
} else {
  console.log('Gender column migration already exists');
}
