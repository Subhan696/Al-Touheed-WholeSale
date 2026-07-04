const fs = require('fs');
const path = require('path');

const mainJsPath = path.join(__dirname, '../electron/main.js');
let content = fs.readFileSync(mainJsPath, 'utf8');

content = content.replace(
  `case 'save-product': {
      const { itemCode, description, category, sizeRange, purchaseRate, saleRate, packingQty } = data;
      const r = await query(
        'INSERT INTO products (item_code, description, category, size_range, purchase_rate, sale_rate, packing_qty) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, item_code',
        [itemCode, description, category, sizeRange, purchaseRate, saleRate, packingQty]
      );`,
  `case 'save-product': {
      const { itemCode, description, gender, category, sizeRange, purchaseRate, saleRate, packingQty, year } = data;
      const r = await query(
        'INSERT INTO products (item_code, description, gender, category, size_range, purchase_rate, sale_rate, packing_qty, year) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, item_code',
        [itemCode, description, gender || '', category || '', sizeRange || '', purchaseRate, saleRate, packingQty, year || '']
      );`
);

content = content.replace(
  `case 'update-product': {
      const { id, itemCode, description, category, sizeRange, purchaseRate, saleRate, packingQty, photoPath } = data;
      await query(
        'UPDATE products SET item_code=$1, description=$2, category=$3, size_range=$4, purchase_rate=$5, sale_rate=$6, packing_qty=$7, photo_path=$8, updated_at=NOW() WHERE id=$9',
        [itemCode, description, category, sizeRange, purchaseRate, saleRate, packingQty, photoPath || null, id]
      );`,
  `case 'update-product': {
      const { id, itemCode, description, gender, category, sizeRange, purchaseRate, saleRate, packingQty, year, photoPath } = data;
      await query(
        'UPDATE products SET item_code=$1, description=$2, gender=$3, category=$4, size_range=$5, purchase_rate=$6, sale_rate=$7, packing_qty=$8, year=$9, photo_path=$10, updated_at=NOW() WHERE id=$11',
        [itemCode, description, gender || '', category || '', sizeRange || '', purchaseRate, saleRate, packingQty, year || '', photoPath || null, id]
      );`
);

// Add data migration to run on startup if gender is empty
// Let's inject a migration after `ALTER TABLE products ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT ''`
content = content.replace(
  `await query("ALTER TABLE products ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT ''");`,
  `await query("ALTER TABLE products ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT ''");
  try {
    // Migration: if gender is empty and category has Boy/Girl, move it
    await query("UPDATE products SET gender = category, category = '' WHERE gender = '' AND category IN ('Boy', 'Girl')");
  } catch(e) { console.error('Migration error:', e); }`
);

fs.writeFileSync(mainJsPath, content, 'utf8');
console.log('Updated save/update product and added migration');
