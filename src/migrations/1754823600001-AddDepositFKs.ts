import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDepositFKs1754823600001 implements MigrationInterface {
  name = 'AddDepositFKs1754823600001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ربط deposit.user_id بجدول users(id)
    await queryRunner.query(`
      ALTER TABLE "deposit"
      ADD CONSTRAINT "FK_deposit_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // ربط deposit.method_id بجدول payment_method(id)
    await queryRunner.query(`
      ALTER TABLE "deposit"
      ADD CONSTRAINT "FK_deposit_method"
      FOREIGN KEY ("method_id") REFERENCES "payment_method"("id")
      ON DELETE RESTRICT ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "deposit" DROP CONSTRAINT IF EXISTS "FK_deposit_method"`);
    await queryRunner.query(`ALTER TABLE "deposit" DROP CONSTRAINT IF EXISTS "FK_deposit_user"`);
  }
}
