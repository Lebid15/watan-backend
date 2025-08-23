// src/user/user.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { PriceGroup } from '../products/price-group.entity';
import { Currency } from '../currencies/currency.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,

    @InjectRepository(PriceGroup)
    private readonly priceGroupsRepository: Repository<PriceGroup>,

    @InjectRepository(Currency)
    private readonly currenciesRepository: Repository<Currency>,

    private readonly notifications: NotificationsService,
  ) {}

  async createUser(createUserDto: CreateUserDto, tenantId: string): Promise<User> {
    const { email, password, currencyId, fullName, username, phoneNumber, countryCode } = createUserDto;

    const currency = await this.currenciesRepository.findOne({
      where: { id: currencyId, isActive: true },
    });
    if (!currency) {
      throw new BadRequestException('Invalid or inactive currency');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.usersRepository.create({
      email,
      password: hashedPassword,
      fullName,
      username,
      phoneNumber,
      countryCode,
      currency,
      tenantId, // ✅ ربط المستخدم بالمستأجر
    });

    return this.usersRepository.save(user);
  }

  // ✅ تدعم tenantId = null (مالك المنصة) باستخدام IsNull()
  async findByEmail(email: string, tenantId: string | null, relations: string[] = []): Promise<User | null> {
    if (!email) return null;
    const where =
      tenantId === null
        ? ({ email, tenantId: IsNull() } as any)
        : ({ email, tenantId } as any);
    try {
      return await this.usersRepository.findOne({ where, relations });
    } catch (err: any) {
      if (err?.code === '42703' || /column .*tenantId.* does not exist/i.test(err?.message || '')) {
        console.warn('[SAFE] findByEmail retry without relations due to missing column:', err.message);
        try {
          return await this.usersRepository.findOne({ where });
        } catch (err2) {
          console.error('[SAFE] findByEmail second failure:', (err2 as any)?.message || err2);
          throw err; // أعد الخطأ الأصلي
        }
      }
      throw err;
    }
  }

  // ✅ تدعم tenantId = null (مالك المنصة)
  async findByUsername(username: string, tenantId: string | null, relations: string[] = []): Promise<User | null> {
    if (!username) return null;
    const where =
      tenantId === null
        ? ({ username, tenantId: IsNull() } as any)
        : ({ username, tenantId } as any);
    try {
      return await this.usersRepository.findOne({ where, relations });
    } catch (err: any) {
      if (err?.code === '42703' || /column .*tenantId.* does not exist/i.test(err?.message || '')) {
        console.warn('[SAFE] findByUsername retry without relations due to missing column:', err.message);
        try {
          return await this.usersRepository.findOne({ where });
        } catch (err2) {
          console.error('[SAFE] findByUsername second failure:', (err2 as any)?.message || err2);
          throw err;
        }
      }
      throw err;
    }
  }

  // ✅ دالة صريحة للبحث عن مالك المنصة (tenantId IS NULL) بالبريد أو اليوزرنيم
  async findOwnerByEmailOrUsername(emailOrUsername: string, relations: string[] = []): Promise<User | null> {
    if (!emailOrUsername) return null;
    return this.usersRepository.findOne({
      where: [
        { email: emailOrUsername, tenantId: IsNull() },
        { username: emailOrUsername, tenantId: IsNull() },
      ],
      relations,
    });
  }

  async findAllUsers(where: FindOptionsWhere<User> = {}, tenantId: string): Promise<User[]> {
    return this.usersRepository.find({
      where: { ...where, tenantId },
      relations: ['priceGroup', 'currency'],
    });
  }

  async findById(id: string, tenantId: string, relations: string[] = ['priceGroup', 'currency']): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id, tenantId }, relations });
  }

  async updateUser(id: string, updateData: Partial<User & { currencyId?: string }>, tenantId: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id, tenantId }, relations: ['currency'] });
    if (!user) throw new NotFoundException(`User with id ${id} not found`);

    const allowed: Partial<User> = {};

    if (updateData.fullName !== undefined) allowed.fullName = updateData.fullName;
    if (updateData.username !== undefined) allowed.username = updateData.username;
    if (updateData.phoneNumber !== undefined) allowed.phoneNumber = updateData.phoneNumber;
    if (updateData.countryCode !== undefined) allowed.countryCode = updateData.countryCode;
    if (updateData.balance !== undefined) allowed.balance = updateData.balance;
    if (updateData.role !== undefined) allowed.role = updateData.role;
    if (updateData.isActive !== undefined) allowed.isActive = updateData.isActive;

    if (updateData.currencyId) {
      const currency = await this.currenciesRepository.findOne({
        where: { id: updateData.currencyId, isActive: true },
      });
      if (!currency) throw new BadRequestException('Invalid or inactive currency');
      allowed.currency = currency;
    }

    if (Object.keys(allowed).length === 0) {
      throw new BadRequestException('No valid fields provided for update');
    }

    await this.usersRepository.update({ id, tenantId }, allowed);
    const updated = await this.usersRepository.findOne({ where: { id, tenantId }, relations: ['priceGroup', 'currency'] });
    if (!updated) throw new NotFoundException(`User with id ${id} not found after update`);
    return updated;
  }

  async deleteUser(id: string, tenantId: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id, tenantId } });
    if (!user) throw new NotFoundException(`User with id ${id} not found`);
    await this.usersRepository.remove(user);
  }

  // -------- Price group helpers --------
  async findAllWithPriceGroup(tenantId: string) {
    const users = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.priceGroup', 'priceGroup')
      .leftJoinAndSelect('user.currency', 'currency')
      .where('user.tenantId = :tenantId', { tenantId })
      .getMany();

    return users.map((u) => ({
      id: String(u.id),
      email: u.email,
      currency: u.currency ? { id: u.currency.id, code: u.currency.code } : null,
      priceGroup: u.priceGroup ? { id: String(u.priceGroup.id), name: u.priceGroup.name } : null,
    }));
  }

  async updateUserPriceGroup(userId: string, groupId: string | null, tenantId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId, tenantId }, relations: ['priceGroup', 'currency'] });
    if (!user) throw new NotFoundException('User not found');

    if (groupId) {
      const group = await this.priceGroupsRepository.findOne({ where: { id: groupId } });
      if (!group) throw new NotFoundException('Price group not found');
      user.priceGroup = group;
    } else {
      user.priceGroup = null;
    }

    await this.usersRepository.save(user);
    return {
      id: user.id,
      email: user.email,
      currency: user.currency ? { id: user.currency.id, code: user.currency.code } : null,
      priceGroup: user.priceGroup ? { id: user.priceGroup.id, name: user.priceGroup.name } : null,
    };
  }

  // -------- ميزات لوحة المشرف --------

  async setActive(userId: string, isActive: boolean, tenantId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('User not found');
    user.isActive = !!isActive;
    await this.usersRepository.save(user);
    return { ok: true };
  }

  async addFunds(userId: string, amount: number, tenantId: string) {
    const delta = Number(amount);
    if (!isFinite(delta) || delta === 0) {
      throw new BadRequestException('amount must be a non-zero number');
    }

    const user = await this.usersRepository.findOne({ where: { id: userId, tenantId }, relations: ['currency'] });
    if (!user) throw new NotFoundException('User not found');

    const current = Number(user.balance) || 0;
    const overdraft = Number(user.overdraftLimit) || 0;
    const newBalance = current + delta;

    if (newBalance < -overdraft) {
      throw new BadRequestException('Exceeds overdraft limit');
    }

    user.balance = newBalance;
    await this.usersRepository.save(user);

    if (delta > 0) {
      await this.notifications.walletTopup(
        user.id,
        (user as any)?.tenantId as string,
        delta,
        'شحن بواسطة الإدارة',
      );
    }

    return { ok: true, balance: Number(user.balance) };
  }

  async setPassword(userId: string, newPassword: string, tenantId: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('Password too short');
    }
    const user = await this.usersRepository.findOne({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('User not found');
    user.password = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.save(user);
    return { ok: true };
  }

  async setOverdraft(userId: string, overdraftLimit: number, tenantId: string) {
    if (!isFinite(overdraftLimit)) {
      throw new BadRequestException('Invalid overdraftLimit');
    }
    const user = await this.usersRepository.findOne({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('User not found');
    user.overdraftLimit = Number(overdraftLimit);
    await this.usersRepository.save(user);
    return { ok: true, overdraftLimit: Number(user.overdraftLimit) };
  }

  async getProfileWithCurrency(userId: string, tenantId?: string | null) {
    let user = await this.usersRepository.findOne({ where: { id: userId, tenantId } as any, relations: ['currency'] });
    if (!user && (tenantId === undefined || tenantId === null)) {
      // محاولة الحصول على مستخدم عالمي (tenantId IS NULL)
      user = await this.usersRepository.findOne({ where: { id: userId, tenantId: null } as any, relations: ['currency'] });
    }
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      balance: Number(user.balance),
      currencyCode: user.currency?.code ?? 'USD',
    };
  }

  async findByIdWithPassword(id: string, tenantId: string): Promise<User | null> {
    return this.usersRepository.createQueryBuilder('u')
      .addSelect('u.password')
      .leftJoinAndSelect('u.priceGroup', 'priceGroup')
      .leftJoinAndSelect('u.currency', 'currency')
      .where('u.id = :id', { id })
      .andWhere('u.tenantId = :tenantId', { tenantId })
      .getOne();
  }

  async adminSetPassword(userId: string, plain: string, tenantId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException('User not found');

    if (!plain || plain.length < 6) {
      throw new BadRequestException('Password too short');
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(plain, salt);

    await this.usersRepository.save(user);
    return { ok: true };
  }
}
