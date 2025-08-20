import { MigrationInterface, QueryRunner } from "typeorm";

export class IncreaseProductPackageName20250820T0325 implements MigrationInterface {
  name = 'IncreaseProductPackageName20250820T0325';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // تكبير طول عمود الاسم إلى 160 حرف
    await queryRunner.query(`
      ALTER TABLE "product_packages"
      ALTER COLUMN "name" TYPE varchar(160)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // الرجوع للطول السابق 100 حرف
    await queryRunner.query(`
      ALTER TABLE "product_packages"
      ALTER COLUMN "name" TYPE varchar(100)
    `);
  }
}
