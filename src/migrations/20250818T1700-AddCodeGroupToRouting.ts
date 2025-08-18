import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCodeGroupToRouting20250818T1700 implements MigrationInterface {
  name = 'AddCodeGroupToRouting20250818T1700';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // أضِف الأعمدة فقط إن لم تكن موجودة
    await queryRunner.query(`
      ALTER TABLE "package_routing"
      ADD COLUMN IF NOT EXISTS "providerType" varchar(32) NOT NULL DEFAULT 'manual'
    `);

    await queryRunner.query(`
      ALTER TABLE "package_routing"
      ADD COLUMN IF NOT EXISTS "codeGroupId" uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "package_routing"
      DROP COLUMN IF EXISTS "codeGroupId"
    `);

    await queryRunner.query(`
      ALTER TABLE "package_routing"
      DROP COLUMN IF EXISTS "providerType"
    `);
  }
}
