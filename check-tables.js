// Check database tables
const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'Asdf1212asdf.',
  database: 'watan',
});

async function checkTables() {
  try {
    await dataSource.initialize();
    console.log('✅ Connected to database');

    const tables = await dataSource.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    console.log('📋 Database tables:');
    console.table(tables);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await dataSource.destroy();
  }
}

checkTables();
