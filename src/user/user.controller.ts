import { 
  Controller, Post, Put, Get, Delete, Patch,  
  Body, ConflictException, BadRequestException,
  UseGuards, Param, ParseUUIDPipe, NotFoundException, Request 
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, UserRole } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { 
  ApiTags, ApiBearerAuth, ApiOperation, 
  ApiResponse, ApiParam 
} from '@nestjs/swagger';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // -------------------------
  // تسجيل مستخدم جديد
  // -------------------------
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully.' })
  @ApiResponse({ status: 409, description: 'Email already in use.' })
  @ApiResponse({ status: 400, description: 'Invalid data.' })
  async register(@Body() createUserDto: CreateUserDto) {
    if (!createUserDto.email || !createUserDto.password) {
      throw new BadRequestException('Email and password are required');
    }

    const existingUser = await this.userService.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('Email already in use');
    }

    const user = await this.userService.createUser(createUserDto);
    return { id: user.id, email: user.email };
  }

  // -------------------------
  // عرض بروفايل المستخدم الحالي (JWT)
  // -------------------------
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
      priceGroup: user.priceGroup
        ? { id: user.priceGroup.id, name: user.priceGroup.name }
        : null,
    };
  }

  // -------------------------
  // جلب كل المستخدمين مع مجموعة الأسعار (للمشرف)
  // -------------------------
  @Get('with-price-group')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users with their price group (Admin only)' })
  async findAllWithPriceGroup() {
    return this.userService.findAllWithPriceGroup();
  }

  // -------------------------
  // عرض جميع المستخدمين (للمشرف)
  // -------------------------
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users (Admin only)' })
  async findAll() {
    const users = await this.userService.findAllUsers();
    return users.map(user => ({
      id: user.id,
      email: user.email,
      balance: user.balance,
      role: user.role,
      priceGroup: user.priceGroup
        ? { id: user.priceGroup.id, name: user.priceGroup.name }
        : null,
    }));
  }

  // -------------------------
  // جلب مستخدم محدد بالمعرف (للمشرف)
  // -------------------------
  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user by id (Admin only)' })
  @ApiParam({ name: 'id', description: 'UUID of the user to retrieve' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.userService.findById(id);
    if (!user) throw new NotFoundException(`User with id ${id} not found`);
    return {
      id: user.id,
      email: user.email,
      balance: user.balance,
      role: user.role,
      priceGroup: user.priceGroup
        ? { id: user.priceGroup.id, name: user.priceGroup.name }
        : null,
    };
  }

  // -------------------------
  // تحديث بيانات مستخدم (للمشرف)
  // -------------------------
  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user data (Admin only)' })
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.userService.updateUser(id, updateUserDto);
  }

  // -------------------------
  // حذف مستخدم (للمشرف)
  // -------------------------
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete user (Admin only)' })
  async deleteUser(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.userService.deleteUser(id);
  }

  // -------------------------
// تحديث مجموعة الأسعار للمستخدم (للمشرف)
// -------------------------
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

}
