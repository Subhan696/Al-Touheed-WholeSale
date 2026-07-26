const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'shopdb',
});

async function findAndDebug(namePart) {
  const client = await pool.connect();
  const query = (t, p) => client.query(t, p);
  try {
    console.log('\n===================================================');
    console.log(`🔍 LIVE DB DEBUG for name containing: "${namePart}"`);
    console.log('===================================================\n');

    const like = `%${namePart}%`;
    const gls = await query(`SELECT id, account_name, account_type, balance_type, opening_balance, reference_id FROM gl_accounts WHERE account_name ILIKE $1 ORDER BY id`, [like]);
    console.log(`👉 gl_accounts matching: ${gls.rows.length} row(s)`);
    gls.rows.forEach(r => console.log(
      `   #${r.id}  name="${r.account_name}" | type="${r.account_type}" | bal_type="${r.balance_type}" | opening=${r.opening_balance} | ref_id=${r.reference_id}`
    ));

    if (gls.rows.length === 0) {
      console.log('❌ No gl_accounts found. Check exact spelling.');
      return;
    }

    const customers = await query(`SELECT id, name, initial_balance, phone FROM customers WHERE name ILIKE $1 ORDER BY id`, [like]);
    console.log(`\n👉 customers matching: ${customers.rows.length} row(s)`);
    customers.rows.forEach(r => console.log(
      `   #${r.id}  name="${r.name}" | initial_bal=${r.initial_balance}`
    ));

    const suppliers = await query(`SELECT id, name, initial_balance FROM suppliers WHERE name ILIKE $1 ORDER BY id`, [like]);
    console.log(`\n👉 suppliers matching: ${suppliers.rows.length} row(s)`);
    suppliers.rows.forEach(r => console.log(
      `   #${r.id}  name="${r.name}" | initial_bal=${r.initial_balance}`
    ));

    for (const gl of gls.rows) {
      console.log(`\n------------------------------`);
      console.log(`🧮 STEP-BY-STEP BALANCE for gl_account #${gl.id}: "${gl.account_name}"`);
      console.log(`   account_type = "${gl.account_type}"  (compared as === "Customer" / === "Supplier" — case sensitive!)`);
      console.log(`   reference_id = ${gl.reference_id}`);
      const atype = (gl.account_type || '').trim();

      if (atype.toLowerCase() === 'customer') {
        const custName = gl.reference_id
          ? (await query(`SELECT name, initial_balance FROM customers WHERE id = $1`, [gl.reference_id])).rows[0]?.name
          : gl.account_name.replace(/^Customer\s*-\s*/i, '');
        const custId = gl.reference_id || 0;
        console.log(`   → resolved customer name = "${custName}" (via ref_id=${custId})`);

        let initial = 0;
        if (custId) {
          const c = await query(`SELECT id, name, initial_balance FROM customers WHERE id = $1`, [custId]);
          if (c.rows[0]) { console.log(`   ✅ By ref_id: found cust#${c.rows[0].id} "${c.rows[0].name}" init_bal=${c.rows[0].initial_balance}`); initial = parseFloat(c.rows[0].initial_balance) || 0; }
          else console.log(`   ⚠️  ref_id=${custId} did NOT match any customer row!`);
        }
        if (!initial && custName) {
          const c = await query(`SELECT id, initial_balance FROM customers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`, [custName]);
          if (c.rows[0]) { console.log(`   ✅ By name-match fallback: found cust#${c.rows[0].id} init_bal=${c.rows[0].initial_balance}`); initial = parseFloat(c.rows[0].initial_balance) || 0; }
          else console.log(`   ⚠️  name "${custName}" did NOT match any customer row!`);
        }

        const salesRows = await query(
          `SELECT id, invoice_no, total_amount, payment_method FROM sales WHERE (LOWER(TRIM(customer_name)) = LOWER(TRIM($1)) OR customer_id = $2)`,
          [custName, custId]
        );
        let saleTotal = 0, salePaid = 0;
        salesRows.rows.forEach(s => {
          const invTotal = parseFloat(s.total_amount) || 0;
          if (invTotal === 0) return;
          let paid = 0;
          if (s.payment_method) {
            s.payment_method.split(',').forEach(part => {
              const c = part.lastIndexOf(':');
              if (c !== -1) paid += parseFloat(part.slice(c + 1).trim()) || 0;
            });
          }
          if (invTotal > 0) {
            if (paid > invTotal) { console.log(`      Sale ${s.invoice_no || s.id}: total=${invTotal} | raw_paid=${paid} → CLAMPED to invTotal=${invTotal} (overpaid!)`); paid = invTotal; }
            saleTotal += invTotal;
            salePaid += paid;
            console.log(`      Sale ${s.invoice_no || s.id}: total=${invTotal} | paid_via_pm=${paid} | method="${s.payment_method || ''}"`);
          } else {
            salePaid += Math.abs(invTotal);
            console.log(`      ➖ Sale ${s.invoice_no || s.id}: NEGATIVE total=${invTotal} → treated as CREDIT (customer gets back +${Math.abs(invTotal)})`);
          }
        });
        console.log(`   👉 SUM sales total=${saleTotal}  SUM payment_method paid=${salePaid}  → outstanding on sales = ${saleTotal - salePaid}`);

        const sr = await query(`SELECT COALESCE(SUM(total_amount),0) as s FROM sales_returns WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM($1))`, [custName]);
        const srSum = parseFloat(sr.rows[0].s);
        console.log(`   👉 SUM sales_returns = ${srSum}`);

        const vsql = `SELECT COALESCE(SUM(vd.debit),0) as td, COALESCE(SUM(vd.credit),0) as tc FROM voucher_details vd JOIN vouchers v ON vd.voucher_id = v.id JOIN gl_accounts g ON g.id = vd.account_id WHERE (LOWER(TRIM(g.account_name)) = LOWER(TRIM($1)) OR (g.account_type = 'Customer' AND g.reference_id = $2))`;
        const vres = await query(vsql, ['Customer - ' + custName, custId]);
        const vd = parseFloat(vres.rows[0].td), vc = parseFloat(vres.rows[0].tc);
        console.log(`   👉 voucher debit=${vd}  credit=${vc}`);

        const totalDebit = saleTotal + vd;
        const totalCredit = salePaid + srSum + vc;
        let running = initial + totalDebit - totalCredit;
        const ftype = running >= 0 ? 'Dr' : 'Cr';
        console.log(`\n   ✅ FINAL CALC = initial(${initial}) + debits(${totalDebit}) − credits(${totalCredit}) = ${running} → ${Math.abs(running)} ${ftype}`);
      }

      else if (atype.toLowerCase() === 'supplier') {
        const suppName = gl.reference_id
          ? (await query(`SELECT name, initial_balance FROM suppliers WHERE id = $1`, [gl.reference_id])).rows[0]?.name
          : gl.account_name.replace(/^Supplier\s*-\s*/i, '');
        const suppId = gl.reference_id || 0;
        console.log(`   → resolved supplier name = "${suppName}" (via ref_id=${suppId})`);
        let initial = 0;
        if (suppId) {
          const s = await query(`SELECT id, name, initial_balance FROM suppliers WHERE id = $1`, [suppId]);
          if (s.rows[0]) { console.log(`   ✅ By ref_id: found supp#${s.rows[0].id} "${s.rows[0].name}" init_bal=${s.rows[0].initial_balance}`); initial = parseFloat(s.rows[0].initial_balance) || 0; }
        }
        if (!initial && suppName) {
          const s = await query(`SELECT id, initial_balance FROM suppliers WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))`, [suppName]);
          if (s.rows[0]) { console.log(`   ✅ By name-match fallback: found supp#${s.rows[0].id} init_bal=${s.rows[0].initial_balance}`); initial = parseFloat(s.rows[0].initial_balance) || 0; }
        }
        const pur = parseFloat((await query(`SELECT COALESCE(SUM(total_amount),0) s FROM purchases WHERE supplier_name = $1 AND is_posted = 1`, [suppName])).rows[0].s);
        const pr = parseFloat((await query(`SELECT COALESCE(SUM(total_amount),0) s FROM purchase_returns WHERE supplier_name = $1 AND is_posted = 1`, [suppName])).rows[0].s);
        const pay = parseFloat((await query(`SELECT COALESCE(SUM(amount),0) s FROM supplier_payments WHERE supplier_name = $1`, [suppName])).rows[0].s);
        const vsql = `SELECT COALESCE(SUM(vd.debit),0) td, COALESCE(SUM(vd.credit),0) tc FROM voucher_details vd JOIN vouchers v ON vd.voucher_id = v.id JOIN gl_accounts g ON g.id = vd.account_id WHERE (replace(g.account_name, 'Supplier - ', '') = $1 OR (g.account_type = 'Supplier' AND g.reference_id = $2))`;
        const vr = await query(vsql, [suppName, suppId]);
        const vd = parseFloat(vr.rows[0].td), vc = parseFloat(vr.rows[0].tc);
        console.log(`   purchases=${pur}  returns=${pr}  payments=${pay}  voucher dr=${vd} cr=${vc}`);
        const totalCredit = pur + vc;
        const totalDebit = pr + pay + vd;
        const running = initial + totalCredit - totalDebit;
        const ftype = running >= 0 ? 'Cr' : 'Dr';
        console.log(`\n   ✅ FINAL = init(${initial}) + credit(${totalCredit}) − debit(${totalDebit}) = ${running} → ${Math.abs(running)} ${ftype}`);
      }

      else {
        console.log(`   ⚠️  account_type is "${atype}" (not Customer/Supplier) → uses general voucher-only formula + sale bank-deposit parse`);
      }
    }
  } finally {
    client.release();
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node debug_closing_balance.js <name> [name2...]\nExample: node debug_closing_balance.js om ARZ');
    args.push('om');
  }
  for (const a of args) await findAndDebug(a);
  pool.end();
}
main().catch(err => { console.error('FATAL', err); process.exit(1); });
