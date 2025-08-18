import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFieldsToNotifications1754734605365 implements MigrationInterface {
  name = 'AddFieldsToNotifications1754734605365';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD COLUMN IF NOT EXISTS "readAt" TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS "seenAt" TIMESTAMPTZ NULL,
      ADD COLUMN IF NOT EXISTS "meta" JSONB NULL,
      ADD COLUMN IF NOT EXISTS "isSilent" BOOLEAN NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notifications"
      DROP COLUMN IF EXISTS "isSilent",
      DROP COLUMN IF EXISTS "meta",
      DROP COLUMN IF EXISTS "seenAt",
      DROP COLUMN IF EXISTS "readAt"
    `);
  }
}
