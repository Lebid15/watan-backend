// src/user/user.controller.ts
import {
  Controller, Post, Put, Get, Delete, Patch,
  Body, ConflictException, BadRequestException,
  UseGuards, Param, ParseUUIDPipe, NotFoundException, Request, Req, Query,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole } from '../auth/user-role.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuthGuard } from '@nestjs/passport';
import { AdminSetPasswordDto } from './dto/admin-set-password.dto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { User } from './user.entity';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  async register(@Body() createUserDto: CreateUserDto, @Req() req) {
    const tenantId = req.tenant?.id;
    if (!tenantId) throw new BadRequestException('Tenant not found');

    if (!createUserDto.email || !createUserDto.password || !createUserDto.currencyId) {
      throw new BadRequestException('Email, password and currencyId are required');
    }
    const existingUser = await this.userService.findByEmail(createUserDto.email, tenantId);
    if (existingUser) throw new ConflictException('Email already in use');

    const user = await this.userService.createUser(createUserDto, tenantId);
    return {
      id: user.id,
      email: user.email,
      currency: user.currency ? { id: user.currency.id, code: user.currency.code } : null,
    };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@Request() req) {
    // خذ tenantId من سياق الطلب أو من الـ JWT (قد يكون null للمالك)
    const tokenTenant: string | null = req.user?.tenantId ?? null;
    const tenantId: string | null = req.tenant?.id ?? tokenTenant;

    // إذا كان المستخدم هو مطور، لا يحتاج للملف الشخصي
    if (req.user.role === 'developer') {
      // نعيد كائن مبسط حتى لا تكسر الواجهة (بدلاً من رسالة فقط)
      return {
        id: req.user.id,
        email: req.user.email,
        role: 'developer',
        tenantId: null,
        balance: 0,
        isActive: true,
        fullName: null,
        phoneNumber: null,
        currency: null,
        priceGroup: null,
        priceGroupId: null,
        priceGroupName: null,
        developer: true,
      };
    }

    let user: User | null = null;
    if (tenantId) {
      user = await this.userService.findById(req.user.id, tenantId, ['priceGroup', 'currency']);
    } else {
      // مالك المنصة: tenantId IS NULL
      user = await this.usersRepo.findOne({
        where: { id: req.user.id, tenantId: IsNull() },
        relations: ['priceGroup', 'currency'],
      });
    }

    if (!user) throw new NotFoundException('User not found');

    const { password, ...rest } = user as any;
    return {
      ...rest,
      role: user.role,
      currency: user.currency ? { id: user.currency.id, code: user.currency.code } : null,
      priceGroup: user.priceGroup ? { id: user.priceGroup.id, name: user.priceGroup.name } : null,
    };
  }


  @Get('with-price-group')
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  async findAllWithPriceGroup(@Req() req) {
    const tenantId = req.tenant?.id;
    return this.userService.findAllWithPriceGroup(tenantId);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiBearerAuth()
  async findAll(
    @Req() req,
    @Query('assignedToMe') assignedToMe?: string,
  ) {
    // allow fallback to token tenantId similar to profile route
    const tokenTenant: string | null = req.user?.tenantId ?? null;
    const tenantId: string | null = req.tenant?.id ?? tokenTenant;
    if (!tenantId) throw new BadRequestException('Tenant not found');

    // Old behavior forcibly filtered admin users by their own adminId causing empty lists
    // unless users.adminId was set. We now return all tenant users by default and allow
    // optional filtering with ?assignedToMe=true
    const where = (req.user?.role === 'admin' && assignedToMe === 'true')
      ? { adminId: req.user.id }
      : {};

    const users = await this.userService.findAllUsers(where as any, tenantId);
    return users.map(user => ({
      id: user.id,
      email: user.email,
      username: user.username ?? null,
      balance: Number(user.balance),
      role: user.role,
      isActive: !!user.isActive,
      overdraftLimit: Number(user.overdraftLimit ?? 0),
      currency: user.currency ? { id: user.currency.id, code: user.currency.code } : null,
      priceGroup: user.priceGroup ? { id: user.priceGroup.id, name: user.priceGroup.name } : null,
      fullName: user.fullName ?? null,
      phoneNumber: user.phoneNumber ?? null,
    }));
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('profile-with-currency')
  async getProfileWithCurrency(@Req() req) {
    const tenantId = req.tenant?.id;
    const userId = req.user.id ?? req.user.sub;
    if (!userId) throw new BadRequestException('User ID is missing in token');
    return this.userService.getProfileWithCurrency(userId, tenantId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'UUID of the user to retrieve' })
  async findById(@Param('id', ParseUUIDPipe) id: string, @Req() req) {
    const tenantId = req.tenant?.id;
    const user = await this.userService.findById(id, tenantId);
    if (!user) throw new NotFoundException(`User with id ${id} not found`);
    return {
      id: user.id,
      email: user.email,
      username: user.username ?? null,
      balance: Number(user.balance),
      role: user.role,
      isActive: !!user.isActive,
      overdraftLimit: Number(user.overdraftLimit ?? 0),
      currency: user.currency ? { id: user.currency.id, code: user.currency.code } : null,
      priceGroup: user.priceGroup ? { id: user.priceGroup.id, name: user.priceGroup.name } : null,
      fullName: user.fullName ?? null,
      phoneNumber: user.phoneNumber ?? null,
      countryCode: user.countryCode ?? null,
    };
  }

  @Put(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user data (Admin only)' })
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req,
  ) {
    const tenantId = req.tenant?.id;
    if (updateUserDto.balance !== undefined) {
      updateUserDto.balance = Number(updateUserDto.balance);
    }
    return this.userService.updateUser(id, updateUserDto as any, tenantId);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async deleteUser(@Param('id', ParseUUIDPipe) id: string, @Req() req): Promise<void> {
    const tenantId = req.tenant?.id;
    await this.userService.deleteUser(id, tenantId);
  }

  @Patch(':id/price-group')
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiBearerAuth()
  async updatePriceGroup(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body('priceGroupId') groupId: string | null,
    @Req() req,
  ) {
    const tenantId = req.tenant?.id;
    return this.userService.updateUserPriceGroup(userId, groupId, tenantId);
  }

  // ====== المسارات الجديدة للوحة المشرف ======

  @Patch(':id/active')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean,
    @Req() req,
  ) {
    const tenantId = req.tenant?.id;
    return this.userService.setActive(id, !!isActive, tenantId);
  }

  @Patch(':id/balance/add')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async addFunds(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('amount') amount: number,
    @Req() req,
  ) {
    const tenantId = req.tenant?.id;
    return this.userService.addFunds(id, Number(amount), tenantId);
  }

  @Patch(':id/overdraft')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async setOverdraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('overdraftLimit') overdraftLimit: number,
    @Req() req,
  ) {
    const tenantId = req.tenant?.id;
    return this.userService.setOverdraft(id, Number(overdraftLimit), tenantId);
  }

  @Patch(':id/password')
  @Roles(UserRole.ADMIN, UserRole.DEVELOPER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin/Dev: set user password' })
  async adminSetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminSetPasswordDto,
    @Req() req,
  ) {
    const tenantId = req.tenant?.id;
    if (!dto?.password || dto.password.length < 6) {
      throw new BadRequestException('Password too short');
    }
    return this.userService.adminSetPassword(id, dto.password, tenantId);
  }
}
