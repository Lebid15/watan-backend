const { Client } = require('pg');

async function checkTenantSchema() {
  const client = new Client({
    host: 'localhost',
    database: 'watan',
    user: 'postgres',
    password: 'Asdf1212asdf.'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'tenant' 
      ORDER BY ordinal_position;
    `);

    console.log('📋 Tenant table schema:');
    console.table(result.rows);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkTenantSchema();
