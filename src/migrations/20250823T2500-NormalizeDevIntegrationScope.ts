import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * تصحيح صفوف integrations القديمة التي أُنشئت كمزوّد مطوّر لكن scope بقي "tenant" بسبب إصدار قديم.
 * تجعلها scope='dev' حتى تظهر في قائمة مزوّدي المطوّر ولا تعيق إنشاء مزود جديد بنفس الاسم.
 * Idempotent (آمنة لإعادة التشغيل)؛ لن تعدل صفاً مضبوطاً بالفعل.
 */
export class NormalizeDevIntegrationScope20250823T2500 implements MigrationInterface {
  name = 'NormalizeDevIntegrationScope20250823T2500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        affected int;
      BEGIN
        UPDATE integrations
        SET scope = 'dev'
        WHERE "tenantId" = '00000000-0000-0000-0000-000000000000'
          AND scope <> 'dev';
        GET DIAGNOSTICS affected = ROW_COUNT;
        RAISE NOTICE '[NormalizeDevIntegrationScope] updated % rows to scope=dev', affected;
      END$$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
  // لا حاجة للتراجع: ترك scope='dev' آمن ولا يؤثر سلباً.
  }
}
