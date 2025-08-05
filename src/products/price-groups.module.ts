import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceGroupsController } from './price-groups.controller';
import { PriceGroupsService } from './price-groups.service';
import { PriceGroup } from './price-group.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PriceGroup])],
  controllers: [PriceGroupsController],
  providers: [PriceGroupsService],
})
export class PriceGroupsModule {}
