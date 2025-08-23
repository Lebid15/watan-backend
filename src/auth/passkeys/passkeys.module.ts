import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PasskeyCredential } from './passkey-credential.entity';
import { AuthModule } from '../auth.module';
import { PasskeyChallengeStore } from './challenge-store.service';
import { PasskeysService } from './passkeys.service';
import { PasskeysController } from './passkeys.controller';
import { UserModule } from '../../user/user.module';
import { AuditModule } from '../../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([PasskeyCredential]), UserModule, AuditModule, AuthModule],
  providers: [PasskeyChallengeStore, PasskeysService],
  controllers: [PasskeysController],
  exports: [PasskeysService],
})
export class PasskeysModule {}