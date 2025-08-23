import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDepositFKs1754823600001 implements MigrationInterface {
  name = 'AddDepositFKs1754823600001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ربط القيود لكن بشكل آمن (idempotent)
    await queryRunner.query(`
      DO $$
      BEGIN
        -- FK_deposit_user
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_deposit_user'
        ) THEN
          BEGIN
            ALTER TABLE "deposit"
            ADD CONSTRAINT "FK_deposit_user"
            FOREIGN KEY ("user_id") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
          EXCEPTION WHEN others THEN NULL; -- تجاهل لو العمود/الجدول مفقود
          END;
        END IF;

        -- FK_deposit_method
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_deposit_method'
        ) THEN
          BEGIN
            ALTER TABLE "deposit"
            ADD CONSTRAINT "FK_deposit_method"
            FOREIGN KEY ("method_id") REFERENCES "payment_method"("id")
            ON DELETE RESTRICT ON UPDATE NO ACTION;
          EXCEPTION WHEN others THEN NULL;
          END;
        END IF;
      END$$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "deposit" DROP CONSTRAINT IF EXISTS "FK_deposit_method"`);
    await queryRunner.query(`ALTER TABLE "deposit" DROP CONSTRAINT IF EXISTS "FK_deposit_user"`);
  }
}
