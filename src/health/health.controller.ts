import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

@Controller()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  private buildMeta() {
    const envBuildPath = path.join(process.cwd(), '.env.build');
    let gitSha = process.env.GIT_SHA || 'unknown';
    let buildTime = process.env.BUILD_TIME || 'unknown';
    let version = process.env.VERSION || process.env.npm_package_version || '0.0.0';
    if (fs.existsSync(envBuildPath)) {
      const lines = fs.readFileSync(envBuildPath, 'utf8').split(/\r?\n/);
      for (const l of lines) {
        const [k, v] = l.split('=');
        if (k === 'GIT_SHA' && v) gitSha = v;
        if (k === 'BUILD_TIME' && v) buildTime = v;
        if (k === 'VERSION' && v) version = v;
      }
    }
    return { version, gitSha, buildTime };
  }

  @Get('health')
  health() {
    return { status: 'ok', ...this.buildMeta() };
  }

  @Get('ready')
  async ready() {
    let db = 'down';
    try {
      await this.dataSource.query('SELECT 1');
      db = 'up';
    } catch {}
    return { status: db === 'up' ? 'ok' : 'degraded', db, ...this.buildMeta() };
  }
}
