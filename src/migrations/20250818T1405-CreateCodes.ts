import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCodes20250818T1405 implements MigrationInterface {
  name = 'CreateCodes20250818T1405';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "code_group" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(64) NOT NULL,
        "publicCode" varchar(32) NOT NULL,
        "note" text,
        "providerType" varchar(32) NOT NULL DEFAULT 'internal_codes',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_code_group_publicCode" ON "code_group" ("publicCode");`);
    await queryRunner.query(`CREATE INDEX "IDX_code_group_name" ON "code_group" ("name");`);
    await queryRunner.query(`CREATE INDEX "IDX_code_group_isActive" ON "code_group" ("isActive");`);

    await queryRunner.query(`
      CREATE TABLE "code_item" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "groupId" uuid NOT NULL,
        "pin" varchar(256),
        "serial" varchar(256),
        "cost" numeric(12,2) NOT NULL DEFAULT 0,
        "status" varchar(16) NOT NULL DEFAULT 'available',
        "orderId" uuid,
        "reservedAt" TIMESTAMPTZ,
        "usedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_code_item_group" FOREIGN KEY ("groupId") REFERENCES "code_group"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX "IDX_code_item_groupId" ON "code_item" ("groupId");`);
    await queryRunner.query(`CREATE INDEX "IDX_code_item_status" ON "code_item" ("status");`);
    await queryRunner.query(`CREATE INDEX "IDX_code_item_orderId" ON "code_item" ("orderId");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_code_item_orderId";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_code_item_status";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_code_item_groupId";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "code_item";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_code_group_isActive";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_code_group_name";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_code_group_publicCode";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "code_group";`);
  }
}
