// Create admin user for Ahmad tenant
const { DataSource } = require('typeorm');
const bcrypt = require('bcrypt');

const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'postgres',
  password: 'Asdf1212asdf.',
  database: 'watan',
});

async function createTenantAdmin() {
  try {
    await dataSource.initialize();
    console.log('✅ Connected to database');

    // Find Ahmad tenant
    const tenants = await dataSource.query(
      'SELECT * FROM tenant WHERE name = $1',
      ['أحمد']
    );

    if (tenants.length === 0) {
      console.log('❌ Ahmad tenant not found');
      return;
    }

    const ahmad = tenants[0];
    console.log('✅ Found Ahmad tenant:', ahmad.id, ahmad.name);

    // Check if admin user already exists in this tenant
    const existingAdmin = await dataSource.query(
      'SELECT * FROM users WHERE email = $1 AND "tenantId" = $2',
      ['ahmad@gmail.com', ahmad.id]
    );

    if (existingAdmin.length > 0) {
      console.log('✅ Admin user already exists in Ahmad tenant');
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('CC!S6a7jUe', 10);
    
    // Create admin user for the tenant
    const userId = require('crypto').randomUUID();
    await dataSource.query(
      `INSERT INTO users (id, email, password, role, "tenantId", "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [userId, 'ahmad@gmail.com', hashedPassword, 'admin', ahmad.id, true]
    );

    console.log('✅ Created admin user for Ahmad tenant');

    // Update tenant's ownerUserId
    await dataSource.query(
      'UPDATE tenant SET "ownerUserId" = $1, "updatedAt" = NOW() WHERE id = $2',
      [userId, ahmad.id]
    );

    console.log('✅ Updated tenant ownerUserId');

    // Verify
    const users = await dataSource.query(`
      SELECT u.id, u.email, u."tenantId", u.role, t.name as tenant_name 
      FROM users u 
      LEFT JOIN tenant t ON u."tenantId" = t.id 
      WHERE u.email = 'ahmad@gmail.com'
      ORDER BY u."createdAt" DESC
    `);
    
    console.log('\n📋 Ahmad users:');
    console.table(users);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await dataSource.destroy();
  }
}

createTenantAdmin();
