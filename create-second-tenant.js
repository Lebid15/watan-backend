const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function createSecondTenant() {
  const client = new Client({
    host: 'localhost',
    database: 'watan',
    user: 'postgres',
    password: 'Asdf1212asdf.'
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // 1. Create user for Saeed first
    const hashedPassword = await bcrypt.hash('123456', 10);
    const userResult = await client.query(`
      INSERT INTO users (id, email, username, password, role, "fullName", "tenantId", balance, "isActive", "overdraftLimit", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        'saeed@gmail.com',
        'saeed',
        $1,
        'admin',
        'سعيد أحمد',
        NULL,
        0,
        true,
        0,
        NOW(),
        NOW()
      )
      RETURNING id, email;
    `, [hashedPassword]);

    const userId = userResult.rows[0].id;
    console.log('✅ User created:', userResult.rows[0]);

    // 2. Create tenant with ownerUserId
    const tenantResult = await client.query(`
      INSERT INTO tenant (id, name, code, "ownerUserId", "isActive", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        'سعيد',
        'saeed-store',
        $1,
        true,
        NOW(),
        NOW()
      )
      RETURNING id, name, code, "ownerUserId";
    `, [userId]);

    const tenantId = tenantResult.rows[0].id;
    console.log('✅ Tenant created:', tenantResult.rows[0]);

    // 3. Update user to belong to tenant
    await client.query(`
      UPDATE users 
      SET "tenantId" = $1
      WHERE id = $2;
    `, [tenantId, userId]);

    console.log('✅ User updated with tenantId');

    // 4. Create domain mapping
    const domainResult = await client.query(`
      INSERT INTO tenant_domain (id, "tenantId", domain, "isPrimary", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        $1,
        'saeed.localhost',
        true,
        NOW(),
        NOW()
      )
      RETURNING id, domain, "isPrimary";
    `, [tenantId]);

    console.log('✅ Domain created:', domainResult.rows[0]);

    console.log('\n🎉 Tenant "سعيد" created successfully!');
    console.log('   📧 Email: saeed@gmail.com');
    console.log('   🔑 Password: 123456');
    console.log('   🌐 Domain: saeed.localhost:3000');
    console.log('   🆔 Tenant ID:', tenantId);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

createSecondTenant();
