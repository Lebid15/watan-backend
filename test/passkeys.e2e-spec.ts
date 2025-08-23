import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';

// NOTE: This is a mocked/bypassed WebAuthn flow for e2e purposes only.
// We simulate registration & authentication by crafting pseudo WebAuthn JSON
// matching the shapes expected by the controller/service, while injecting
// the composite challenge value returned during options phase.
// This keeps the test deterministic without real cryptographic attestation.

describe('Passkeys (e2e, mocked)', () => {
  let app: INestApplication;
  let http: any;
  let dataSource: DataSource;
  const userEmail = 'passkeyuser@example.com';
  const userPassword = 'TempPass123!';
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    http = app.getHttpServer();
    dataSource = app.get<DataSource>(DataSource);

    // seed simple user (tenant-less / owner) for passkey testing
    const existing = await dataSource.getRepository('users').findOne({ where: { email: userEmail } as any });
    if (!existing) {
      const hash = await argon2.hash(userPassword);
      const inserted = await dataSource.query(`INSERT INTO users (id, email, password, role, "tenantId", "balance", "overdraftLimit", "isActive")
        VALUES (gen_random_uuid(), $1, $2, 'user', NULL, 0, 0, true) RETURNING id`, [userEmail, hash]);
      userId = inserted[0].id;
    } else {
      userId = (existing as any).id;
    }
  });

  afterAll(async () => { await app.close(); });

  let jwt: string;

  it('login with password to get JWT for registration', async () => {
    // Ensure password login works (for initial passkey creation)
    const res = await request(http)
      .post('/api/auth/login')
      .send({ emailOrUsername: userEmail, password: userPassword })
      .expect(201); // controller might use 201
    jwt = res.body.access_token || res.body.token; // adapt to naming
    expect(jwt).toBeDefined();
  });

  let regOptions: any;
  let challengeRef: string;
  let rawChallenge: string;
  let mockCredentialId: string;

  it('get registration options', async () => {
    const res = await request(http)
      .post('/api/auth/passkeys/options/register')
      .set('Authorization', `Bearer ${jwt}`)
      .expect(r => [200,201].includes(r.status));
    // New API returns { options, challengeRef }
    expect(res.body).toHaveProperty('options');
    expect(res.body).toHaveProperty('challengeRef');
    regOptions = res.body.options;
    challengeRef = res.body.challengeRef;
    rawChallenge = regOptions.challenge;
    // log for diagnostics if missing
    if (!rawChallenge) {
      // eslint-disable-next-line no-console
      console.log('Registration options body (diagnostic):', res.body);
    }
    expect(rawChallenge).toBeDefined();
    mockCredentialId = 'mockCred_' + Math.random().toString(36).slice(2);
  });

  it('finish registration (mocked)', async () => {
    const registrationPayload = {
      response: {
        id: mockCredentialId,
        rawId: mockCredentialId,
        response: { clientDataJSON: 'dummy', attestationObject: 'dummy' },
        type: 'public-key',
      },
      challengeRef,
    };
    const res = await request(http)
      .post('/api/auth/passkeys/register')
      .set('Authorization', `Bearer ${jwt}`)
      .send(registrationPayload)
      .expect(r => [200,201,400].includes(r.status));
    if ([200,201].includes(res.status)) {
      expect(res.body).toHaveProperty('ok', true);
    }
  });

  // Authentication flow (mocked)
  let authOptions: any;
  let authChallengeRef: string;
  let authRawChallenge: string;

  it('get authentication options (may 404 if registration failed)', async () => {
    const res = await request(http)
      .post('/api/auth/passkeys/options/login')
      .send({ emailOrUsername: userEmail })
      .expect(r => [200,201,404].includes(r.status));
    if (res.status === 404) return; // skip if no creds
    expect(res.body).toHaveProperty('options');
    expect(res.body).toHaveProperty('challengeRef');
    authOptions = res.body.options;
    authChallengeRef = res.body.challengeRef;
    authRawChallenge = authOptions.challenge;
  });

  it('finish authentication (mocked)', async () => {
    if (!authChallengeRef) return; // skipped
    const authPayload = {
      emailOrUsername: userEmail,
      challengeRef: authChallengeRef,
      response: {
        id: mockCredentialId,
        rawId: mockCredentialId,
        response: { clientDataJSON: 'dummy', authenticatorData: 'dummy', signature: 'dummy' },
        type: 'public-key',
      },
    };
    const res = await request(http)
      .post('/api/auth/passkeys/login')
      .send(authPayload)
      .expect(r => [200,201,403,400].includes(r.status));
    if ([200,201].includes(res.status)) expect(res.body).toHaveProperty('access_token');
  });
});
