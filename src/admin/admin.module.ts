import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UserModule } from '../user/user.module';
import { UploadController } from './upload.controller';

@Module({
  imports: [UserModule],  // إضافة هذا السطر
  controllers: [AdminController, UploadController],
  providers: [JwtAuthGuard, RolesGuard],
})
export class AdminModule {}
