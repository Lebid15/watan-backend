import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { jwtConstants } from '../src/auth/constants';
import { User } from '../src/user/user.entity';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Errors (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    const ds = app.get(DataSource);
    const dev = await ds.getRepository(User).findOne({ where: { role: 'developer' } as any });
    if (!dev) throw new Error('No developer user seeded');
    token = jwt.sign({ sub: dev.id, id: dev.id, role: 'developer' }, jwtConstants.secret, { expiresIn: '1h' });
  });

  afterAll(async () => { await app.close(); });

  it('POST /api/dev/errors/ingest stores a frontend error', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/dev/errors/ingest')
      .set('Authorization', `Bearer ${token}`)
      .send({ source: 'frontend', message: 'Test Front Error', stack: 'Error: Test Front Error' })
      .expect(201);
    expect(res.body).toEqual(expect.objectContaining({ id: expect.any(String), message: 'Test Front Error', source: 'frontend' }));
  });

  it('GET /api/dev/errors lists errors', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/dev/errors')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual(expect.objectContaining({ items: expect.any(Array), total: expect.any(Number) }));
  });
});
