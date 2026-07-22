const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'atg_wholesale',
  user: 'atg_user',
  password: 'atg_pass123',
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // We'll insert in batches to avoid query size limits
    const batchSize = 1000;
    const total = 90000;
    
    for (let i = 0; i < total; i += batchSize) {
      let valuesStr = [];
      let valuesArr = [];
      
      for (let j = 0; j < batchSize; j++) {
        const offset = j * 6;
        valuesStr.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`);
        
        const index = i + j;
        valuesArr.push(
          `TEST-${index}`,          // item_code
          `Test Item ${index}`,     // description
          100,                      // purchase_rate
          150,                      // sale_rate
          'TEST_CAT',               // category
          0                         // session_id
        );
      }
      
      const queryStr = `
        INSERT INTO products (
          item_code, 
          description, 
          purchase_rate, 
          sale_rate, 
          category, 
          session_id
        ) VALUES ${valuesStr.join(', ')}
      `;
      
      await client.query(queryStr, valuesArr);
      console.log(`Inserted ${i + batchSize} / ${total}`);
    }
    
    await client.query('COMMIT');
    console.log('Successfully inserted 90000 rows.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error inserting data:', err);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
