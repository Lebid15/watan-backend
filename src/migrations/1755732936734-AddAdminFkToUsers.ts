import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAdminFkToUsers1755732936734 implements MigrationInterface {
    name = 'AddAdminFkToUsers1755732936734'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
            ADD CONSTRAINT "FK_users_adminId"
            FOREIGN KEY ("adminId") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_users_adminId"`);
    }
}
