import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Post,
  BadRequestException,
  Req,
} from '@nestjs/common';
import type { Request } from 'express'; // ✅ type-only
import { CurrenciesService } from './currencies.service';
import { Currency } from './currency.entity';

@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly service: CurrenciesService) {}

  private getTenantId(req: Request): string {
    const fromUser = (req as any)?.user?.tenantId as string | undefined;
  const fromTenant = (req as any)?.tenant?.id as string | undefined; // ✅ middleware-resolved tenant
    const fromHeader = (req.headers['x-tenant-id'] as string | undefined) || undefined;
    const fromQuery = (req.query?.tenantId as string | undefined) || undefined;
  const tenantId = fromUser || fromTenant || fromHeader || fromQuery;
    if (!tenantId) throw new BadRequestException('tenantId is required');
    return tenantId;
  }

  @Get()
  async findAll(@Req() req: Request): Promise<Currency[]> {
    const tenantId = this.getTenantId(req);
    return this.service.findAll(tenantId);
  }

  @Post()
  async create(@Req() req: Request, @Body() body: Partial<Currency>): Promise<Currency> {
    const tenantId = this.getTenantId(req);
    return this.service.create(tenantId, body);
  }

  @Put('bulk-update')
  async bulkUpdate(@Req() req: Request, @Body() body: any): Promise<Currency[]> {
    const tenantId = this.getTenantId(req);
    const list: Partial<Currency>[] = Array.isArray(body) ? body : body?.currencies;
    if (!Array.isArray(list)) {
      throw new BadRequestException('Body must be an array of currencies or { currencies: [...] }');
    }
    return this.service.bulkUpdate(tenantId, list);
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() body: Partial<Currency>): Promise<Currency> {
    const tenantId = this.getTenantId(req);
    return this.service.update(tenantId, id, body);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string): Promise<{ ok: boolean }> {
    const tenantId = this.getTenantId(req);
    const ok = await this.service.remove(tenantId, id);
    return { ok };
  }

  @Post('seed-defaults')
  async seedDefaults(@Req() req: Request): Promise<Currency[]> {
    const tenantId = this.getTenantId(req);
    return this.service.seedDefaults(tenantId);
  }
}
