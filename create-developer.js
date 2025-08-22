// Idempotent script to create a global developer user (tenantId NULL)
const { DataSource } = require('typeorm');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Adjust via env or inline
const EMAIL = process.env.DEV_EMAIL || 'alayatl.tr@gmail.com';
const PASSWORD = process.env.DEV_PASSWORD || 'Talinnur280986!';

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: +(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'watan',
});

(async () => {
  try {
    await ds.initialize();
    console.log('✅ Connected');
    const existing = await ds.query('SELECT id, email, role FROM users WHERE email=$1 AND role=$2 AND "tenantId" IS NULL LIMIT 1', [EMAIL, 'developer']);
    if (existing.length) {
      console.log('ℹ️ Developer user already exists:', existing[0]);
      return;
    }
    const hash = await bcrypt.hash(PASSWORD, 10);
    const id = crypto.randomUUID();
    await ds.query(`INSERT INTO users (id, email, password, role, "tenantId", balance, "isActive", "overdraftLimit", "createdAt", "updatedAt")
      VALUES ($1,$2,$3,$4,NULL,0,true,0,NOW(),NOW())`, [id, EMAIL, hash, 'developer']);
    console.log('✅ Developer user created:', { id, email: EMAIL });
  } catch (e) {
    console.error('❌ Error:', e.message || e);
  } finally {
    await ds.destroy();
  }
})();
