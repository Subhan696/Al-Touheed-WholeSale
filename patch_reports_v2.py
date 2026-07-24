import re

with open(r'd:\projects\SHOP\electron\main.js', 'r', encoding='utf-8') as f:
    content = f.read()

cases_start = content.find("case 'get-daily-report': {")
if cases_start != -1:
    content = content[:cases_start]
else:
    cases_start = content.find("default:\n      throw new Error(`No handler registered for '${channel}'`);\n  }\n}\n\n// ── Client mode forwarding ──")
    if cases_start != -1:
        content = content[:cases_start]

cases = """
    case 'get-daily-report': {
      try {
        const { startDate, endDate, startTime, endTime } = data;
        const start = startDate;
        const end = endDate;

        const hasTimeFilter = !!(startTime || endTime);
        let timeClause = '';
        if (hasTimeFilter) {
          const tStart = startTime ? `${startTime}:00` : '00:00:00';
          const tEnd = endTime ? `${endTime}:59` : '23:59:59';
          timeClause = ` AND created_at::time >= '${tStart}' AND created_at::time <= '${tEnd}'`;
        }

        const salesRes = await query(`
          SELECT id, invoice_no, sale_date, created_at, customer_name, total_amount, total_packets as total_quantity, payment_method, discount, misc_charges
          FROM sales
          WHERE sale_date::date BETWEEN $1 AND $2${timeClause}
          ORDER BY sale_date ASC, created_at ASC
        `, [start, end]);
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

          let digital = 0;
          const breakdown = {};
          if (sale.payment_method) {
            const parts = sale.payment_method.split(',');
            for (const part of parts) {
              const colonIdx = part.lastIndexOf(':');
              if (colonIdx === -1) continue;
              const fullMethod = part.slice(0, colonIdx).trim();
              const methodName = fullMethod.toLowerCase();
              const amt = parseFloat(part.slice(colonIdx + 1).trim()) || 0;

              if (methodName.includes('jazzcash') || methodName.includes('easypais') || methodName.includes('raast') || methodName.includes('transfer') || methodName.includes('bank')) {
                digital += amt;
                breakdown[fullMethod] = (breakdown[fullMethod] || 0) + amt;
              }
            }
          }
          if (digital === 0 && sale.payment_method) {
            const pm = sale.payment_method.toLowerCase();
            const netAmt = (parseFloat(sale.total_amount) || 0) + (parseFloat(sale.misc_charges) || 0) - (parseFloat(sale.discount) || 0);
            if (pm.includes('jazzcash') || pm.includes('easypais') || pm.includes('raast') || pm.includes('transfer') || pm.includes('bank')) {
              digital = netAmt;
              breakdown[sale.payment_method] = netAmt;
            }
          }

          const billAmt = (parseFloat(sale.total_amount) || 0) + (parseFloat(sale.misc_charges) || 0) - (parseFloat(sale.discount) || 0);
          const cash = billAmt - digital;

          const totalProfit = items.reduce((s, i) => s + (parseFloat(i.profit) || 0), 0) + (parseFloat(sale.misc_charges) || 0) - (parseFloat(sale.discount) || 0);
          enrichedSales.push({ ...sale, items, cash, digital, profit: totalProfit, breakdown });
        }

        const returnsRes = await query(`
          SELECT id, return_no, invoice_no, return_date, created_at, customer_name, total_amount
          FROM sales_returns
          WHERE return_date::date BETWEEN $1 AND $2${timeClause}
          ORDER BY return_date ASC, created_at ASC
        `, [start, end]);
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
          const items = itemsRes.rows.map(i => ({
            ...i,
            profit: ((parseFloat(i.sale_rate) || 0) - (parseFloat(i.purchase_rate) || 0)) * (parseFloat(i.quantity) || 0)
          }));
          enrichedReturns.push({ ...ret, items });
        }

        const totalSales = enrichedSales.reduce((sum, s) => sum + ((parseFloat(s.total_amount) || 0) + (parseFloat(s.misc_charges) || 0) - (parseFloat(s.discount) || 0)), 0);
        const totalSoldItems = enrichedSales.reduce((sum, s) => sum + (parseFloat(s.total_quantity) || 0), 0);
        const totalReturns = enrichedReturns.reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0);
        const totalReturnedItems = enrichedReturns.reduce((sum, r) => sum + r.items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0), 0);
        const grossProfit = enrichedSales.reduce((sum, s) => sum + (parseFloat(s.profit) || 0), 0);
        const profitLostOnReturns = enrichedReturns.reduce((sum, r) => sum + r.items.reduce((s, i) => s + (parseFloat(i.profit) || 0), 0), 0);
        const netProfit = grossProfit - profitLostOnReturns;
        const totalCash = enrichedSales.reduce((sum, s) => sum + s.cash, 0);
        const totalDigital = enrichedSales.reduce((sum, s) => sum + s.digital, 0);
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
          returns: enrichedReturns,
          summary: {
            totalSales, totalSoldItems, totalReturns, totalReturnedItems,
            netSales: totalSales - totalReturns,
            totalCash, netCash, totalDigital, digitalBreakdown,
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
          
          let userCash = 0, userDigital = 0;
          iRes.rows.forEach(row => {
            let digital = 0;
            if (row.payment_method) {
              const parts = row.payment_method.split(',');
              for (const part of parts) {
                const colonIdx = part.lastIndexOf(':');
                if (colonIdx === -1) continue;
                const methodName = part.slice(0, colonIdx).trim().toLowerCase();
                const amt = parseFloat(part.slice(colonIdx + 1).trim()) || 0;
                if (methodName.includes('jazzcash') || methodName.includes('easypais') || methodName.includes('raast') || methodName.includes('transfer') || methodName.includes('bank')) {
                  digital += amt;
                }
              }
            }
            if (digital === 0 && row.payment_method) {
              const pm = row.payment_method.toLowerCase();
              const netAmt = (parseFloat(row.total_amount) || 0) + (parseFloat(row.misc_charges) || 0) - (parseFloat(row.discount) || 0);
              if (pm.includes('jazzcash') || pm.includes('easypais') || pm.includes('raast') || pm.includes('transfer') || pm.includes('bank')) {
                digital = netAmt;
              }
            }
            userDigital += digital;
            const billAmt = (parseFloat(row.total_amount) || 0) + (parseFloat(row.misc_charges) || 0) - (parseFloat(row.discount) || 0);
            userCash += (billAmt - digital);
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
              SELECT item_code, SUM(qty) as qty FROM stock_adjustments GROUP BY item_code
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

    default:
      throw new Error(`No handler registered for '${channel}'`);
  }
}

// ── Client mode forwarding ──
function forwardToServer(channel, args) {
  return new Promise((resolve, reject) => {
    request.post({
      url: `${getServerUrl()}/ipc`,
      json: { channel, args }
    }, (err, res, body) => {
      if (err) return reject(err);
      if (body && body.error) return reject(new Error(body.error));
      resolve(body ? body.result : null);
    });
  });
}

// Ensure module.exports is present
module.exports = { setupDatabase, getNextItemCode, generateBackup, printRawData, testDatabaseConnection, printPDF, printBarcodesPDF, getPrinters };
"""

with open(r'd:\projects\SHOP\electron\main.js', 'w', encoding='utf-8') as f:
    f.write(content + cases)
