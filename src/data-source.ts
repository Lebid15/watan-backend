import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config({ path: process.env.NODE_ENV === 'production' ? '.env' : '.env.local' });
const isProd = process.env.NODE_ENV === 'production';

const dataSource = new DataSource({
  type: 'postgres',
  ...(isProd
    ? {
        url: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USER ?? process.env.DB_USERNAME ?? 'postgres',
        password: String(process.env.DB_PASS ?? process.env.DB_PASSWORD ?? ''),
        database: process.env.DB_NAME ?? 'watan',
        // لا نحتاج SSL محلياً
      }),
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});

export default dataSource;

// --- CLI runner (minimal) ---
if (require.main === module) {
  const cmd = process.argv[2]; // "migration:run" | "migration:show" | "migration:revert"
  dataSource
    .initialize()
    .then(async () => {
      if (cmd === 'migration:run') {
        await dataSource.runMigrations();
        console.log('✅ Migrations ran.');
      } else if (cmd === 'migration:revert') {
        await dataSource.undoLastMigration();
        console.log('↩️ Migration reverted.');
      } else if (cmd === 'migration:show') {
        const hasPending = await dataSource.showMigrations();
        console.log('ℹ️ Pending migrations?', hasPending);
      } else {
        console.log('Usage: ts-node ./src/data-source.ts migration:run | migration:show | migration:revert');
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration error:', err);
      process.exit(1);
    });
}
