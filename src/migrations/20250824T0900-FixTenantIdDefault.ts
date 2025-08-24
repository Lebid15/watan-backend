import { MigrationInterface, QueryRunner } from 'typeorm';

// Fix: ensure tenant.id has a UUID default in production where the table was created without one.
export class FixTenantIdDefault20250824T0900 implements MigrationInterface {
  name = 'FixTenantIdDefault20250824T0900';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
DO $$
DECLARE v text; 
BEGIN
  -- Ensure required extension for gen_random_uuid (pgcrypto) exists (ignore errors if lacks permission)
  BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  EXCEPTION WHEN others THEN
    -- ignore
  END;

  SELECT column_default INTO v
  FROM information_schema.columns
  WHERE table_name='tenant' AND column_name='id';

  -- If no default (or an empty / NULL expression), set one.
  IF v IS NULL OR length(trim(coalesce(v,''))) = 0 THEN
    EXECUTE 'ALTER TABLE "tenant" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()';
  END IF;
END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to no default (safe; existing rows keep their UUIDs)
    await queryRunner.query('ALTER TABLE "tenant" ALTER COLUMN "id" DROP DEFAULT');
  }
}
