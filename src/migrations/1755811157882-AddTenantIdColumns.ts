import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTenantIdColumns1755811157882 implements MigrationInterface {
    name = 'AddTenantIdColumns1755811157882'

    public async up(queryRunner: QueryRunner): Promise<void> {
                // تنفيذ آمن بالكتلة
                await queryRunner.query(`
                    DO $$
                    BEGIN
                        -- احذف القيد القديم إن وجد (ملحوظة: قد يكون محذوف مسبقاً)
                        IF EXISTS (
                            SELECT 1 FROM pg_constraint WHERE conname='ux_package_costs_pkg_provider'
                        ) THEN
                            BEGIN
                                ALTER TABLE "package_costs" DROP CONSTRAINT "ux_package_costs_pkg_provider";
                            EXCEPTION WHEN others THEN NULL; END;
                        END IF;

                        -- أضف العمود tenantId إن لم يكن موجوداً
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='package_costs' AND column_name='tenantId'
                        ) THEN
                            BEGIN
                                ALTER TABLE "package_costs" ADD COLUMN "tenantId" uuid;
                            EXCEPTION WHEN others THEN NULL; END;
                        END IF;

                        -- تعبئة قيم NULL (تُنفذ كل مرة لكن بلا ضرر)
                        BEGIN
                            UPDATE "package_costs"
                            SET "tenantId" = '11111111-1111-1111-1111-111111111111'
                            WHERE "tenantId" IS NULL;
                        EXCEPTION WHEN others THEN NULL; END;

                        -- جعل العمود NOT NULL لو لا توجد قيم NULL متبقية وكان العمود قابل لـ NULL
                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='package_costs' AND column_name='tenantId' AND is_nullable='YES'
                        ) THEN
                            IF NOT EXISTS (SELECT 1 FROM "package_costs" WHERE "tenantId" IS NULL LIMIT 1) THEN
                                BEGIN
                                    ALTER TABLE "package_costs" ALTER COLUMN "tenantId" SET NOT NULL;
                                EXCEPTION WHEN others THEN NULL; END;
                            END IF;
                        END IF;

                        -- الفهرس
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_indexes WHERE indexname='idx_package_costs_tenant'
                        ) THEN
                            BEGIN
                                CREATE INDEX "idx_package_costs_tenant" ON "package_costs" ("tenantId");
                            EXCEPTION WHEN others THEN NULL; END;
                        END IF;

                        -- القيد الفريد الجديد
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint WHERE conname='ux_package_costs_pkg_provider_tenant'
                        ) THEN
                            BEGIN
                                ALTER TABLE "package_costs" ADD CONSTRAINT "ux_package_costs_pkg_provider_tenant" UNIQUE ("tenantId", "package_id", "providerId");
                            EXCEPTION WHEN others THEN NULL; END;
                        END IF;
                    END$$;
                `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
                // رجوع آمن (لا نحذف العمود افتراضياً لتفادي فقدان بيانات) فقط نحاول إرجاع الوضع السابق إن لزم
                await queryRunner.query(`
                    DO $$
                    BEGIN
                        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ux_package_costs_pkg_provider_tenant') THEN
                            BEGIN
                                ALTER TABLE "package_costs" DROP CONSTRAINT "ux_package_costs_pkg_provider_tenant";
                            EXCEPTION WHEN others THEN NULL; END;
                        END IF;

                        IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_package_costs_tenant') THEN
                            BEGIN
                                DROP INDEX "idx_package_costs_tenant";
                            EXCEPTION WHEN others THEN NULL; END;
                        END IF;

                        -- لا نحذف العمود؛ لو أردت حذفه افعل ذلك يدوياً

                        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ux_package_costs_pkg_provider') THEN
                            BEGIN
                                ALTER TABLE "package_costs" ADD CONSTRAINT "ux_package_costs_pkg_provider" UNIQUE ("providerId", "package_id");
                            EXCEPTION WHEN others THEN NULL; END;
                        END IF;
                    END$$;
                `);
    }
}
