import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTenantDomainIdDefault20250824T0915 implements MigrationInterface {
  name = 'FixTenantDomainIdDefault20250824T0915';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
DO $$
DECLARE v text; 
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid
  EXCEPTION WHEN others THEN END;

  SELECT column_default INTO v
  FROM information_schema.columns
  WHERE table_name='tenant_domain' AND column_name='id';

  IF v IS NULL OR length(trim(coalesce(v,'')))=0 THEN
    EXECUTE 'ALTER TABLE "tenant_domain" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()';
  END IF;
END $$;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "tenant_domain" ALTER COLUMN "id" DROP DEFAULT');
  }
}
