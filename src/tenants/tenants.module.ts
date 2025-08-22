import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantsService } from './tenants.service';
import { TenantsAdminController } from './tenants.admin.controller';
import { Tenant } from './tenant.entity';
import { TenantDomain } from './tenant-domain.entity';
import { User } from '../user/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantDomain, User])],
  providers: [TenantsService],
  controllers: [TenantsAdminController],
  exports: [TenantsService],
})
export class TenantsModule {}
