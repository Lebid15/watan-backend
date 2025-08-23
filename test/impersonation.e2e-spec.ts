import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// This test assumes a developer user exists or will be created via bootstrap endpoint.
// For simplicity we simulate bootstrap-developer then assume-tenant (tenant must exist in DB; adjust if needed).

describe('Impersonation (e2e)', () => {
  let app: INestApplication;
  const devEmail = 'dev@example.com';
  const devPass = 'DevPass123!';
  const secret = process.env.BOOTSTRAP_DEV_SECRET || 'test-secret';

  let dataSource: DataSource;

  beforeAll(async () => {
    process.env.BOOTSTRAP_DEV_SECRET = secret; // ensure secret
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
    await app.init();
    dataSource = app.get<DataSource>(DataSource);
    // Seed developer deterministically
    const existing = await dataSource.getRepository('users').findOne({ where: { email: devEmail } as any });
    if (!existing) {
      const hash = await bcrypt.hash(devPass, 10);
      await dataSource.query(`INSERT INTO users (id, email, password, role, "tenantId", "balance", "overdraftLimit", "isActive")
        VALUES (gen_random_uuid(), $1, $2, 'developer', NULL, 0, 0, true)`, [devEmail, hash]);
    }
  });

  afterAll(async () => { await app.close(); });

  it('bootstrap developer (idempotent)', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/bootstrap-developer')
      .send({ secret, email: devEmail, password: devPass })
      .expect((r) => [200,409,403].includes(r.status));
  });

  it('login developer (global token)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ emailOrUsername: devEmail, password: devPass })
      .expect((r) => [200,201].includes(r.status));
    expect(res.body.token).toBeDefined();
  });
});
