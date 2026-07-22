import sys
file_path = 'd:/projects/SHOP/electron/main.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

save_find = """        case 'save-purchase': {
          const { purchaseDate, invoiceNo, supplierName, items, discount, miscCharges, notes, supplierInvNo, supplierDate, vehicleNo, godown } = data;
          const total = items.reduce((s, i) => s + i.amount, 0) - (discount || 0) + (miscCharges || 0);"""

save_replace = """        case 'save-purchase': {
          const { purchaseDate, invoiceNo, supplierName, items, expenses, discount, miscCharges, purchaseExpenseTotal, notes, supplierInvNo, supplierDate, vehicleNo, godown } = data;
          const total = items.reduce((s, i) => s + i.amount, 0) - (discount || 0) + (miscCharges || 0) + (purchaseExpenseTotal || 0);"""

content = content.replace(save_find, save_replace)

save_items_find = """          for (const item of items) {
            await query(
              'INSERT INTO purchase_items (purchase_id, item_code, item_description, packets, packing_qty, rate, amount, pre_disc_price, flat_discount, disc_pct, discount_amount, net_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
              [purchaseId, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.rate, item.amount, item.preDiscPrice || 0, item.flatDiscount || 0, item.discPct || 0, item.discountAmount || 0, item.netRate || 0]
            );
          }"""

save_items_replace = """          for (const item of items) {
            await query(
              'INSERT INTO purchase_items (purchase_id, item_code, item_description, packets, packing_qty, rate, amount, pre_disc_price, flat_discount, disc_pct, discount_amount, net_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
              [purchaseId, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.rate, item.amount, item.preDiscPrice || 0, item.flatDiscount || 0, item.discPct || 0, item.discountAmount || 0, item.netRate || 0]
            );
          }
          if (expenses && expenses.length > 0) {
            for (const exp of expenses) {
              await query(
                'INSERT INTO purchase_expenses (purchase_id, expense_account_id, cartons, rate, amount) VALUES ($1, $2, $3, $4, $5)',
                [purchaseId, exp.expense_account_id, exp.cartons || 0, exp.rate || 0, exp.amount || 0]
              );
            }
          }"""

content = content.replace(save_items_find, save_items_replace)

update_find = """        case 'update-purchase': {
          const { id, purchaseDate, invoiceNo, supplierName, items, discount, miscCharges, notes, supplierInvNo, supplierDate, vehicleNo, godown } = data;
          const total = items.reduce((s, i) => s + i.amount, 0) - (discount || 0) + (miscCharges || 0);"""

update_replace = """        case 'update-purchase': {
          const { id, purchaseDate, invoiceNo, supplierName, items, expenses, discount, miscCharges, purchaseExpenseTotal, notes, supplierInvNo, supplierDate, vehicleNo, godown } = data;
          const total = items.reduce((s, i) => s + i.amount, 0) - (discount || 0) + (miscCharges || 0) + (purchaseExpenseTotal || 0);"""

content = content.replace(update_find, update_replace)

update_items_find = """          for (const item of items) {
            await query(
              'INSERT INTO purchase_items (purchase_id, item_code, item_description, packets, packing_qty, rate, amount, pre_disc_price, flat_discount, disc_pct, discount_amount, net_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
              [id, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.rate, item.amount, item.preDiscPrice || 0, item.flatDiscount || 0, item.discPct || 0, item.discountAmount || 0, item.netRate || 0]
            );
          }"""

update_items_replace = """          for (const item of items) {
            await query(
              'INSERT INTO purchase_items (purchase_id, item_code, item_description, packets, packing_qty, rate, amount, pre_disc_price, flat_discount, disc_pct, discount_amount, net_rate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
              [id, item.itemCode, item.itemDescription, item.packets, item.packingQty || 0, item.rate, item.amount, item.preDiscPrice || 0, item.flatDiscount || 0, item.discPct || 0, item.discountAmount || 0, item.netRate || 0]
            );
          }
          await query('DELETE FROM purchase_expenses WHERE purchase_id=$1', [id]);
          if (expenses && expenses.length > 0) {
            for (const exp of expenses) {
              await query(
                'INSERT INTO purchase_expenses (purchase_id, expense_account_id, cartons, rate, amount) VALUES ($1, $2, $3, $4, $5)',
                [id, exp.expense_account_id, exp.cartons || 0, exp.rate || 0, exp.amount || 0]
              );
            }
          }"""

content = content.replace(update_items_find, update_items_replace)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated main.js purchase endpoints')
