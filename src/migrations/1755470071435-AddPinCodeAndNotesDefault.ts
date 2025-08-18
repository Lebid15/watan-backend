import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPinCodeAndNotesDefault1755470071435 implements MigrationInterface {
  name = 'AddPinCodeAndNotesDefault1755470071435';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) إضافة عمود PIN إن لم يوجد
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "pinCode" VARCHAR(120)
    `);

    // 2) تأمين تسلسل orderNo (كما ولّدته الأداة عندك)
    await queryRunner.query(`
      CREATE SEQUENCE IF NOT EXISTS "product_orders_orderNo_seq"
      OWNED BY "product_orders"."orderNo"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ALTER COLUMN "orderNo" SET DEFAULT nextval('"product_orders_orderNo_seq"')
    `);

    // 3) ضبط notes: تعبئة القيم الفارغة ثم جعل الافتراضي []::jsonb ثم NOT NULL
    //   (مهم: الـ backfill يسبق NOT NULL)
    await queryRunner.query(`
      UPDATE "product_orders"
      SET "notes" = '[]'::jsonb
      WHERE "notes" IS NULL
    `);

    // بعض الإصدارات تولّد DEFAULT '[]' بدون التحويل ::jsonb — نصحّحها صراحةً
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ALTER COLUMN "notes" SET DEFAULT '[]'::jsonb
    `);

    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ALTER COLUMN "notes" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // عكس تغييرات notes
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ALTER COLUMN "notes" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ALTER COLUMN "notes" DROP DEFAULT
    `);

    // عكس الإعدادات الخاصة بـ orderNo
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ALTER COLUMN "orderNo" DROP DEFAULT
    `);
    await queryRunner.query(`
      DROP SEQUENCE IF EXISTS "product_orders_orderNo_seq"
    `);

    // إزالة pinCode (اختياري في down)
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "pinCode"
    `);
  }
}
