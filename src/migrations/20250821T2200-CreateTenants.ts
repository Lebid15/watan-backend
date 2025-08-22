import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateTenants20250821T2200 implements MigrationInterface {
    name = 'CreateTenants20250821T2200'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ✅ إنشاء جدول tenants
        await queryRunner.query(`
            CREATE TABLE "tenants" (
                "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                "name" varchar NOT NULL,
                "createdAt" timestamptz DEFAULT now(),
                "updatedAt" timestamptz DEFAULT now()
            )
        `);

        // ✅ users: إضافة tenantId وربطها
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD COLUMN "tenantId" uuid
        `);
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD CONSTRAINT "fk_users_tenant"
            FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE
        `);

        // ✅ product_orders: إضافة tenantId وربطها
        await queryRunner.query(`
            ALTER TABLE "product_orders"
            ADD COLUMN "tenantId" uuid
        `);
        await queryRunner.query(`
            CREATE INDEX "idx_product_orders_tenant" ON "product_orders" ("tenantId")
        `);
        await queryRunner.query(`
            ALTER TABLE "product_orders"
            ADD CONSTRAINT "fk_product_orders_tenant"
            FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // تراجع عن product_orders
        await queryRunner.query(`ALTER TABLE "product_orders" DROP CONSTRAINT "fk_product_orders_tenant"`);
        await queryRunner.query(`DROP INDEX "idx_product_orders_tenant"`);
        await queryRunner.query(`ALTER TABLE "product_orders" DROP COLUMN "tenantId"`);

        // تراجع عن users
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "fk_users_tenant"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "tenantId"`);

        // حذف tenants
        await queryRunner.query(`DROP TABLE "tenants"`);
    }
}
