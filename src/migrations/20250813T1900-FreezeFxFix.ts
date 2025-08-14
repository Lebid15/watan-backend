import { MigrationInterface, QueryRunner } from 'typeorm';

export default class FreezeFxFix20250813T1900 implements MigrationInterface {
  name = 'FreezeFxFix20250813T1900';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const T = 'product_orders';
    await queryRunner.query(`ALTER TABLE "${T}" ADD COLUMN IF NOT EXISTS "fxUsdTryAtApproval" NUMERIC(12,6)`);
    await queryRunner.query(`ALTER TABLE "${T}" ADD COLUMN IF NOT EXISTS "sellTryAtApproval" NUMERIC(12,2)`);
    await queryRunner.query(`ALTER TABLE "${T}" ADD COLUMN IF NOT EXISTS "costTryAtApproval" NUMERIC(12,2)`);
    await queryRunner.query(`ALTER TABLE "${T}" ADD COLUMN IF NOT EXISTS "profitTryAtApproval" NUMERIC(12,2)`);
    await queryRunner.query(`ALTER TABLE "${T}" ADD COLUMN IF NOT EXISTS "profitUsdAtApproval" NUMERIC(12,2)`);
    await queryRunner.query(`ALTER TABLE "${T}" ADD COLUMN IF NOT EXISTS "fxCapturedAt" TIMESTAMPTZ`);
    await queryRunner.query(`ALTER TABLE "${T}" ADD COLUMN IF NOT EXISTS "fxSource" VARCHAR(50)`);
    await queryRunner.query(`ALTER TABLE "${T}" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ`);
    await queryRunner.query(`ALTER TABLE "${T}" ADD COLUMN IF NOT EXISTS "approvedLocalDate" DATE`);
    await queryRunner.query(`ALTER TABLE "${T}" ADD COLUMN IF NOT EXISTS "approvedLocalMonth" CHAR(7)`);
    await queryRunner.query(`ALTER TABLE "${T}" ADD COLUMN IF NOT EXISTS "fxLocked" BOOLEAN DEFAULT false`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_orders_approvedLocalDate" ON "${T}" ("approvedLocalDate")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_orders_fxLocked" ON "${T}" ("fxLocked")`);
  }

  public async down(): Promise<void> {}
}
