import { MigrationInterface, QueryRunner } from 'typeorm';

export class OrderNoSequence20250816T2100 implements MigrationInterface {
  name = 'OrderNoSequence20250816T2100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) أنشئ sequence إن لم تكن موجودة
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'order_no_seq') THEN
          CREATE SEQUENCE order_no_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
        END IF;
      END$$;
    `);

    // 2) أضف العمود لو مش موجود (أغلب الظن موجود عندك — آمن تتخطى)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'product_orders' AND column_name = 'orderNo'
        ) THEN
          ALTER TABLE "product_orders" ADD COLUMN "orderNo" integer;
        END IF;
      END$$;
    `);

    // 3) اجعل القيمة الافتراضية من الـ sequence
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ALTER COLUMN "orderNo" SET DEFAULT nextval('order_no_seq');
    `);

    // 4) عبّي أي صفوف قديمة ما عندها رقم
    await queryRunner.query(`
      UPDATE "product_orders"
      SET "orderNo" = nextval('order_no_seq')
      WHERE "orderNo" IS NULL;
    `);

    // 5) فهرس/unique لضمان عدم التكرار
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'product_orders_orderno_uindex'
        ) THEN
          CREATE UNIQUE INDEX product_orders_orderno_uindex
          ON "product_orders"("orderNo");
        END IF;
      END$$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // رجوع آمن بدون فقدان بيانات (نزيل الـ default والفهرس فقط)
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ALTER COLUMN "orderNo" DROP DEFAULT;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname = 'product_orders_orderno_uindex'
        ) THEN
          DROP INDEX product_orders_orderno_uindex;
        END IF;
      END$$;
    `);
    // لا نحذف العمود ولا الـ sequence تجنباً لكسر تاريخ الطلبات؛
    // احذفهما يدويًا لو حبيت.
  }
}
