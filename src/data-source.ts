import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import 'dotenv/config';

dotenv.config({ path: process.env.NODE_ENV === 'production' ? '.env' : '.env.local' });
// Detect whether we are running from ts-node (dev) or compiled dist (prod/preview)
const runningTs = __filename.endsWith('.ts');
const explicitProd = process.env.NODE_ENV === 'production';
// Treat compiled runtime as production even if NODE_ENV not set to avoid trying to require .ts files
const isProd = explicitProd || !runningTs;
if (!explicitProd && !runningTs) {
  // Helpful notice once in CLI usage
  // eslint-disable-next-line no-console
  console.warn('[DataSource] NODE_ENV not production but running from dist -> using JS entity/migration globs.');
}

// Build connection with smart SSL (disable for localhost even if isProd inferred)
let baseConn: any;
if (isProd) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');
  let needSsl = true;
  try {
    const u = new URL(dbUrl);
    if (['localhost', '127.0.0.1'].includes(u.hostname)) needSsl = false;
  } catch (_) {}
  baseConn = {
    type: 'postgres',
    url: dbUrl,
    ssl: needSsl ? { rejectUnauthorized: false } : false,
    extra: needSsl ? { ssl: { rejectUnauthorized: false } } : undefined,
  };
} else {
  baseConn = {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER ?? process.env.DB_USERNAME ?? 'postgres',
    password: String(process.env.DB_PASS ?? process.env.DB_PASSWORD ?? ''),
    database: process.env.DB_NAME ?? 'watan',
  };
}

const dataSource = new DataSource({
  ...baseConn,
  entities: [runningTs ? 'src/**/*.entity.ts' : 'dist/**/*.entity.js'],
  migrations: [runningTs ? 'src/migrations/*.ts' : 'dist/migrations/*.js'],
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
        console.log(
          'Usage (DEV):   npx ts-node ./src/data-source.ts migration:run | migration:show | migration:revert\n' +
          'Usage (PROD):  node ./dist/data-source.js migration:run | migration:show | migration:revert'
        );
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration error:', err);
      process.exit(1);
    });
}
