const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'atg_wholesale',
  user: 'atg_user',
  password: 'atg_pass123'
});

pool.query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'purchase_expenses'")
  .then(res => {
    console.log(res.rows);
    pool.end();
  })
  .catch(err => {
    console.error(err);
    pool.end();
  });
