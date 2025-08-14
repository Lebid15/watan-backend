import { MigrationInterface, QueryRunner } from 'typeorm';

export class FreezeFxOnApproval1754965000000 implements MigrationInterface {
  name = 'FreezeFxOnApproval1754965000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // helper to add column if not exists
    async function addColumnIfNotExists(table: string, column: string, type: string, extra = '') {
      const exists = await queryRunner.query(
        `SELECT 1
           FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
        [table, column],
      );
      if (!exists || exists.length === 0) {
        await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type} ${extra}`.trim());
      }
    }

    const T = 'product_orders';

    await addColumnIfNotExists(T, 'fxUsdTryAtApproval', 'NUMERIC(12,6)');
    await addColumnIfNotExists(T, 'sellTryAtApproval', 'NUMERIC(12,2)');
    await addColumnIfNotExists(T, 'costTryAtApproval', 'NUMERIC(12,2)');
    await addColumnIfNotExists(T, 'profitTryAtApproval', 'NUMERIC(12,2)');
    await addColumnIfNotExists(T, 'profitUsdAtApproval', 'NUMERIC(12,2)');
    await addColumnIfNotExists(T, 'fxCapturedAt', 'TIMESTAMPTZ');
    await addColumnIfNotExists(T, 'fxSource', 'VARCHAR(50)');
    await addColumnIfNotExists(T, 'approvedAt', 'TIMESTAMPTZ');
    await addColumnIfNotExists(T, 'approvedLocalDate', 'DATE');
    await addColumnIfNotExists(T, 'approvedLocalMonth', 'CHAR(7)'); // YYYY-MM
    await addColumnIfNotExists(T, 'fxLocked', 'BOOLEAN', 'DEFAULT false NOT NULL');

    // فهارس مساعدة للتقارير
    try { await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_orders_approvedLocalDate" ON "${T}" ("approvedLocalDate")`); } catch {}
    try { await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_orders_fxLocked" ON "${T}" ("fxLocked")`); } catch {}
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // لا نحذف الأعمدة حفاظًا على البيانات
  }
}
