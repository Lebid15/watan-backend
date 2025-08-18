import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderNotesAndFx1723930000000 implements MigrationInterface {
  name = 'AddOrderNotesAndFx1723930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ملاحظات وإيضاحات
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "manualNote" text NULL,
      ADD COLUMN IF NOT EXISTS "notes" jsonb NULL
    `);

    // أعمدة البيع/التكلفة/الربح (إن ما كانت موجودة)
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "sellPriceCurrency" varchar(10) NOT NULL DEFAULT 'USD',
      ADD COLUMN IF NOT EXISTS "sellPriceAmount" numeric(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "costCurrency" varchar(10) NOT NULL DEFAULT 'USD',
      ADD COLUMN IF NOT EXISTS "costAmount" numeric(10,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "profitAmount" numeric(10,2) NOT NULL DEFAULT 0
    `);

    // حقول FX عند الاعتماد (تجميد القيم)
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      ADD COLUMN IF NOT EXISTS "fxUsdTryAtApproval" numeric(12,6) NULL,
      ADD COLUMN IF NOT EXISTS "sellTryAtApproval" numeric(12,2) NULL,
      ADD COLUMN IF NOT EXISTS "costTryAtApproval" numeric(12,2) NULL,
      ADD COLUMN IF NOT EXISTS "profitTryAtApproval" numeric(12,2) NULL,
      ADD COLUMN IF NOT EXISTS "profitUsdAtApproval" numeric(12,2) NULL,
      ADD COLUMN IF NOT EXISTS "approvedAt" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "approvedLocalDate" date NULL,
      ADD COLUMN IF NOT EXISTS "approvedLocalMonth" char(7) NULL,
      ADD COLUMN IF NOT EXISTS "fxCapturedAt" timestamptz NULL,
      ADD COLUMN IF NOT EXISTS "fxSource" varchar(50) NULL,
      ADD COLUMN IF NOT EXISTS "fxLocked" boolean NOT NULL DEFAULT false
    `);

    // مؤشر/قيود رقم الطلب المتسلسل (اختياري لو حابب تضمنه)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_orders_order_no'
        ) THEN
          CREATE UNIQUE INDEX idx_orders_order_no ON "product_orders" ("orderNo");
        END IF;
      END$$;
    `);

  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_orders"
      DROP COLUMN IF EXISTS "fxLocked",
      DROP COLUMN IF EXISTS "fxSource",
      DROP COLUMN IF EXISTS "fxCapturedAt",
      DROP COLUMN IF EXISTS "approvedLocalMonth",
      DROP COLUMN IF EXISTS "approvedLocalDate",
      DROP COLUMN IF EXISTS "approvedAt",
      DROP COLUMN IF EXISTS "profitUsdAtApproval",
      DROP COLUMN IF EXISTS "profitTryAtApproval",
      DROP COLUMN IF EXISTS "costTryAtApproval",
      DROP COLUMN IF EXISTS "sellTryAtApproval",
      DROP COLUMN IF EXISTS "fxUsdTryAtApproval",
      DROP COLUMN IF EXISTS "profitAmount",
      DROP COLUMN IF EXISTS "costAmount",
      DROP COLUMN IF EXISTS "costCurrency",
      DROP COLUMN IF EXISTS "sellPriceAmount",
      DROP COLUMN IF EXISTS "sellPriceCurrency",
      DROP COLUMN IF EXISTS "notes",
      DROP COLUMN IF EXISTS "manualNote"
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_orders_order_no'
        ) THEN
          DROP INDEX idx_orders_order_no;
        END IF;
      END$$;
    `);
  }
}
