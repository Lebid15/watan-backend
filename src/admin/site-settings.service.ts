import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteSetting } from './site-setting.entity';

@Injectable()
export class SiteSettingsService {
  constructor(@InjectRepository(SiteSetting) private repo: Repository<SiteSetting>) {}

  async get(key: 'about' | 'infoes'): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row?.value ?? null;
  }

  async set(key: 'about' | 'infoes', value: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { key } });
    if (existing) { existing.value = value ?? ''; await this.repo.save(existing); }
    else { await this.repo.insert({ key, value: value ?? '' }); }
  }
}
