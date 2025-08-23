import { Controller, Post, Get, Delete, Param, Body, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { PasskeysService } from './passkeys.service';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { AuthService } from '../auth.service';

@Controller('auth/passkeys')
export class PasskeysController {
  constructor(private svc: PasskeysService, private auth: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req: any) {
    return this.svc.list(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('options/register')
  async optionsRegister(@Req() req: any) {
    return this.svc.startRegistration(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('register')
  async register(@Req() req: any, @Body() body: any) {
    const tenantId = req.user.tenantId ?? null;
    return this.svc.finishRegistration(req.user, body, tenantId);
  }

  // Login via passkey (no existing JWT)
  @Post('options/login')
  async optionsLogin(@Body() body: { emailOrUsername: string; tenantId?: string }) {
    if (!body?.emailOrUsername) throw new BadRequestException('emailOrUsername required');
    // NOTE: Need lookup user manually (simplified; using email + tenantId) - this requires user service but for brevity reuse auth.
    // We call internal validate with blank password path not ideal; better to query repository directly (omitted for brevity).
    return { error: 'Not implemented user lookup for passkey options/login yet' };
  }

  @Post('login')
  async login(@Body() body: any) {
    return { error: 'Not implemented passkey login finish yet' };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async delete(@Req() req: any, @Param('id') id: string) {
    return this.svc.delete(req.user.sub, id);
  }
}