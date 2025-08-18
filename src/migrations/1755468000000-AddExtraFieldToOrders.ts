import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExtraFieldToOrders20250817T2200 implements MigrationInterface {
  name = 'AddExtraFieldToOrders20250817T2200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "extraField" varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "extraField"
    `);
  }
}
