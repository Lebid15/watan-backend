import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAdminFkToUsers1755732936734 implements MigrationInterface {
    name = 'AddAdminFkToUsers1755732936734'

    public async up(queryRunner: QueryRunner): Promise<void> {
                await queryRunner.query(`
                    DO $$
                    BEGIN
                        -- تأكد أن العمود موجود (قد يكون أُنشئ سابقاً عبر entity sync قديم)
                        IF NOT EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_name='users' AND column_name='adminId'
                        ) THEN
                            BEGIN
                                ALTER TABLE "users" ADD COLUMN "adminId" uuid NULL;
                            EXCEPTION WHEN others THEN NULL; END;
                        END IF;

                        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FK_users_adminId') THEN
                            BEGIN
                                ALTER TABLE "users"
                                ADD CONSTRAINT "FK_users_adminId"
                                FOREIGN KEY ("adminId") REFERENCES "users"("id")
                                ON DELETE SET NULL ON UPDATE NO ACTION;
                            EXCEPTION WHEN others THEN NULL; END;
                        END IF;
                    END$$;
                `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
                await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "FK_users_adminId"`);
    }
}
