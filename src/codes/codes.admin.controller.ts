import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Delete,
  UseGuards,
  ConflictException,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';

import { CodeGroup } from './entities/code-group.entity';
import { CodeItem } from './entities/code-item.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';

@Controller('admin/codes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CodesAdminController {
  constructor(
    @InjectRepository(CodeGroup)
    private readonly groupRepo: Repository<CodeGroup>,
    @InjectRepository(CodeItem)
    private readonly itemRepo: Repository<CodeItem>, // ✅ تصحيح هنا
  ) {}

  private getTenantId(req: Request): string {
    const tenantId = (req as any)?.user?.tenantId as string | undefined;
    if (!tenantId) throw new BadRequestException('Missing tenantId');
    return tenantId;
  }

  // ======================
  // المجموعات
  // ======================

  @Get('groups')
  async listGroups(@Req() req: Request) {
    const tenantId = this.getTenantId(req);
    return this.groupRepo.find({
      where: { tenantId } as any,
      order: { createdAt: 'DESC' },
    });
  }

  @Post('groups')
  async createGroup(
    @Req() req: Request,
    @Body() dto: { name: string; publicCode: string; note?: string },
  ) {
    const tenantId = this.getTenantId(req);

    const code = (dto.publicCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9._-]{3,32}$/.test(code)) {
      throw new BadRequestException('Invalid publicCode format');
    }

    const exists = await this.groupRepo.findOne({
      where: { tenantId, publicCode: code } as any,
    });
    if (exists) {
      throw new BadRequestException('publicCode already exists');
    }

    const g = this.groupRepo.create({
      tenantId,
      name: dto.name,
      publicCode: code,
      note: dto.note,
      isActive: true,
    } as Partial<CodeGroup>);

    return this.groupRepo.save(g);
  }

  @Patch('groups/:id')
  async updateGroup(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: { name?: string; note?: string; isActive?: boolean },
  ) {
    const tenantId = this.getTenantId(req);

    const g = await this.groupRepo.findOne({ where: { id, tenantId } as any });
    if (!g) throw new NotFoundException('Group not found');

    if (dto.name !== undefined) g.name = dto.name;
    if (dto.note !== undefined) g.note = dto.note;
    if (dto.isActive !== undefined) g.isActive = dto.isActive;

    return this.groupRepo.save(g);
  }

  @Patch('groups/:id/toggle')
  async toggleGroup(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);

    const g = await this.groupRepo.findOne({ where: { id, tenantId } as any });
    if (!g) throw new NotFoundException('Group not found');

    g.isActive = !g.isActive;
    return this.groupRepo.save(g);
  }

  // ======================
  // الأكواد داخل المجموعة
  // ======================

  @Get('groups/:id/items')
  async listItems(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);

    // تأكد من ملكية المجموعة
    const g = await this.groupRepo.findOne({ where: { id, tenantId } as any });
    if (!g) throw new NotFoundException('Group not found');

    return this.itemRepo.find({
      where: { groupId: id, tenantId } as any,
      order: { createdAt: 'DESC' },
    });
  }

  @Post('groups/:id/items/bulk')
  async addBulkItems(
    @Req() req: Request,
    @Param('id') id: string,
    @Body()
    dto: {
      codes: string; // نص ملصوق (سطر لكل كود)
      cost?: number;
    },
  ) {
    const tenantId = this.getTenantId(req);

    const g = await this.groupRepo.findOne({ where: { id, tenantId } as any });
    if (!g) throw new NotFoundException('Group not found');

    const lines = (dto.codes || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      throw new BadRequestException('No codes provided');
    }

    const items: CodeItem[] = [];
    for (const line of lines) {
      let pin = line;
      let serial: string | undefined;

      // دعم شكل "PIN;SERIAL"
      if (line.includes(';')) {
        const [p, s] = line.split(';', 2);
        pin = p.trim();
        serial = s.trim();
      }

      const it = this.itemRepo.create({
        tenantId,
        groupId: id,
        pin,
        serial,
        cost: String(dto.cost ?? '0'),
        status: 'available',
      } as Partial<CodeItem>);

      items.push(it as CodeItem);
    }

    return this.itemRepo.save(items);
  }

  /** حذف كود منفرد */
  @Delete('items/:itemId')
  async deleteItem(@Req() req: Request, @Param('itemId') itemId: string) {
    const tenantId = this.getTenantId(req);

    const it = await this.itemRepo.findOne({ where: { id: itemId, tenantId } as any });
    if (!it) throw new NotFoundException('Item not found');

    // حماية بسيطة: لا نحذف كود مستخدم أو مرتبط بطلب
    if (it.status === 'used' || it.orderId) {
      throw new ConflictException('لا يمكن حذف كود مستخدم أو مرتبط بطلب');
    }

    await this.itemRepo.delete({ id: itemId, tenantId } as any);
    return { ok: true, id: itemId };
  }
}
