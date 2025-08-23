import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('/api/health returns status + meta', async () => {
  const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ status: 'ok', gitSha: expect.any(String), buildTime: expect.any(String) }));
  });

  it('/api/ready returns db status', async () => {
  const res = await request(app.getHttpServer()).get('/api/ready').expect(200);
    expect(res.body).toEqual(expect.objectContaining({ status: expect.any(String), db: expect.any(String) }));
  });
});
