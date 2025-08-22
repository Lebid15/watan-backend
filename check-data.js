// Check tenants
const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'Asdf1212asdf.',
  database: 'watan',
});

async function checkTenants() {
  try {
    await dataSource.initialize();
    console.log('✅ Connected to database');

    const tenants = await dataSource.query('SELECT * FROM tenants ORDER BY "createdAt" DESC');
    console.log('📋 All tenants:');
    console.table(tenants);

    const domains = await dataSource.query(
      'SELECT td.*, t.name as tenant_name FROM tenant_domains td JOIN tenants t ON td."tenantId" = t.id ORDER BY td."createdAt" DESC'
    );
    console.log('\n📋 All tenant domains:');
    console.table(domains);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await dataSource.destroy();
  }
}

checkTenants();
