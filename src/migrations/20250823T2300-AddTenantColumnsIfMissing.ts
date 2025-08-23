import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * إسعافية: إضافة أعمدة tenantId والجداول/الفهارس المطلوبة إذا كانت مفقودة في الإنتاج.
 * آمنة (idempotent) ويمكن تشغيلها عدة مرات.
 */
export class AddTenantColumnsIfMissing20250823T2300 implements MigrationInterface {
  name = 'AddTenantColumnsIfMissing20250823T2300';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ===== users.tenantId =====
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='tenantId'
        ) THEN
          ALTER TABLE "users" ADD COLUMN "tenantId" uuid NULL;
        END IF;
      END$$;
    `);

    // فهرس users.tenantId
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_users_tenant" ON "users" ("tenantId");
    `);

    // مفتاح أجنبي اختياري (لو جدول tenants موجود) ـ دعم كلا الاسمين احتياطاً
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_tenant'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name in ('tenants','tenant')
        ) THEN
          BEGIN
            -- إذا وُجد جدول tenants نربط به، وإلا نحاول الجدول المفرد
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tenants') THEN
              ALTER TABLE "users" ADD CONSTRAINT "fk_users_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenants"(id) ON DELETE CASCADE;
            ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tenant') THEN
              ALTER TABLE "users" ADD CONSTRAINT "fk_users_tenant" FOREIGN KEY ("tenantId") REFERENCES "tenant"(id) ON DELETE CASCADE;
            END IF;
          EXCEPTION WHEN others THEN NULL; END;
        END IF;
      END$$;
    `);

    // ===== product_orders.tenantId =====
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='product_orders' AND column_name='tenantId'
        ) THEN
          ALTER TABLE "product_orders" ADD COLUMN "tenantId" uuid NULL;
        END IF;
      END$$;
    `);

    // تعبئة tenantId في الطلبات استناداً إلى users
    await queryRunner.query(`
      UPDATE "product_orders" o
      SET "tenantId" = u."tenantId"
      FROM "users" u
      WHERE o."userId" = u."id" AND o."tenantId" IS NULL;
    `);

    // جعل العمود NOT NULL إذا لم تعد هناك قيم NULL
    await queryRunner.query(`
      DO $$
      DECLARE c integer; BEGIN
        SELECT count(*) INTO c FROM "product_orders" WHERE "tenantId" IS NULL;
        IF c = 0 THEN
          BEGIN
            ALTER TABLE "product_orders" ALTER COLUMN "tenantId" SET NOT NULL;
          EXCEPTION WHEN others THEN NULL; -- تجاهل إن فشل
          END;
        END IF;
      END$$;
    `);

    // فهرس orders tenant
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_orders_tenant" ON "product_orders" ("tenantId");
    `);

    // فهرس فريد مركب (tenantId, orderNo)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE indexname='uq_orders_tenant_order_no'
        ) THEN
          CREATE UNIQUE INDEX "uq_orders_tenant_order_no" ON "product_orders" ("tenantId", "orderNo") WHERE "orderNo" IS NOT NULL;
        END IF;
      END$$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // تراجع لطيف: لا نحذف الأعمدة حتى لا نخسر البيانات، فقط نحذف الفهارس الجديدة إن أردت
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_orders_tenant_order_no";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_orders_tenant";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_tenant";`);
    // لا نحذف الأعمدة أو المفتاح الأجنبي لتفادي فقدان البيانات أو كسر الكود.
  }
}
