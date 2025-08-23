import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePasskeyCredentials20250823T1500 implements MigrationInterface {
  name = 'CreatePasskeyCredentials20250823T1500'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "passkey_credentials" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "tenantId" uuid NULL,
        "credentialId" varchar(200) NOT NULL,
        "publicKey" bytea NOT NULL,
        "counter" bigint NOT NULL DEFAULT 0,
        "transports" text[] NULL,
        "deviceType" varchar(30) NULL,
        "backedUp" boolean NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "last_used_at" timestamptz NULL,
        CONSTRAINT "uq_passkey_credential_id" UNIQUE ("credentialId"),
        CONSTRAINT "fk_passkey_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_passkey_user" ON "passkey_credentials" ("userId")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_passkey_tenant_user" ON "passkey_credentials" ("tenantId", "userId")`);

    // Ensure username unique index exists ((tenantId, username)) if not already present in DB
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uniq_users_tenant_username'
        ) THEN
          EXECUTE 'CREATE UNIQUE INDEX "uniq_users_tenant_username" ON "users" ("tenantId","username") WHERE "username" IS NOT NULL';
        END IF;
      END$$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "passkey_credentials"`);
  }
}
