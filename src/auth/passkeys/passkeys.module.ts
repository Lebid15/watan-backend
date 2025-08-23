import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PasskeyCredential } from './passkey-credential.entity';
import { PasskeyChallengeStore } from './challenge-store.service';
import { PasskeysService } from './passkeys.service';
import { PasskeysController } from './passkeys.controller';
import { AuthService } from '../auth.service';
import { UserModule } from '../../user/user.module';

@Module({
  imports: [TypeOrmModule.forFeature([PasskeyCredential]), UserModule],
  providers: [PasskeyChallengeStore, PasskeysService],
  controllers: [PasskeysController],
  exports: [PasskeysService],
})
export class PasskeysModule {}