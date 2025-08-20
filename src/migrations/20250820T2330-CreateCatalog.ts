import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCatalog20250820T2330 implements MigrationInterface {
  name = 'CreateCatalog20250820T2330';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "catalog_product" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(200) NOT NULL,
        "description" text,
        "imageUrl" varchar(500),
        "sourceType" varchar(20) NOT NULL DEFAULT 'external',
        "sourceProviderId" uuid,
        "externalProductId" varchar(120),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_catalog_product_name" ON "catalog_product" ("name");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_catalog_product_provider" ON "catalog_product" ("sourceProviderId");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_catalog_product_external" ON "catalog_product" ("externalProductId");`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "catalog_package" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "catalogProductId" uuid NOT NULL,
        "name" varchar(200) NOT NULL,
        "publicCode" varchar(120) UNIQUE NOT NULL,
        "sourceProviderId" uuid,
        "externalPackageId" varchar(120),
        "costPrice" numeric(18,6),
        "currencyCode" varchar(10),
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_catalog_package_product"
          FOREIGN KEY ("catalogProductId") REFERENCES "catalog_product"("id")
          ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_catalog_package_prod" ON "catalog_package" ("catalogProductId");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_catalog_package_provider" ON "catalog_package" ("sourceProviderId");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_catalog_package_external" ON "catalog_package" ("externalPackageId");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "catalog_package";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "catalog_product";`);
  }
}
