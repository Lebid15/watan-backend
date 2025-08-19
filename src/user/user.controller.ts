import {
  Controller, Post, Put, Get, Delete, Patch,
  Body, ConflictException, BadRequestException,
  UseGuards, Param, ParseUUIDPipe, NotFoundException, Request, Req
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UserRole } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AuthGuard } from '@nestjs/passport';
import { AdminSetPasswordDto } from './dto/admin-set-password.dto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  async register(@Body() createUserDto: CreateUserDto) {
    if (!createUserDto.email || !createUserDto.password || !createUserDto.currencyId) {
      throw new BadRequestException('Email, password and currencyId are required');
    }
    const existingUser = await this.userService.findByEmail(createUserDto.email);
    if (existingUser) throw new ConflictException('Email already in use');

    const user = await this.userService.createUser(createUserDto);
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
    const user = await this.userService.findById(req.user.id);
    if (!user) throw new NotFoundException('User not found');

    const { password, ...rest } = user;
    return {
      ...rest,
      currency: user.currency ? { id: user.currency.id, code: user.currency.code } : null,
      priceGroup: user.priceGroup ? { id: user.priceGroup.id, name: user.priceGroup.name } : null,
    };
  }

  @Get('with-price-group')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async findAllWithPriceGroup() {
    return this.userService.findAllWithPriceGroup();
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async findAll() {
    const users = await this.userService.findAllUsers();
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
    const userId = req.user.id ?? req.user.sub;
    if (!userId) throw new BadRequestException('User ID is missing in token');
    return this.userService.getProfileWithCurrency(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiParam({ name: 'id', description: 'UUID of the user to retrieve' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.userService.findById(id);
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user data (Admin only)' })
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    if (updateUserDto.balance !== undefined) {
      updateUserDto.balance = Number(updateUserDto.balance);
    }
    return this.userService.updateUser(id, updateUserDto as any);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async deleteUser(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.userService.deleteUser(id);
  }

  @Patch(':id/price-group')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async updatePriceGroup(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body('priceGroupId') groupId: string | null,
  ) {
    return this.userService.updateUserPriceGroup(userId, groupId);
  }

  // ====== المسارات الجديدة للوحة المشرف ======

  // تفعيل/تعطيل
  @Patch(':id/active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isActive') isActive: boolean,
  ) {
    return this.userService.setActive(id, !!isActive);
  }

  // إضافة رصيد (+)
  @Patch(':id/balance/add')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async addFunds(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('amount') amount: number,
  ) {
    return this.userService.addFunds(id, Number(amount));
  }

  // حد السالب
  @Patch(':id/overdraft')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  async setOverdraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('overdraftLimit') overdraftLimit: number,
  ) {
    return this.userService.setOverdraft(id, Number(overdraftLimit));
  }

  @Patch(':id/password')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: set user password' })
  async adminSetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminSetPasswordDto,
  ) {
    return this.userService.setPassword(id, dto.password);
  }

}
