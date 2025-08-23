import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasskeyCredential } from './passkey-credential.entity';
import { PasskeyChallengeStore } from './challenge-store.service';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';

@Injectable()
export class PasskeysService {
  private rpId: string;
  private rpName = 'Watan';
  private rpOrigin: string;
  private prod: boolean;

  constructor(
    @InjectRepository(PasskeyCredential) private creds: Repository<PasskeyCredential>,
    private challenges: PasskeyChallengeStore,
  ) {
    this.prod = (process.env.NODE_ENV === 'production');
    this.rpId = process.env.RP_ID || 'localhost';
    this.rpOrigin = process.env.RP_ORIGIN || 'http://localhost:3000';
    if (this.prod && (!process.env.RP_ID || !process.env.RP_ORIGIN)) {
      throw new Error('RP_ID and RP_ORIGIN required in production for WebAuthn');
    }
  }

  async getUserCredentials(userId: string) {
    return this.creds.find({ where: { userId } });
  }

  async startRegistration(user: any) {
    const existing = await this.getUserCredentials(user.id);
    const challenge = await this.challenges.create('reg', user.id);
    const options = generateRegistrationOptions({
      rpID: this.rpId,
      rpName: this.rpName,
      userID: user.id,
      userName: user.email,
      timeout: 60_000,
      attestationType: 'none',
      excludeCredentials: existing.map(c => ({ id: c.credentialId })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      challenge,
    });
    return options;
  }

  async finishRegistration(user: any, response: any, tenantId: string | null) {
    const { id } = response; // credentialId
    const expectedChallenge = response.response?.clientDataJSON ? response.response.clientDataJSON : undefined;
    // Actually simplewebauthn handles challenge verifying; we used store composite so pass composite then consume
    const compositeChallenge = response?.clientExtensionResults?.challenge || response?.challenge || response?.expectedChallenge;
    if (!compositeChallenge) throw new BadRequestException('Missing challenge reference');
    const challengeOk = await this.challenges.consume(compositeChallenge, 'reg', user.id);
    if (!challengeOk) throw new BadRequestException('Invalid or expired challenge');
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeOk,
      expectedOrigin: this.rpOrigin,
      expectedRPID: this.rpId,
      requireUserVerification: false,
    });
    if (!verification.verified || !verification.registrationInfo) throw new BadRequestException('Registration not verified');
  const { credential: { id: credentialID, publicKey: credentialPublicKey, counter } } = verification.registrationInfo as any;
    // store
    const entity = this.creds.create({
      userId: user.id,
      tenantId: tenantId ?? null,
      credentialId: Buffer.from(credentialID).toString('base64url'),
      publicKey: credentialPublicKey,
      counter,
    });
    await this.creds.save(entity);
    return { ok: true, id: entity.id };
  }

  async startAuthentication(user: any) {
    const creds = await this.getUserCredentials(user.id);
    if (!creds.length) throw new NotFoundException('No passkeys');
    const challenge = await this.challenges.create('auth', user.id);
    return generateAuthenticationOptions({
      rpID: this.rpId,
      timeout: 60_000,
      allowCredentials: creds.map(c => ({ id: c.credentialId })),
      userVerification: 'preferred',
      challenge,
    });
  }

  async finishAuthentication(user: any, response: any) {
    const compositeChallenge = response?.clientExtensionResults?.challenge || response?.challenge || response?.expectedChallenge;
    if (!compositeChallenge) throw new BadRequestException('Missing challenge reference');
    const challengeOk = await this.challenges.consume(compositeChallenge, 'auth', user.id);
    if (!challengeOk) throw new BadRequestException('Invalid or expired challenge');
  const credId = response.id; // base64url id supplied by client
  const dbCred = await this.creds.findOne({ where: { credentialId: credId } });
    if (!dbCred) throw new NotFoundException('Credential not found');
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeOk,
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
    if (!verification.verified || !verification.authenticationInfo) throw new ForbiddenException('Auth not verified');
    dbCred.counter = verification.authenticationInfo.newCounter;
    dbCred.lastUsedAt = new Date();
    await this.creds.save(dbCred);
    return { ok: true, tenantId: dbCred.tenantId };
  }

  async list(userId: string) {
    return this.creds.find({ where: { userId } });
  }

  async delete(userId: string, id: string) {
    const cred = await this.creds.findOne({ where: { id, userId } });
    if (!cred) throw new NotFoundException('Credential not found');
    await this.creds.remove(cred);
    return { ok: true };
  }
}