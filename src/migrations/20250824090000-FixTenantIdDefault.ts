import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTenantIdDefault20250824090000 implements MigrationInterface {
  name = 'FixTenantIdDefault20250824090000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
DO $$
DECLARE v text; BEGIN
  BEGIN CREATE EXTENSION IF NOT EXISTS "pgcrypto"; EXCEPTION WHEN others THEN END;
  SELECT column_default INTO v FROM information_schema.columns WHERE table_name='tenant' AND column_name='id';
  IF v IS NULL OR length(trim(coalesce(v,'')))=0 THEN
    EXECUTE 'ALTER TABLE "tenant" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()';
  END IF;
END $$;`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "tenant" ALTER COLUMN "id" DROP DEFAULT');
  }
}
