import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ErrorsService } from './errors.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';
import { Req } from '@nestjs/common';

@Controller('dev/errors')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.DEVELOPER, UserRole.INSTANCE_OWNER)
export class ErrorsController {
  constructor(private readonly errors: ErrorsService) {}

  @Post('ingest')
  async ingest(@Body() body: any, @Req() req: any) {
    const user: any = (req as any).user || {};
    return this.errors.ingest({
      source: body.source || 'frontend',
      level: body.level || 'error',
      name: body.name,
      message: body.message || 'Unknown error',
      stack: body.stack,
      path: body.path || body.url || (req as any).path,
      method: body.method,
      userId: user.id || null,
      tenantId: user.tenantId || null,
      userAgent: req.headers['user-agent'],
      context: body.context,
    });
  }

  @Get()
  async list(@Query() q: any) {
    return this.errors.list({
      q: q.q,
      source: q.source,
      level: q.level,
      status: q.status,
      userId: q.userId,
      tenantId: q.tenantId,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      skip: q.skip ? parseInt(q.skip) : 0,
      take: q.take ? parseInt(q.take) : undefined,
    });
  }

  @Get(':id')
  async get(@Param('id') id: string) { return this.errors.findOne(id); }

  @Post(':id/resolve')
  async resolve(@Param('id') id: string) { return this.errors.resolve(id); }

  @Delete(':id')
  async remove(@Param('id') id: string) { await this.errors.delete(id); return { ok: true }; }
}
