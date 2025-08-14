import { MigrationInterface, QueryRunner } from 'typeorm';

export default class AccountingPeriods20250813T2000 implements MigrationInterface {
  name = 'AccountingPeriods20250813T2000';
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS "accounting_periods" (
        "year"      INT NOT NULL,
        "month"     INT NOT NULL CHECK ("month" BETWEEN 1 AND 12),
        "status"    VARCHAR(16) NOT NULL DEFAULT 'open',
        "closedAt"  TIMESTAMPTZ,
        "closedBy"  UUID,
        "note"      TEXT,
        CONSTRAINT "accounting_periods_ym_unique" UNIQUE ("year","month")
      );
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS "idx_accounting_periods_status"
      ON "accounting_periods" ("status");
    `);
  }
  public async down(_q: QueryRunner): Promise<void> {
    // لا نحذف السجل
  }
}
