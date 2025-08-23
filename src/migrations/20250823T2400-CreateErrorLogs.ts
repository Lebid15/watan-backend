import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateErrorLogs20250823T2400 implements MigrationInterface {
  name = 'CreateErrorLogs20250823T2400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "error_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "source" varchar(16) NOT NULL,
        "level" varchar(8) NOT NULL,
        "status" varchar(10) NOT NULL DEFAULT 'open',
        "message" varchar(400) NOT NULL,
        "name" varchar(120),
        "stack" text,
        "path" varchar(300),
        "method" varchar(8),
        "userId" uuid,
        "tenantId" uuid,
        "userAgent" varchar(400),
        "context" jsonb,
        "hash" varchar(64) NOT NULL,
        "occurrenceCount" int NOT NULL DEFAULT 1,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        "firstOccurredAt" timestamptz,
        "lastOccurredAt" timestamptz,
        "resolvedAt" timestamptz
      );
      CREATE INDEX IF NOT EXISTS idx_error_logs_createdAt ON "error_logs"("createdAt");
      CREATE INDEX IF NOT EXISTS idx_error_logs_source_level ON "error_logs"("source","level");
      CREATE INDEX IF NOT EXISTS idx_error_logs_status ON "error_logs"("status");
      CREATE INDEX IF NOT EXISTS idx_error_logs_hash ON "error_logs"("hash");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "error_logs"');
  }
}
