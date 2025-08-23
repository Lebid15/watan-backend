import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthTokenIndexesAndUserEmailUnique20250823T1700 implements MigrationInterface {
  name = 'AuthTokenIndexesAndUserEmailUnique20250823T1700';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Additional index to speed up lookups & enforce single-user/type active scanning
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_auth_token_user_type" ON "auth_tokens" ("userId", "type")`);
    // Unique index for (tenantId,email) already declared at entity level; ensure exists (for safety create unique if not existing)
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_users_tenant_email'
      ) THEN
        CREATE UNIQUE INDEX "uniq_users_tenant_email" ON "users" ("tenantId", "email");
      END IF;
    END $$;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_auth_token_user_type"`);
    // Don't drop uniq_users_tenant_email to avoid data integrity loss
  }
}
