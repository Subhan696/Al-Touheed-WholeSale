const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'shopdb',
});

async function getAccountClosingBalance(query, { accountId }) {
  if (!accountId) return { signed_balance: 0, closing_balance: 0, balance_type: 'Dr', account_name: '' };
  const accRow = await query('SELECT * FROM gl_accounts WHERE id = $1', [accountId]);
  const acc = accRow?.rows[0];
  if (!acc) return { signed_balance: 0, closing_balance: 0, balance_type: 'Dr', account_name: '' };
  const account_name = acc.account_name;
  const account_type = acc.account_type;
  const opening_balance = parseFloat(acc.opening_balance) || 0;
  const balance_type = acc.balance_type || 'Dr';
  let totalDebit = 0, totalCredit = 0;

  if (account_type === 'Customer') {
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
          saleTotal += parseFloat(s.total_amount) || 0;
          if (s.payment_method) {
            s.payment_method.split(',').forEach(part => {
              const colonIdx = part.lastIndexOf(':');
              if (colonIdx !== -1) salePaid += parseFloat(part.slice(colonIdx + 1).trim()) || 0;
            });
          }
        });
        const retSum = await query(`SELECT COALESCE(SUM(total_amount),0) as s FROM sales_returns WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM($1))`, [customerName]);
        const vouchSum = await query(
          `SELECT COALESCE(SUM(vd.debit),0) as td, COALESCE(SUM(vd.credit),0) as tc FROM voucher_details vd JOIN vouchers v ON vd.voucher_id = v.id JOIN gl_accounts g ON g.id = vd.account_id WHERE (LOWER(TRIM(g.account_name)) = LOWER(TRIM($1)) OR (g.account_type = 'Customer' AND g.reference_id = $2))`,
          ['Customer - ' + customerName, customerId]
        );
        totalDebit = saleTotal + parseFloat(vouchSum.rows[0].td);
        totalCredit = salePaid + parseFloat(retSum.rows[0].s) + parseFloat(vouchSum.rows[0].tc);
        let running = custInitBal + totalDebit - totalCredit;
        const finalType = running >= 0 ? 'Dr' : 'Cr';
        return { signed_balance: running, closing_balance: Math.abs(running), balance_type: finalType, account_name };
      }
    }
    customerName = account_name.replace(/^Customer\s*-\s*/i, '');
    if (customerName) {
      const custRow = await query('SELECT id, initial_balance FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [customerName]);
      const custId = custRow.rows[0]?.id || 0;
      const custInitBal = parseFloat(custRow.rows[0]?.initial_balance) || 0;
      const salesRows = await query(`SELECT total_amount, payment_method FROM sales WHERE (LOWER(TRIM(customer_name)) = LOWER(TRIM($1)) OR ($2 > 0 AND customer_id = $2))`, [customerName, custId]);
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
      const retSum = await query(`SELECT COALESCE(SUM(total_amount),0) as s FROM sales_returns WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM($1))`, [customerName]);
      const vouchSum = await query(`SELECT COALESCE(SUM(vd.debit),0) as td, COALESCE(SUM(vd.credit),0) as tc FROM voucher_details vd JOIN vouchers v ON vd.voucher_id = v.id JOIN gl_accounts g ON g.id = vd.account_id WHERE (LOWER(TRIM(g.account_name)) = LOWER(TRIM($1)) OR ($2 > 0 AND g.account_type = 'Customer' AND g.reference_id = $2))`, ['Customer - ' + customerName, custId]);
      totalDebit = saleTotal + parseFloat(vouchSum.rows[0].td);
      totalCredit = salePaid + parseFloat(retSum.rows[0].s) + parseFloat(vouchSum.rows[0].tc);
      let running = custInitBal + totalDebit - totalCredit;
      const finalType = running >= 0 ? 'Dr' : 'Cr';
      return { signed_balance: running, closing_balance: Math.abs(running), balance_type: finalType, account_name };
    }
  }

  if (account_type === 'Supplier') {
    let supplierName = null;
    let supplierId = acc.reference_id || 0;
    if (supplierId && supplierId > 0) {
      const s = await query('SELECT name, initial_balance FROM suppliers WHERE id = $1', [supplierId]);
      if (s.rows && s.rows.length > 0) {
        supplierName = s.rows[0].name;
        const suppInitBal = parseFloat(s.rows[0].initial_balance) || 0;
        const purSum = await query(`SELECT COALESCE(SUM(total_amount),0) as s FROM purchases WHERE supplier_name = $1 AND is_posted = 1`, [supplierName]);
        const prSum = await query(`SELECT COALESCE(SUM(total_amount),0) as s FROM purchase_returns WHERE supplier_name = $1 AND is_posted = 1`, [supplierName]);
        const paySum = await query(`SELECT COALESCE(SUM(amount),0) as s FROM supplier_payments WHERE supplier_name = $1`, [supplierName]);
        const vouchSum = await query(
          `SELECT COALESCE(SUM(vd.debit),0) as td, COALESCE(SUM(vd.credit),0) as tc FROM voucher_details vd JOIN vouchers v ON vd.voucher_id = v.id JOIN gl_accounts g ON g.id = vd.account_id WHERE (replace(g.account_name, 'Supplier - ', '') = $1 OR (g.account_type = 'Supplier' AND g.reference_id = $2))`,
          [supplierName, supplierId]
        );
        totalCredit = parseFloat(purSum.rows[0].s) + parseFloat(vouchSum.rows[0].tc);
        totalDebit = parseFloat(prSum.rows[0].s) + parseFloat(paySum.rows[0].s) + parseFloat(vouchSum.rows[0].td);
        let running = suppInitBal + totalCredit - totalDebit;
        const finalType = running >= 0 ? 'Cr' : 'Dr';
        return { signed_balance: -running, closing_balance: Math.abs(running), balance_type: finalType, account_name };
      }
    }
    supplierName = account_name.replace(/^Supplier\s*-\s*/i, '');
    if (supplierName) {
      const suppRow = await query('SELECT id, initial_balance FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [supplierName]);
      const suppId = suppRow.rows[0]?.id || 0;
      const suppInitBal = parseFloat(suppRow.rows[0]?.initial_balance) || 0;
      const purSum = await query(`SELECT COALESCE(SUM(total_amount),0) as s FROM purchases WHERE supplier_name = $1 AND is_posted = 1`, [supplierName]);
      const prSum = await query(`SELECT COALESCE(SUM(total_amount),0) as s FROM purchase_returns WHERE supplier_name = $1 AND is_posted = 1`, [supplierName]);
      const paySum = await query(`SELECT COALESCE(SUM(amount),0) as s FROM supplier_payments WHERE supplier_name = $1`, [supplierName]);
      const vouchSum = await query(`SELECT COALESCE(SUM(vd.debit),0) as td, COALESCE(SUM(vd.credit),0) as tc FROM voucher_details vd JOIN vouchers v ON vd.voucher_id = v.id JOIN gl_accounts g ON g.id = vd.account_id WHERE (replace(g.account_name, 'Supplier - ', '') = $1 OR ($2 > 0 AND g.account_type = 'Supplier' AND g.reference_id = $2))`, [supplierName, suppId]);
      totalCredit = parseFloat(purSum.rows[0].s) + parseFloat(vouchSum.rows[0].tc);
      totalDebit = parseFloat(prSum.rows[0].s) + parseFloat(paySum.rows[0].s) + parseFloat(vouchSum.rows[0].td);
      let running = suppInitBal + totalCredit - totalDebit;
      const finalType = running >= 0 ? 'Cr' : 'Dr';
      return { signed_balance: -running, closing_balance: Math.abs(running), balance_type: finalType, account_name };
    }
  }

  const vouchSum = await query(`SELECT COALESCE(SUM(vd.debit),0) as td, COALESCE(SUM(vd.credit),0) as tc FROM voucher_details vd JOIN vouchers v ON vd.voucher_id = v.id WHERE vd.account_id = $1`, [acc.id]);
  totalDebit = parseFloat(vouchSum.rows[0].td);
  totalCredit = parseFloat(vouchSum.rows[0].tc);

  if (account_type === 'Bank' || account_type === 'Cash') {
    const salesLike = await query(`SELECT payment_method FROM sales WHERE payment_method ILIKE $1`, [`%${account_name}%`]);
    let saleDeposit = 0;
    salesLike.rows.forEach(s => {
      if (!s.payment_method) return;
      s.payment_method.split(',').forEach(part => {
        if (part.toLowerCase().includes(account_name.toLowerCase())) {
          const colonIdx = part.lastIndexOf(':');
          if (colonIdx !== -1) saleDeposit += parseFloat(part.slice(colonIdx + 1).trim()) || 0;
        }
      });
    });
    totalDebit += saleDeposit;
  }

  let running = balance_type === 'Dr'
    ? opening_balance + totalDebit - totalCredit
    : opening_balance + totalCredit - totalDebit;
  const finalType = running >= 0 ? balance_type : (balance_type === 'Dr' ? 'Cr' : 'Dr');
  return { signed_balance: running, closing_balance: Math.abs(running), balance_type: finalType, account_name };
}

async function test() {
  const client = await pool.connect();
  await client.query('BEGIN');
  const query = (t, p) => client.query(t, p);
  try {
    let passed = 0, failed = 0;
    const assert = (cond, msg) => {
      if (cond) { passed++; console.log(`  ✅ ${msg}`); }
      else { failed++; console.log(`  ❌ FAILED: ${msg}`); }
    };
    const approxEqual = (a, b, eps = 0.01) => Math.abs(Number(a) - Number(b)) <= eps;

    console.log('Flow 1: Bank account with opening balance + voucher BR deposit');
    const bankId = (await query(`INSERT INTO gl_accounts (account_name, account_type, opening_balance, balance_type) VALUES ($1,'Bank',5000,'Dr') RETURNING id`, ['Test Bank Account - HBL 3'])).rows[0].id;
    const equityId = (await query(`INSERT INTO gl_accounts (account_name, account_type, opening_balance, balance_type) VALUES ('Test Equity 3','Income',0,'Cr') RETURNING id`)).rows[0].id;
    const v1 = (await query(`INSERT INTO vouchers (voucher_no, voucher_date, voucher_type, remarks) VALUES ('BR-T1','2026-01-15','BR','Init') RETURNING id`)).rows[0].id;
    await query(`INSERT INTO voucher_details (voucher_id, account_id, description, debit, credit) VALUES ($1,$2,$3,$4,$5),($1,$6,$3,$7,$8)`, [v1, bankId, 'Capital Deposit', 10000, 0, equityId, 0, 10000]);
    const b1 = await getAccountClosingBalance(query, { accountId: bankId });
    assert(approxEqual(b1.closing_balance, 15000) && b1.balance_type === 'Dr',
      `Bank 5000+10000 = 15000 Dr, got ${b1.closing_balance} ${b1.balance_type}`);

    console.log('\nFlow 2: Customer account with sale + return + SALE PAYMENTS (key fix!)');
    const custId = (await query(`INSERT INTO customers (name, initial_balance) VALUES ('TCust3',2000) RETURNING id`)).rows[0].id;
    const custGlId = (await query(`INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type) VALUES ('Customer - TCust3','Customer',$1,'Dr') RETURNING id`, [custId])).rows[0].id;
    await query(
      `INSERT INTO sales (invoice_no, sale_date, customer_name, customer_id, total_amount, payment_method, discount, misc_charges, total_packets) VALUES ('INV-T3','2026-02-01','TCust3',$1,8000,'Cash:3000,HBL:2000',0,0,10) RETURNING id`,
      [custId]
    );
    await query(`INSERT INTO sales_returns (return_no, return_date, customer_name, total_amount, is_posted) VALUES ('SR-T3','2026-02-10','TCust3',500,1)`);
    const b2 = await getAccountClosingBalance(query, { accountId: custGlId });
    console.log('   Cust result (expect Init 2000 + Sale 8000 - Payments 5000 - SR 500 = 4500 Dr):', b2);
    assert(approxEqual(b2.closing_balance, 4500),
      `Customer (2000 + 8000 - 5000 - 500) = 4500 Dr, got ${b2.closing_balance} ${b2.balance_type}`);
    assert(b2.balance_type === 'Dr', `Expected Dr, got ${b2.balance_type}`);

    console.log('\nFlow 3: Customer goes to CREDIT (overpaid scenario): 765 Cr');
    const cust2 = (await query(`INSERT INTO customers (name, initial_balance) VALUES ('TCustCredit',0) RETURNING id`)).rows[0].id;
    const cust2Gl = (await query(`INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type) VALUES ('Customer - TCustCredit','Customer',$1,'Dr') RETURNING id`, [cust2.id])).rows[0].id;
    await query(
      `INSERT INTO sales (invoice_no, sale_date, customer_name, customer_id, total_amount, payment_method, discount, misc_charges, total_packets) VALUES ('INV-X1','2026-02-01','TCustCredit',$1,1000,'',0,0,2) RETURNING id`,
      [cust2.id]
    );
    const crV = (await query(`INSERT INTO vouchers (voucher_no, voucher_date, voucher_type, remarks) VALUES ('CR-X99','2026-02-10','CR','Overpay') RETURNING id`)).rows[0].id;
    await query(
      `INSERT INTO voucher_details (voucher_id, account_id, description, debit, credit) VALUES ($1,$2,$3,$4,$5),($1,$6,$3,$7,$8)`,
      [crV, bankId, 'Overpayment received', 1765, 0, cust2Gl, 0, 1765]
    );
    const b3 = await getAccountClosingBalance(query, { accountId: cust2Gl });
    console.log('   Overpaid Cust (1000 sale - 1765 CR voucher = -765 → 765 Cr):', b3);
    assert(approxEqual(b3.closing_balance, 765) && b3.balance_type === 'Cr',
      `Overpaid customer should be 765 Cr, got ${b3.closing_balance} ${b3.balance_type}`);

    console.log('\nFlow 4: Supplier account with purchase + payment');
    const suppId = (await query(`INSERT INTO suppliers (name, initial_balance) VALUES ('TSupp3',3000) RETURNING id`)).rows[0].id;
    const suppGlId = (await query(`INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type) VALUES ('Supplier - TSupp3','Supplier',$1,'Cr') RETURNING id`, [suppId])).rows[0].id;
    await query(`INSERT INTO purchases (invoice_no, purchase_date, supplier_name, total_amount, is_posted) VALUES ('PUR-T3','2026-03-01','TSupp3',12000,1)`);
    await query(`INSERT INTO supplier_payments (supplier_name, payment_date, amount, payment_mode) VALUES ('TSupp3','2026-03-15',4000,'Cash')`);
    const b4 = await getAccountClosingBalance(query, { accountId: suppGlId });
    assert(approxEqual(b4.closing_balance, 11000) && b4.balance_type === 'Cr',
      `Supp 3000+12000-4000=11000 Cr, got ${b4.closing_balance} ${b4.balance_type}`);

    console.log('\nFlow 5: Bank also receives sale payment_method deposit');
    await query(
      `INSERT INTO sales (invoice_no, sale_date, customer_name, total_amount, payment_method, discount, misc_charges, total_packets) VALUES ('INV-T999','2026-02-20','W3',6000,'Test Bank Account - HBL 3:2500,Cash:3500',0,0,5)`
    );
    const b5 = await getAccountClosingBalance(query, { accountId: bankId });
    console.log('   Bank before was 15000 + 1765 CR + 2500 sale deposit = expected 19265 Dr:', b5);
    assert(approxEqual(b5.closing_balance, 15000 + 1765 + 2500),
      `Bank 15000+1765+2500=19265, got ${b5.closing_balance}`);

    console.log('\nFlow 6: Pure GL expense account + Bank Payment voucher');
    const expId = (await query(`INSERT INTO gl_accounts (account_name, account_type, opening_balance, balance_type) VALUES ('Rent Exp T3','Expense',0,'Dr') RETURNING id`)).rows[0].id;
    const v2 = (await query(`INSERT INTO vouchers (voucher_no, voucher_date, voucher_type, remarks) VALUES ('BP-T3','2026-04-01','BP','Rent') RETURNING id`)).rows[0].id;
    await query(`INSERT INTO voucher_details (voucher_id, account_id, description, debit, credit) VALUES ($1,$2,$3,$4,$5),($1,$6,$3,$7,$8)`,
      [v2, expId, 'Apr Rent', 2500, 0, bankId, 0, 2500]);
    const b6e = await getAccountClosingBalance(query, { accountId: expId });
    assert(approxEqual(b6e.closing_balance, 2500) && b6e.balance_type === 'Dr', `Expense=2500 Dr, got ${b6e.closing_balance} ${b6e.balance_type}`);
    const b6b = await getAccountClosingBalance(query, { accountId: bankId });
    const bankAfterBP = 15000 + 1765 + 2500 - 2500;
    assert(approxEqual(b6b.closing_balance, bankAfterBP), `Bank after BP ${bankAfterBP}, got ${b6b.closing_balance}`);

    console.log('\nFlow 7: Null / missing account returns zero');
    const b7a = await getAccountClosingBalance(query, { accountId: null });
    const b7b = await getAccountClosingBalance(query, { accountId: 99999999 });
    assert(b7a.closing_balance === 0, 'Null account returns 0');
    assert(b7b.closing_balance === 0, 'Missing account returns 0');

    console.log('\nFlow 8: Customer sale with 100% paid at counter (0 balance)');
    const cust3 = (await query(`INSERT INTO customers (name, initial_balance) VALUES ('TCustZero',0) RETURNING id`)).rows[0].id;
    const cust3Gl = (await query(`INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type) VALUES ('Customer - TCustZero','Customer',$1,'Dr') RETURNING id`, [cust3.id])).rows[0].id;
    await query(
      `INSERT INTO sales (invoice_no, sale_date, customer_name, customer_id, total_amount, payment_method, discount, misc_charges, total_packets) VALUES ('INV-Z','2026-02-05','TCustZero',$1,9999,'Cash:9999',0,0,10) RETURNING id`,
      [cust3.id]
    );
    const b8 = await getAccountClosingBalance(query, { accountId: cust3Gl });
    console.log('   100% paid customer (9999 - 9999 = 0):', b8);
    assert(approxEqual(b8.closing_balance, 0), `Fully paid customer = 0, got ${b8.closing_balance}`);

    console.log('\nFlow 9: LEGACY NAME-ONLY records (the 4,740 bug!) — mix of old sales w/o customer_id + new ones w/ ID');
    const cust4Id = (await query(`INSERT INTO customers (name, initial_balance) VALUES ('Subhan Legacy',0) RETURNING id`)).rows[0].id;
    const cust4Gl = (await query(`INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type) VALUES ('Customer - Subhan Legacy','Customer',$1,'Dr') RETURNING id`, [cust4Id])).rows[0].id;
    await query(
      `INSERT INTO sales (invoice_no, sale_date, customer_name, customer_id, total_amount, payment_method, discount, misc_charges, total_packets) VALUES ('INV-OLD1','2025-06-01','Subhan Legacy',NULL,4000,'',0,0,5)`
    );
    await query(
      `INSERT INTO sales (invoice_no, sale_date, customer_name, customer_id, total_amount, payment_method, discount, misc_charges, total_packets) VALUES ('INV-OLD2','2025-07-01','Subhan Legacy',NULL,740,'',0,0,1)`
    );
    await query(
      `INSERT INTO sales (invoice_no, sale_date, customer_name, customer_id, total_amount, payment_method, discount, misc_charges, total_packets) VALUES ('INV-NEW','2026-01-15','Subhan Legacy',$1,0,'',0,0,0) RETURNING id`,
      [cust4Id]
    );
    const b9 = await getAccountClosingBalance(query, { accountId: cust4Gl });
    console.log('   Mix legacy w/o ID: 4000 + 740 = 4740 (THE BUG FIX):', b9);
    assert(approxEqual(b9.closing_balance, 4740) && b9.balance_type === 'Dr',
      `Legacy name-only sales should total 4740 Dr (old ID-only query missed them!), got ${b9.closing_balance} ${b9.balance_type}`);

    console.log('\nFlow 10: Supplier vouchSum also combines supplier_name OR reference_id (defensive)');
    const dummyBank = (await query(`INSERT INTO gl_accounts (account_name, account_type, opening_balance, balance_type) VALUES ('DummyBankForLegacyV','Bank',0,'Dr') RETURNING id`)).rows[0].id;
    const supp9 = (await query(`INSERT INTO suppliers (name, initial_balance) VALUES ('SuppLeg',5000) RETURNING id`)).rows[0].id;
    const supp9Gl = (await query(`INSERT INTO gl_accounts (account_name, account_type, reference_id, balance_type) VALUES ('Supplier - SuppLeg','Supplier',$1,'Cr') RETURNING id`, [supp9.id])).rows[0].id;
    await query(`INSERT INTO purchases (invoice_no, purchase_date, supplier_name, total_amount, is_posted) VALUES ('PUR-L1','2026-03-01','SuppLeg',9000,1)`);
    const bp = (await query(`INSERT INTO vouchers (voucher_no, voucher_date, voucher_type, remarks) VALUES ('BP-SUPPLEG','2026-03-15','BP','Pay') RETURNING id`)).rows[0].id;
    await query(
      `INSERT INTO voucher_details (voucher_id, account_id, description, debit, credit) VALUES ($1,$2,$3,$4,$5),($1,$6,$3,$7,$8)`,
      [bp, supp9Gl, 'Payment', 3000, 0, dummyBank, 0, 3000]
    );
    const b10 = await getAccountClosingBalance(query, { accountId: supp9Gl });
    console.log('   Supp Init 5k + Pur 9k - BP voucher 3k = 11k Cr:', b10);
    assert(approxEqual(b10.closing_balance, 11000) && b10.balance_type === 'Cr',
      `Supplier init+pur-BP = 11000 Cr, got ${b10.closing_balance} ${b10.balance_type}`);

    console.log('\n=============================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('=============================================');
    if (failed === 0) console.log('🎉 All flows passed! Closing balance calculator FIXED and verified.');

    await client.query('ROLLBACK');
    console.log('Transaction rolled back — test data cleaned up.');
    process.exit(failed === 0 ? 0 : 1);
  } catch (err) {
    console.error('TEST ERROR:', err);
    try { await client.query('ROLLBACK'); } catch {}
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

test();
