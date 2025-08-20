import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIntegrationScope20250821T0100 implements MigrationInterface {
  name = 'AddIntegrationScope20250821T0100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "integrations"
      ADD COLUMN IF NOT EXISTS "scope" varchar(10) NOT NULL DEFAULT 'tenant'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "integrations"
      DROP COLUMN IF EXISTS "scope"
    `);
  }
}
