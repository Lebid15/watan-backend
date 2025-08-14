import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class AddPackageMappings1715000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'package_mappings',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'our_package_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'provider_api_id',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'provider_package_id',
            type: 'varchar',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'package_mappings',
      new TableIndex({
        name: 'idx_package_mappings_api',
        columnNames: ['provider_api_id'],
      }),
    );

    await queryRunner.createIndex(
      'package_mappings',
      new TableIndex({
        name: 'idx_package_mappings_our_package',
        columnNames: ['our_package_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('package_mappings');
  }
}
