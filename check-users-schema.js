const { Client } = require('pg');

async function checkUsersSchema() {
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
      WHERE table_name = 'users' 
      ORDER BY ordinal_position;
    `);

    console.log('📋 Users table schema:');
    console.table(result.rows);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkUsersSchema();
