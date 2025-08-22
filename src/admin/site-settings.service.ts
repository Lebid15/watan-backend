import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiteSetting } from './site-setting.entity';

type SettingKey = 'about' | 'infoes';

@Injectable()
export class SiteSettingsService {
  constructor(
    @InjectRepository(SiteSetting)
    private repo: Repository<SiteSetting>,
  ) {}

  async get(tenantId: string, key: SettingKey): Promise<string | null> {
    const row = await this.repo.findOne({ where: { tenantId, key } });
    return row?.value ?? null;
  }

  async set(tenantId: string, key: SettingKey, value: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { tenantId, key } });
    if (existing) {
      existing.value = value ?? '';
      await this.repo.save(existing);
    } else {
      await this.repo.insert({ tenantId, key, value: value ?? '' });
    }
  }
}
