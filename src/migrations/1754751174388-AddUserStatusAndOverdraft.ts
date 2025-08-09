import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserStatusAndOverdraft1754751174388 implements MigrationInterface {
    name = 'AddUserStatusAndOverdraft1754751174388'

    public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "overdraftLimit" numeric(12,2) NOT NULL DEFAULT 0`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "overdraftLimit"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "isActive"`);
    }
}
