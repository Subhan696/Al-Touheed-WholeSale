import re

with open(r'd:\projects\SHOP\electron\main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add created_by to products schema and ALTER TABLE
schema_find = """CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        item_code TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,"""
schema_replace = """CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        item_code TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        brand TEXT DEFAULT '',
        gender TEXT DEFAULT '',
        discount NUMERIC(10,2) DEFAULT 0,
        note TEXT DEFAULT '',
        year TEXT DEFAULT '',
        created_by TEXT DEFAULT '',"""

content = content.replace(schema_find, schema_replace)

alter_find = """await query(`
      CREATE TABLE IF NOT EXISTS users"""
alter_replace = """await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT DEFAULT ''`).catch(()=>console.log('brand exists'));
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT ''`).catch(()=>console.log('gender exists'));
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS discount NUMERIC(10,2) DEFAULT 0`).catch(()=>console.log('discount exists'));
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS note TEXT DEFAULT ''`).catch(()=>console.log('note exists'));
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS year TEXT DEFAULT ''`).catch(()=>console.log('year exists'));
    await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT ''`).catch(()=>console.log('created_by exists'));

    await query(`
      CREATE TABLE IF NOT EXISTS users"""

content = content.replace(alter_find, alter_replace)

# 2. Update save-product
save_find = """const { itemCode, description, gender, category, sizeRange, purchaseRate, saleRate, packingQty, year, brand, discount, note, sessionId } = data;
        const r = await query(
          'INSERT INTO products (item_code, description, gender, category, size_range, purchase_rate, sale_rate, packing_qty, year, brand, discount, note, session_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, item_code',
          [itemCode, description, gender || '', category || '', sizeRange || '', purchaseRate, saleRate, packingQty, year || null, brand || '', discount ? parseFloat(discount) : 0, note || '', sessionId || 0]
        );"""

save_replace = """const { itemCode, description, gender, category, sizeRange, purchaseRate, saleRate, packingQty, year, brand, discount, note, sessionId, createdBy } = data;
        const r = await query(
          'INSERT INTO products (item_code, description, gender, category, size_range, purchase_rate, sale_rate, packing_qty, year, brand, discount, note, session_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id, item_code',
          [itemCode, description, gender || '', category || '', sizeRange || '', purchaseRate, saleRate, packingQty, year || null, brand || '', discount ? parseFloat(discount) : 0, note || '', sessionId || 0, createdBy || '']
        );"""
content = content.replace(save_find, save_replace)

# 3. Update get-item-sessions
sessions_find = """SELECT session_id, MIN(created_at) as started_at 
          FROM products 
          WHERE session_id > 0 AND created_at >= CURRENT_DATE
          GROUP BY session_id"""
sessions_replace = """SELECT session_id, MIN(created_at) as started_at, MAX(brand) as brand, MAX(created_by) as created_by
          FROM products 
          WHERE session_id > 0 AND created_at >= CURRENT_DATE
          GROUP BY session_id"""
content = content.replace(sessions_find, sessions_replace)

with open(r'd:\projects\SHOP\electron\main.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("main.js patched")
