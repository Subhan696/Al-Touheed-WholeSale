import sys
file_path = 'd:/projects/SHOP/electron/main.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update save-purchase
save_find = """        for (const item of items) {
          await query(
            'INSERT INTO purchase_items (purchase_id, item_code, item_description, packets, packing_qty, rate, amount, pre_disc_price, flat_discount, disc_pct, discount_amount, net_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [purchaseId, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.rate, item.amount, item.preDiscPrice || 0, item.flatDiscount || 0, item.discPct || 0, item.discountAmount || 0, item.netRate || 0]
          );
        }"""

save_replace = """        for (const item of items) {
          await query(
            'INSERT INTO purchase_items (purchase_id, item_code, item_description, packets, packing_qty, rate, amount, pre_disc_price, flat_discount, disc_pct, discount_amount, net_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [purchaseId, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.rate, item.amount, item.preDiscPrice || 0, item.flatDiscount || 0, item.discPct || 0, item.discountAmount || 0, item.netRate || 0]
          );
        }
        if (data.expenses) {
          for (const exp of data.expenses) {
            await query(
              'INSERT INTO purchase_expenses (purchase_id, expense_account_id, account_name, cartons, rate, amount, remarks) VALUES ($1,$2,$3,$4,$5,$6,$7)',
              [purchaseId, exp.expense_account_id, exp.account_name, exp.cartons || 0, exp.rate || 0, exp.amount || 0, exp.remarks || '']
            );
          }
        }"""

content = content.replace(save_find, save_replace)

# Update update-purchase
update_find = """        await query('DELETE FROM purchase_items WHERE purchase_id=$1', [id]);
        for (const item of items) {
          await query(
            'INSERT INTO purchase_items (purchase_id, item_code, item_description, packets, packing_qty, rate, amount, pre_disc_price, flat_discount, disc_pct, discount_amount, net_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [id, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.rate, item.amount, item.preDiscPrice || 0, item.flatDiscount || 0, item.discPct || 0, item.discountAmount || 0, item.netRate || 0]
          );
        }"""

update_replace = """        await query('DELETE FROM purchase_items WHERE purchase_id=$1', [id]);
        for (const item of items) {
          await query(
            'INSERT INTO purchase_items (purchase_id, item_code, item_description, packets, packing_qty, rate, amount, pre_disc_price, flat_discount, disc_pct, discount_amount, net_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
            [id, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.rate, item.amount, item.preDiscPrice || 0, item.flatDiscount || 0, item.discPct || 0, item.discountAmount || 0, item.netRate || 0]
          );
        }
        await query('DELETE FROM purchase_expenses WHERE purchase_id=$1', [id]);
        if (data.expenses) {
          for (const exp of data.expenses) {
            await query(
              'INSERT INTO purchase_expenses (purchase_id, expense_account_id, account_name, cartons, rate, amount, remarks) VALUES ($1,$2,$3,$4,$5,$6,$7)',
              [id, exp.expense_account_id, exp.account_name, exp.cartons || 0, exp.rate || 0, exp.amount || 0, exp.remarks || '']
            );
          }
        }"""

content = content.replace(update_find, update_replace)

get_items_find = """      case 'get-purchase-items': {
        const r = await query('SELECT * FROM purchase_items WHERE purchase_id=$1 ORDER BY id', [data]);
        return r.rows;
      }"""

get_items_replace = """      case 'get-purchase-items': {
        const r = await query('SELECT * FROM purchase_items WHERE purchase_id=$1 ORDER BY id', [data]);
        return r.rows;
      }
      case 'get-purchase-expenses': {
        const r = await query('SELECT * FROM purchase_expenses WHERE purchase_id=$1 ORDER BY id', [data]);
        return r.rows;
      }"""

content = content.replace(get_items_find, get_items_replace)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated main.js purchase queries')
