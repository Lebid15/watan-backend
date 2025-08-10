import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPayments1754823000000 implements MigrationInterface {
    name = 'AddPayments1754823000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // enums
        await queryRunner.query(`CREATE TYPE "public"."payment_method_type_enum" AS ENUM ('CASH_BOX','BANK_ACCOUNT','HAND_DELIVERY','USDT','MONEY_TRANSFER')`);
        await queryRunner.query(`CREATE TYPE "public"."deposit_status_enum" AS ENUM ('pending','approved','rejected')`);

        // payment_method
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "payment_method" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "name" varchar(150) NOT NULL,
            "type" "public"."payment_method_type_enum" NOT NULL,
            "logoUrl" varchar(500),
            "note" text,
            "isActive" boolean NOT NULL DEFAULT true,
            "config" jsonb NOT NULL DEFAULT '{}',
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT "PK_payment_method_id" PRIMARY KEY ("id")
          )
        `);

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payment_method_type" ON "payment_method" ("type")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_payment_method_active" ON "payment_method" ("isActive")`);

        // deposit (بدون قيود FK مؤقتًا)
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS "deposit" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "user_id" uuid NOT NULL,
            "method_id" uuid NOT NULL,
            "originalAmount" numeric(18,6) NOT NULL,
            "originalCurrency" varchar(10) NOT NULL,
            "walletCurrency" varchar(10) NOT NULL,
            "rateUsed" numeric(18,6) NOT NULL,
            "convertedAmount" numeric(18,6) NOT NULL,
            "note" text,
            "status" "public"."deposit_status_enum" NOT NULL DEFAULT 'pending',
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT "PK_deposit_id" PRIMARY KEY ("id")
          )
        `);

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_deposit_user" ON "deposit" ("user_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_deposit_method" ON "deposit" ("method_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_deposit_status" ON "deposit" ("status")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_deposit_createdAt" ON "deposit" ("createdAt")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_deposit_createdAt"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_deposit_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_deposit_method"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_deposit_user"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "deposit"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_method_active"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payment_method_type"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "payment_method"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."deposit_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."payment_method_type_enum"`);
    }
}
