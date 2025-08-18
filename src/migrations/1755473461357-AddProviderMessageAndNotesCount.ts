import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProviderMessageAndNotesCount1755473461357 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // أضف الأعمدة إن لم تكن موجودة
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "providerMessage" text
    `);

    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "notesCount" int NOT NULL DEFAULT 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // احذف الأعمدة فقط إذا كانت موجودة
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "providerMessage"
    `);

    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "notesCount"
    `);
  }
}
