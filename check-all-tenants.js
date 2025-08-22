// Check tenants in all possible tables
const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'Asdf1212asdf.',
  database: 'watan',
});

async function checkAllTenants() {
  try {
    await dataSource.initialize();
    console.log('✅ Connected to database');

    // Check tenants table
    try {
      const tenants = await dataSource.query('SELECT * FROM tenants ORDER BY "createdAt" DESC');
      console.log('📋 Tenants table:');
      console.table(tenants);
    } catch (error) {
      console.log('❌ Error checking tenants table:', error.message);
    }

    // Check tenant table (singular)
    try {
      const tenant = await dataSource.query('SELECT * FROM tenant ORDER BY "createdAt" DESC');
      console.log('📋 Tenant table (singular):');
      console.table(tenant);
    } catch (error) {
      console.log('❌ Error checking tenant table:', error.message);
    }

    // Check tenant_domain
    try {
      const domains = await dataSource.query('SELECT * FROM tenant_domain ORDER BY "createdAt" DESC');
      console.log('📋 Tenant domain table:');
      console.table(domains);
    } catch (error) {
      console.log('❌ Error checking tenant_domain table:', error.message);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await dataSource.destroy();
  }
}

checkAllTenants();
