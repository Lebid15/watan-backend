import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTenantId1754901234567 implements MigrationInterface {
  name = 'AddTenantId1754901234567'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1) إضافة العمود كـ NULLable
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "tenantId" uuid NULL
    `);

    // 2) تعبئة العمود من جدول users (يفترض وجود userId foreign key)
    await queryRunner.query(`
      UPDATE "product_orders" o
      SET "tenantId" = u."tenantId"
      FROM "users" u
      WHERE o."userId" = u."id" AND o."tenantId" IS NULL
    `);

    // (اختياري) تحقق من الصفوف التي ما زالت NULL:
    // SELECT count(*) FROM "product_orders" WHERE "tenantId" IS NULL;

    // 3) فرض NOT NULL
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ALTER COLUMN "tenantId" SET NOT NULL
    `);

    // 4) فهرس للـ tenantId
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_orders_tenant"
      ON "product_orders" ("tenantId")
    `);

    // 5) إسقاط أي فهرس فريد قديم على orderNo لو كان موجود (كان عالمي)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'IDX_product_orders_order_no_unique'
        ) THEN
          EXECUTE 'DROP INDEX "IDX_product_orders_order_no_unique"';
        END IF;
      END$$;
    `);

    // 6) فريد مركّب: (tenantId, orderNo)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_orders_tenant_order_no"
      ON "product_orders" ("tenantId", "orderNo")
      WHERE "orderNo" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "uq_orders_tenant_order_no"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_orders_tenant"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "tenantId"
    `);
  }
}
