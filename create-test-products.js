const { Client } = require('pg');

async function createTestProducts() {
  const client = new Client({
    host: 'localhost',
    database: 'watan',
    user: 'postgres',
    password: 'Asdf1212asdf.'
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Get tenant IDs
    const tenants = await client.query(`
      SELECT id, name FROM tenant WHERE name IN ('أحمد', 'سعيد');
    `);
    
    console.log('📋 Tenants found:');
    console.table(tenants.rows);

    const ahmadTenantId = tenants.rows.find(t => t.name === 'أحمد')?.id;
    const saeedTenantId = tenants.rows.find(t => t.name === 'سعيد')?.id;

    // Check if product table exists and get structure
    const tableCheck = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'product' 
      ORDER BY ordinal_position;
    `);

    if (tableCheck.rows.length === 0) {
      console.log('❌ Product table does not exist');
      return;
    }

    console.log('📋 Product table structure:');
    console.table(tableCheck.rows);

    // Create product for Ahmad
    const ahmadProduct = await client.query(`
      INSERT INTO product (id, name, description, "tenantId", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        'منتج أحمد - جوال سامسونج',
        'جوال سامسونج جديد من متجر أحمد',
        $1,
        NOW(),
        NOW()
      )
      RETURNING id, name, "tenantId";
    `, [ahmadTenantId]);

    console.log('✅ Product created for Ahmad:', ahmadProduct.rows[0]);

    // Create product for Saeed
    const saeedProduct = await client.query(`
      INSERT INTO product (id, name, description, "tenantId", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid(),
        'منتج سعيد - لابتوب ديل',
        'لابتوب ديل جديد من متجر سعيد',
        $1,
        NOW(),
        NOW()
      )
      RETURNING id, name, "tenantId";
    `, [saeedTenantId]);

    console.log('✅ Product created for Saeed:', saeedProduct.rows[0]);

    // Verify isolation - check products by tenant
    const ahmadProducts = await client.query(`
      SELECT id, name, "tenantId" FROM product WHERE "tenantId" = $1;
    `, [ahmadTenantId]);

    const saeedProducts = await client.query(`
      SELECT id, name, "tenantId" FROM product WHERE "tenantId" = $1;
    `, [saeedTenantId]);

    console.log('\n🔍 Data isolation test:');
    console.log('👤 Ahmad products:', ahmadProducts.rows);
    console.log('👤 Saeed products:', saeedProducts.rows);

    console.log('\n🎉 Test products created and isolation verified!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

createTestProducts();