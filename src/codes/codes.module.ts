import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CodeGroup } from './entities/code-group.entity';
import { CodeItem } from './entities/code-item.entity';
import { CodesService } from './codes.service';
import { CodesAdminController } from './codes.admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CodeGroup, CodeItem])],
  controllers: [CodesAdminController],
  providers: [CodesService],
  exports: [CodesService],
})
export class CodesModule {}
