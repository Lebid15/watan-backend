import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTenantIdColumns1755811157882 implements MigrationInterface {
    name = 'AddTenantIdColumns1755811157882'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // أزل الـ constraint القديم
        await queryRunner.query(`ALTER TABLE "package_costs" DROP CONSTRAINT IF EXISTS "ux_package_costs_pkg_provider"`);

        // أضف العمود بشكل nullable
        await queryRunner.query(`ALTER TABLE "package_costs" ADD COLUMN "tenantId" uuid`);

        // عيّن tenantId افتراضي لكل الصفوف القديمة
        await queryRunner.query(`UPDATE "package_costs" SET "tenantId" = '11111111-1111-1111-1111-111111111111' WHERE "tenantId" IS NULL`);

        // اجعل العمود NOT NULL
        await queryRunner.query(`ALTER TABLE "package_costs" ALTER COLUMN "tenantId" SET NOT NULL`);

        // أضف index
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_package_costs_tenant" ON "package_costs" ("tenantId")`);

        // أضف constraints جديدة
        await queryRunner.query(`ALTER TABLE "package_costs" ADD CONSTRAINT "ux_package_costs_pkg_provider_tenant" UNIQUE ("tenantId", "package_id", "providerId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // احذف الـ constraint الجديد
        await queryRunner.query(`ALTER TABLE "package_costs" DROP CONSTRAINT IF EXISTS "ux_package_costs_pkg_provider_tenant"`);

        // احذف الـ index
        await queryRunner.query(`DROP INDEX IF EXISTS "idx_package_costs_tenant"`);

        // احذف العمود tenantId
        await queryRunner.query(`ALTER TABLE "package_costs" DROP COLUMN "tenantId"`);

        // رجّع الـ constraint القديم
        await queryRunner.query(`ALTER TABLE "package_costs" ADD CONSTRAINT "ux_package_costs_pkg_provider" UNIQUE ("providerId", "package_id")`);
    }
}
