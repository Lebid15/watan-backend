import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteSetting } from '../admin/site-setting.entity';

@Controller('pages')
export class PagesController {
  constructor(@InjectRepository(SiteSetting) private repo: Repository<SiteSetting>) {}

  @Get('about')  async about()  { return (await this.repo.findOne({ where: { key: 'about' } }))?.value ?? ''; }
  @Get('infoes') async infoes() { return (await this.repo.findOne({ where: { key: 'infoes' } }))?.value ?? ''; }
}
