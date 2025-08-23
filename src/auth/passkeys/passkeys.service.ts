import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasskeyCredential } from './passkey-credential.entity';
import { PasskeyChallengeStore } from './challenge-store.service';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class PasskeysService {
  private rpId: string;
  private rpName = 'Watan';
  private rpOrigin: string;
  private prod: boolean;
  private enabled: boolean; // disable gracefully if required env missing in prod

  constructor(
  @InjectRepository(PasskeyCredential) private creds: Repository<PasskeyCredential>,
  private challenges: PasskeyChallengeStore,
  private audit: AuditService,
  ) {
    this.prod = (process.env.NODE_ENV === 'production');
    this.rpId = process.env.RP_ID || 'localhost';
    this.rpOrigin = process.env.RP_ORIGIN || 'http://localhost:3000';
    const strict = process.env.PASSKEYS_STRICT === 'true';
    if (this.prod && (!process.env.RP_ID || !process.env.RP_ORIGIN)) {
      if (strict) {
        // Explicitly require configuration
        throw new Error('RP_ID and RP_ORIGIN required in production for WebAuthn (PASSKEYS_STRICT=true)');
      } else {
        // Soft-disable feature instead of crashing whole app
        // eslint-disable-next-line no-console
        console.warn('[Passkeys] Disabled: missing RP_ID / RP_ORIGIN in production. Set PASSKEYS_STRICT=true to enforce.');
        this.enabled = false;
        return;
      }
    }
    this.enabled = true;
  }

  async getUserCredentials(userId: string) {
    return this.creds.find({ where: { userId } });
  }

  async startRegistration(user: any) {
  if (!this.enabled) throw new BadRequestException('Passkeys disabled');
    const existing = await this.getUserCredentials(user.id);
    const composite = await this.challenges.create('reg', user.id); // id.challenge
    const [challengeRef, challenge] = composite.split('.', 2);
    // simplewebauthn v10+ requires userID as a BufferSource (not string)
    let userIdBytes: Uint8Array;
    try {
      const hex = (user.id || '').replace(/-/g, '');
      if (hex.length === 32) userIdBytes = Buffer.from(hex, 'hex'); else userIdBytes = Buffer.from(user.id, 'utf8');
    } catch { userIdBytes = Buffer.from(user.id, 'utf8'); }
    const rawOptions = generateRegistrationOptions({
      rpID: this.rpId,
      rpName: this.rpName,
      userID: userIdBytes,
      userName: user.email,
      timeout: 60_000,
      attestationType: 'none',
  // keep credential id as base64url string per library type expectations
  excludeCredentials: existing.map(c => ({ id: c.credentialId })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      challenge,
    });
    // Extract serializable properties (omit binary userID etc.)
    const options: any = {
      challenge, // reuse original challenge value
      timeout: (rawOptions as any).timeout,
      rp: (rawOptions as any).rp,
      user: { name: user.email },
      authenticatorSelection: (rawOptions as any).authenticatorSelection,
    };
    return { options, challengeRef };
  }

  async finishRegistration(user: any, payload: any, tenantId: string | null) {
  if (!this.enabled) throw new BadRequestException('Passkeys disabled');
    const { response, challengeRef } = payload || {};
    if (!response || !challengeRef) throw new BadRequestException('Missing response or challengeRef');
    const challenge = await this.challenges.consumeById(challengeRef, 'reg', user.id);
    if (!challenge) throw new BadRequestException('Invalid or expired challenge');
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: this.rpOrigin,
      expectedRPID: this.rpId,
      requireUserVerification: false,
    });
    if (!verification.verified || !verification.registrationInfo) throw new BadRequestException('Registration not verified');
    const { credential: { id: rawId, publicKey: credentialPublicKey, counter } } = verification.registrationInfo as any;
    const credentialIdB64 = Buffer.from(rawId).toString('base64url');
    const entity = this.creds.create({
      userId: user.id,
      tenantId: tenantId ?? null,
      credentialId: credentialIdB64,
      publicKey: credentialPublicKey,
      counter,
    });
    await this.creds.save(entity);
    try { await this.audit.log('passkey_add', { actorUserId: user.id, targetUserId: user.id, targetTenantId: tenantId ?? null, meta: { credentialId: entity.credentialId } }); } catch {}
    return { ok: true, id: entity.id };
  }

  async startAuthentication(user: any) {
  if (!this.enabled) throw new BadRequestException('Passkeys disabled');
    const creds = await this.getUserCredentials(user.id);
    if (!creds.length) throw new NotFoundException('No passkeys');
    const composite = await this.challenges.create('auth', user.id);
    const [challengeRef, challenge] = composite.split('.', 2);
    const options = generateAuthenticationOptions({
      rpID: this.rpId,
      timeout: 60_000,
  allowCredentials: creds.map(c => ({ id: c.credentialId })),
      userVerification: 'preferred',
      challenge,
    });
    return { options, challengeRef };
  }

  async finishAuthentication(user: any, payload: any) {
  if (!this.enabled) throw new BadRequestException('Passkeys disabled');
    const { response, challengeRef } = payload || {};
    if (!response || !challengeRef) throw new BadRequestException('Missing response or challengeRef');
    const challenge = await this.challenges.consumeById(challengeRef, 'auth', user.id);
    if (!challenge) throw new BadRequestException('Invalid or expired challenge');
    const credIdB64 = response.id; // base64url id
    const dbCred = await this.creds.findOne({ where: { credentialId: credIdB64 } });
    if (!dbCred) throw new NotFoundException('Credential not found');
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedRPID: this.rpId,
      expectedOrigin: this.rpOrigin,
      requireUserVerification: false,
      credential: {
  id: dbCred.credentialId,
        publicKey: dbCred.publicKey,
        counter: Number(dbCred.counter),
        transports: (dbCred.transports as any) || undefined,
      },
    });
    if (!verification.verified || !verification.authenticationInfo) {
      try { await this.audit.log('passkey_login_fail', { actorUserId: user.id, targetUserId: user.id, targetTenantId: dbCred?.tenantId ?? null, meta: { reason: 'verification_failed' } }); } catch {}
      throw new ForbiddenException('Auth not verified');
    }
    dbCred.counter = verification.authenticationInfo.newCounter;
    dbCred.lastUsedAt = new Date();
    await this.creds.save(dbCred);
    try { await this.audit.log('passkey_login_success', { actorUserId: user.id, targetUserId: user.id, targetTenantId: dbCred.tenantId ?? null, meta: { credentialId: dbCred.credentialId } }); } catch {}
    return { ok: true, tenantId: dbCred.tenantId };
  }

  async list(userId: string) {
  if (!this.enabled) return [];
    return this.creds.find({ where: { userId } });
  }

  async delete(userId: string, id: string) {
  if (!this.enabled) throw new BadRequestException('Passkeys disabled');
    const cred = await this.creds.findOne({ where: { id, userId } });
    if (!cred) throw new NotFoundException('Credential not found');
  await this.creds.remove(cred);
  try { await this.audit.log('passkey_delete', { actorUserId: userId, targetUserId: userId, targetTenantId: cred.tenantId ?? null, meta: { credentialId: cred.credentialId } }); } catch {}
    return { ok: true };
  }
}