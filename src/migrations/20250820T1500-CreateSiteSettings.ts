import { MigrationInterface, QueryRunner, Table, TableUnique } from 'typeorm';

export class CreateSiteSettings20250820T1500 implements MigrationInterface {
  name = 'CreateSiteSettings20250820T1500';

  public async up(q: QueryRunner): Promise<void> {
    // (اختياري) PostgreSQL: تأكد من وجود امتداد UUID
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // 1) إن كان الجدول غير موجود — أنشئه
    const hasTable = await q.hasTable('site_settings');
    if (!hasTable) {
      await q.createTable(new Table({
        name: 'site_settings',
        columns: [
          // لو تحب الاعتماد على DB لتوليد UUID، أبقِ DEFAULT:
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'key', type: 'varchar', length: '64', isNullable: false },
          { name: 'value', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'timestamp', default: 'now()' },
          { name: 'updatedAt', type: 'timestamp', default: 'now()' },
        ],
      }));
    }

    // 2) تأكد من وجود القيد الفريد على key
    const table = await q.getTable('site_settings');
    const hasUniqueOnKey = !!table?.uniques?.some(
      (u) => u.columnNames.length === 1 && u.columnNames[0] === 'key'
    );

    if (!hasUniqueOnKey) {
      await q.createUniqueConstraint(
        'site_settings',
        new TableUnique({ name: 'UQ_site_settings_key', columnNames: ['key'] })
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    const hasTable = await q.hasTable('site_settings');
    if (!hasTable) return;

    try {
      await q.dropUniqueConstraint('site_settings', 'UQ_site_settings_key');
    } catch { /* لو مش موجود، تجاهل */ }

    await q.dropTable('site_settings', true);
  }
}
