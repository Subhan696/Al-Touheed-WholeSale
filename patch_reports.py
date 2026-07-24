import re

with open(r'd:\projects\SHOP\electron\main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add to channels array
if "'get-daily-report'" not in content:
    content = content.replace("'get-report-summary', 'get-report-top-items',", "'get-report-summary', 'get-report-top-items',\n    'get-daily-report', 'get-user-report', 'get-date-summary', 'get-sales-report', 'get-stock-report',")

# 2. Extract and remove the old ipcMain handlers at the bottom
# We will just cut off the file right before ipcMain.handle('get-daily-report'
idx = content.find("ipcMain.handle('get-daily-report'")
if idx != -1:
    content = content[:idx]

# 3. Create the cases
cases = """
    case 'get-daily-report': {
      try {
        const { startDate, endDate, startTime, endTime, userId } = data;
        const start = startDate;
        const end = endDate;

        const hasTimeFilter = !!(startTime || endTime);
        let timeClause = '';
        if (hasTimeFilter) {
          const tStart = startTime || '00:00:00';
          const tEnd = endTime || '23:59:59';
          timeClause = ` AND created_at::time >= '${tStart}' AND created_at::time <= '${tEnd}'`;
        }

        let userClause = '';
        let params = [start, end];
        if (userId && userId !== 'all') {
          params.push(userId);
          userClause = ` AND user_id = $${params.length}`;
        }

        const salesRes = await query(`
          SELECT s.id, s.invoice_no, s.sale_date, s.created_at, s.customer_name, s.total_amount, s.total_packets as total_quantity, s.payment_method, s.discount, s.misc_charges, u.username as sold_by
          FROM sales s
          LEFT JOIN users u ON s.user_id = u.id
          WHERE s.sale_date::date BETWEEN $1 AND $2${timeClause}${userClause}
          ORDER BY s.sale_date ASC, s.created_at ASC
        `, params);
        const sales = salesRes.rows;

        const enrichedSales = [];
        for (const sale of sales) {
          const itemsRes = await query(`
            SELECT item_code, item_description, packets as quantity, sale_rate, purchase_rate, amount, profit
            FROM sale_items
            WHERE sale_id = $1
            ORDER BY id
          `, [sale.id]);
          const items = itemsRes.rows;
          let cash = 0, digital = 0, totalProfit = 0;
          let breakdown = {};
          if (sale.payment_method && sale.payment_method.includes(':')) {
            sale.payment_method.split(',').forEach(part => {
              const [method, amtStr] = part.split(':');
              const a = parseFloat(amtStr) || 0;
              breakdown[method.trim()] = a;
              const mLow = method.toLowerCase();
              if (mLow.includes('jazzcash') || mLow.includes('easypais') || mLow.includes('raast') || mLow.includes('bank') || mLow.includes('transfer')) digital += a;
              else if (mLow.includes('cash')) cash += a;
            });
          } else {
            const mLow = (sale.payment_method || '').toLowerCase();
            if (mLow.includes('jazzcash') || mLow.includes('easypais') || mLow.includes('raast') || mLow.includes('bank') || mLow.includes('transfer')) digital = parseFloat(sale.total_amount) || 0;
            else if (mLow.includes('cash')) cash = parseFloat(sale.total_amount) || 0;
            if (sale.payment_method) breakdown[sale.payment_method] = parseFloat(sale.total_amount) || 0;
          }
          items.forEach(i => totalProfit += parseFloat(i.profit) || 0);
          enrichedSales.push({ ...sale, items, cash, digital, profit: totalProfit, breakdown });
        }

        const returnsRes = await query(`
          SELECT sr.id, sr.return_no, sr.invoice_no, sr.return_date, sr.created_at, sr.customer_name, sr.total_amount, u.username as returned_by
          FROM sales_returns sr
          LEFT JOIN users u ON sr.user_id = u.id
          WHERE sr.return_date::date BETWEEN $1 AND $2${timeClause}${userClause.replace('user_id', 'sr.user_id')}
          ORDER BY sr.return_date ASC, sr.created_at ASC
        `, params);
        const returns = returnsRes.rows;

        const enrichedReturns = [];
        for (const ret of returns) {
          const itemsRes = await query(`
            SELECT 
              sri.item_code, sri.item_description, sri.packets as quantity, sri.price as sale_rate, sri.amount,
              COALESCE(
                (SELECT purchase_rate FROM sale_items WHERE item_code = sri.item_code LIMIT 1),
                0
              ) as purchase_rate
            FROM sales_return_items sri
            WHERE sri.sales_return_id = $1
            ORDER BY sri.id
          `, [ret.id]);
          const items = itemsRes.rows.map(i => ({ ...i, profit: 0 }));
          enrichedReturns.push({ ...ret, items });
        }

        let eRes;
        if (userId && userId !== 'all') {
          eRes = await query(`SELECT SUM(amount) as total FROM expenses WHERE date::date BETWEEN $1 AND $2 AND user_id = $3`, [start, end, userId]);
        } else {
          eRes = await query(`SELECT SUM(amount) as total FROM expenses WHERE date::date BETWEEN $1 AND $2`, [start, end]);
        }
        const totalExpenses = parseFloat(eRes.rows[0]?.total) || 0;

        let pRes;
        if (userId && userId !== 'all') {
          pRes = await query(`SELECT SUM(amount) as total FROM supplier_payments WHERE date::date BETWEEN $1 AND $2 AND user_id = $3`, [start, end, userId]);
        } else {
          pRes = await query(`SELECT SUM(amount) as total FROM supplier_payments WHERE date::date BETWEEN $1 AND $2`, [start, end]);
        }
        const totalPurchases = parseFloat(pRes.rows[0]?.total) || 0;

        return {
          sales: enrichedSales,
          returns: enrichedReturns,
          expenses: totalExpenses,
          purchases: totalPurchases
        };
      } catch (err) {
        console.error('Error in get-daily-report:', err);
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
          
          let userCash = 0, userDigital = 0;
          iRes.rows.forEach(row => {
            if (row.payment_method) {
              row.payment_method.split(',').forEach(part => {
                const colonIdx = part.lastIndexOf(':');
                if (colonIdx > -1) {
                  const p = part.slice(0, colonIdx).toLowerCase();
                  const amt = parseFloat(part.slice(colonIdx + 1)) || 0;
                  if (p.includes('jazzcash') || p.includes('easypais') || p.includes('raast') || p.includes('bank') || p.includes('transfer')) userDigital += amt;
                  else if (p.includes('cash')) userCash += amt;
                }
              });
            }
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
                const p = part.slice(0, colonIdx).toLowerCase();
                const amt = parseFloat(part.slice(colonIdx + 1)) || 0;
                if (p.includes('jazzcash') || p.includes('easypais') || p.includes('raast') || p.includes('bank') || p.includes('transfer')) digital += amt;
                else if (p.includes('cash')) cash += amt;
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
        const res = await query(`
          SELECT 
            si.item_code, si.item_description as description, SUM(si.packets) as qty,
            SUM(si.amount) as amount, SUM(si.profit) as profit
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          WHERE s.sale_date::date BETWEEN $1 AND $2
          GROUP BY si.item_code, si.item_description
          ORDER BY qty DESC
        `, [startDate, endDate]);
        return res.rows;
      } catch (err) {
        console.error('Error in get-sales-report:', err);
        return { error: err.message };
      }
    }

    case 'get-stock-report': {
      try {
        const res = await query(`
          SELECT 
            SUM(COALESCE(available_stock, stock_qty) * purchase_rate) as total_purchase_value,
            SUM(COALESCE(available_stock, stock_qty) * sale_rate) as total_sale_value,
            SUM(COALESCE(available_stock, stock_qty)) as total_items_in_stock
          FROM products
          WHERE COALESCE(available_stock, stock_qty) > 0
        `);
        return res.rows[0] || {};
      } catch (err) {
        console.error('Error in get-stock-report:', err);
        return { error: err.message };
      }
    }
"""

if "case 'get-daily-report':" not in content:
    content = content.replace("default:", cases + "\n    default:")

with open(r'd:\projects\SHOP\electron\main.js', 'w', encoding='utf-8') as f:
    f.write(content)
