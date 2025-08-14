import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateIntegrations1755000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    const exists = await queryRunner.hasTable('integrations');
    if (!exists) {
      await queryRunner.createTable(new Table({
        name: 'integrations',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'name', type: 'varchar', length: '120' },
          { name: 'provider', type: 'varchar', length: '20' },
          { name: 'baseUrl', type: 'varchar', isNullable: true },
          { name: 'apiToken', type: 'varchar', isNullable: true },
          { name: 'kod', type: 'varchar', isNullable: true },
          { name: 'sifre', type: 'varchar', isNullable: true },
          { name: 'createdAt', type: 'timestamp with time zone', default: 'now()' },
        ],
      }));
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const exists = await queryRunner.hasTable('integrations');
    if (exists) {
      await queryRunner.dropTable('integrations');
    }
  }
}
