import { MigrationInterface, QueryRunner } from "typeorm";

export class AddFieldsToNotifications1754734605365 implements MigrationInterface {
    name = 'AddFieldsToNotifications1754734605365'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" ADD "readAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "link" character varying(300)`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "channel" character varying(20) NOT NULL DEFAULT 'in_app'`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD "priority" character varying(10) NOT NULL DEFAULT 'normal'`);
        await queryRunner.query(`CREATE INDEX "idx_notifications_created_at" ON "notifications" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "idx_notifications_is_read" ON "notifications" ("isRead") `);
        await queryRunner.query(`CREATE INDEX "idx_notifications_user_id" ON "notifications" ("user_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."idx_notifications_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_notifications_is_read"`);
        await queryRunner.query(`DROP INDEX "public"."idx_notifications_created_at"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "priority"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "channel"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "link"`);
        await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN "readAt"`);
    }

}
