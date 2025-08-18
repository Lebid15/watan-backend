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
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    private readonly itemRepo: Repository<CodeItem>,
  ) {}

  // ======================
  // المجموعات
  // ======================

  @Get('groups')
  async listGroups() {
    return this.groupRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  @Post('groups')
  async createGroup(
    @Body() dto: { name: string; publicCode: string; note?: string },
  ) {
    const code = (dto.publicCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9._-]{3,32}$/.test(code)) {
      throw new BadRequestException('Invalid publicCode format');
    }
    const exists = await this.groupRepo.findOne({
      where: { publicCode: code },
    });
    if (exists) {
      throw new BadRequestException('publicCode already exists');
    }
    const g = this.groupRepo.create({
      name: dto.name,
      publicCode: code,
      note: dto.note,
    });
    return this.groupRepo.save(g);
  }

  @Patch('groups/:id')
  async updateGroup(
    @Param('id') id: string,
    @Body() dto: { name?: string; note?: string; isActive?: boolean },
  ) {
    const g = await this.groupRepo.findOne({ where: { id } });
    if (!g) throw new BadRequestException('Group not found');
    if (dto.name !== undefined) g.name = dto.name;
    if (dto.note !== undefined) g.note = dto.note;
    if (dto.isActive !== undefined) g.isActive = dto.isActive;
    return this.groupRepo.save(g);
  }

  @Patch('groups/:id/toggle')
  async toggleGroup(@Param('id') id: string) {
    const g = await this.groupRepo.findOne({ where: { id } });
    if (!g) throw new BadRequestException('Group not found');
    g.isActive = !g.isActive;
    return this.groupRepo.save(g);
  }

  // ======================
  // الأكواد داخل المجموعة
  // ======================

  @Get('groups/:id/items')
  async listItems(@Param('id') id: string) {
    return this.itemRepo.find({
      where: { groupId: id },
      order: { createdAt: 'DESC' },
    });
  }

  @Post('groups/:id/items/bulk')
  async addBulkItems(
    @Param('id') id: string,
    @Body()
    dto: {
      codes: string; // نص ملصوق (سطر لكل كود)
      cost?: number;
    },
  ) {
    const g = await this.groupRepo.findOne({ where: { id } });
    if (!g) throw new BadRequestException('Group not found');

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
      groupId: id,                
      pin,
      serial,
      cost: String(dto.cost || '0'),
      status: 'available',
      });
      items.push(it);
    }

    return this.itemRepo.save(items);
  }

    /** حذف كود منفرد */
  @Delete('items/:itemId')
  async deleteItem(@Param('itemId') itemId: string) {
    const it = await this.itemRepo.findOne({ where: { id: itemId } });
    if (!it) throw new BadRequestException('Item not found');

    // حماية بسيطة: لا نحذف كود مستخدم أو مرتبط بطلب
    if (it.status === 'used' || it.orderId) {
      throw new ConflictException('لا يمكن حذف كود مستخدم أو مرتبط بطلب');
    }

    await this.itemRepo.delete(itemId);
    return { ok: true, id: itemId };
  }

}
