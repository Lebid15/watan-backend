// Check users in tenant
const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'Asdf1212asdf.',
  database: 'watan',
});

async function checkUsers() {
  try {
    await dataSource.initialize();
    console.log('✅ Connected to database');

    const users = await dataSource.query(`
      SELECT u.id, u.email, u."tenantId", u.role, t.name as tenant_name 
      FROM users u 
      LEFT JOIN tenant t ON u."tenantId" = t.id 
      ORDER BY u."createdAt" DESC
    `);
    
    console.log('📋 All users:');
    console.table(users);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await dataSource.destroy();
  }
}

checkUsers();
