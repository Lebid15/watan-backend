// Script to add ahmad.localhost domain to Ahmad tenant
const { DataSource } = require('typeorm');

const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'Asdf1212asdf.',
  database: 'watan',
});

async function addDomain() {
  try {
    await dataSource.initialize();
    console.log('✅ Connected to database');

    // Find Ahmad tenant
    const tenants = await dataSource.query(
      'SELECT * FROM tenants WHERE name = $1',
      ['أحمد']
    );

    if (tenants.length === 0) {
      console.log('❌ Ahmad tenant not found');
      return;
    }

    const ahmad = tenants[0];
    console.log('✅ Found Ahmad tenant:', ahmad.id, ahmad.name);

    // Check if domain already exists
    const existingDomain = await dataSource.query(
      'SELECT * FROM tenant_domains WHERE domain = $1',
      ['ahmad.localhost']
    );

    if (existingDomain.length > 0) {
      console.log('✅ Domain ahmad.localhost already exists');
      return;
    }

    // Add domain
    const domainId = require('crypto').randomUUID();
    await dataSource.query(
      `INSERT INTO tenant_domains (id, "tenantId", domain, type, "isVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [domainId, ahmad.id, 'ahmad.localhost', 'subdomain', true]
    );

    console.log('✅ Added ahmad.localhost domain to Ahmad tenant');

    // Verify
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

addDomain();
