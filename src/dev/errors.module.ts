import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ErrorLog } from './error-log.entity';
import { ErrorsService } from './errors.service';
import { ErrorsController } from './errors.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ErrorLog])],
  providers: [ErrorsService],
  exports: [ErrorsService],
  controllers: [ErrorsController],
})
export class ErrorsModule {}
