import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

    // ✅ حقن خدمة الإشعارات
    private readonly notifications: NotificationsService,
  ) {}

  async createUser(createUserDto: CreateUserDto): Promise<User> {
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
    });

    return this.usersRepository.save(user);
  }

  async findByEmail(email: string, relations: string[] = []): Promise<User | null> {
    if (!email) return null;
    return this.usersRepository.findOne({ where: { email }, relations });
  }

  async findByUsername(username: string, relations: string[] = []): Promise<User | null> {
    if (!username) return null;
    return this.usersRepository.findOne({ where: { username }, relations });
  }

  async findAllUsers(): Promise<User[]> {
    return this.usersRepository.find({ relations: ['priceGroup', 'currency'] });
  }

  async findById(id: string, relations: string[] = ['priceGroup', 'currency']): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id }, relations });
  }

  async updateUser(id: string, updateData: Partial<User & { currencyId?: string }>): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id }, relations: ['currency'] });
    if (!user) throw new NotFoundException(`User with id ${id} not found`);

    const allowed: Partial<User> = {};

    if (updateData.fullName !== undefined) allowed.fullName = updateData.fullName;
    if (updateData.username !== undefined) allowed.username = updateData.username;
    if (updateData.phoneNumber !== undefined) allowed.phoneNumber = updateData.phoneNumber;
    if (updateData.countryCode !== undefined) allowed.countryCode = updateData.countryCode;
    if (updateData.balance !== undefined) allowed.balance = updateData.balance; // نادراً نستخدمها الآن
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

    await this.usersRepository.update(id, allowed);
    const updated = await this.usersRepository.findOne({ where: { id }, relations: ['priceGroup', 'currency'] });
    if (!updated) throw new NotFoundException(`User with id ${id} not found after update`);
    return updated;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User with id ${id} not found`);
    await this.usersRepository.remove(user);
  }

  // -------- Price group helpers --------
  async findAllWithPriceGroup() {
    const users = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.priceGroup', 'priceGroup')
      .leftJoinAndSelect('user.currency', 'currency')
      .getMany();

    return users.map((u) => ({
      id: String(u.id),
      email: u.email,
      currency: u.currency ? { id: u.currency.id, code: u.currency.code } : null,
      priceGroup: u.priceGroup ? { id: String(u.priceGroup.id), name: u.priceGroup.name } : null,
    }));
  }

  async updatePriceGroup(userId: string, priceGroupId: string | null) {
    const user = await this.usersRepository.findOne({ where: { id: userId }, relations: ['priceGroup', 'currency'] });
    if (!user) throw new NotFoundException(`User with id ${userId} not found`);

    if (priceGroupId) {
      const group = await this.priceGroupsRepository.findOne({ where: { id: priceGroupId } });
      if (!group) throw new NotFoundException(`Price group with id ${priceGroupId} not found`);
      user.priceGroup = group;
    } else {
      user.priceGroup = null;
    }

    const updatedUser = await this.usersRepository.save(user);
    return {
      id: updatedUser.id,
      email: updatedUser.email,
      currency: updatedUser.currency ? { id: updatedUser.currency.id, code: updatedUser.currency.code } : null,
      priceGroup: updatedUser.priceGroup ? { id: updatedUser.priceGroup.id, name: updatedUser.priceGroup.name } : null,
    };
  }

  async updateUserPriceGroup(userId: string, groupId: string | null) {
    const user = await this.usersRepository.findOne({ where: { id: userId }, relations: ['priceGroup', 'currency'] });
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

  // -------- الميزات للوحة المشرف --------

  /** تفعيل/تعطيل المستخدم */
  async setActive(userId: string, isActive: boolean) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.isActive = !!isActive;
    await this.usersRepository.save(user);
    return { ok: true };
  }

  /** ضبط الرصيد بمبلغ موجب أو سالب مع احترام حد السالب */
  async addFunds(userId: string, amount: number) {
    const delta = Number(amount);
    if (!isFinite(delta) || delta === 0) {
      throw new BadRequestException('amount must be a non-zero number');
    }

    const user = await this.usersRepository.findOne({ where: { id: userId }, relations: ['currency'] });
    if (!user) throw new NotFoundException('User not found');

    const current = Number(user.balance) || 0;
    const overdraft = Number(user.overdraftLimit) || 0; // مثال: 30000 يعني يُسمح حتى -30000
    const newBalance = current + delta;

    // تحقق حد السالب: لا نسمح بالنزول تحت -overdraftLimit
    if (newBalance < -overdraft) {
      throw new BadRequestException('Exceeds overdraft limit');
    }

    user.balance = newBalance;
    await this.usersRepository.save(user);

    // ✅ إشعار فقط عند الشحن الموجب (زر +)
    if (delta > 0) {
      await this.notifications.walletTopup(user.id, delta, 'شحن بواسطة الإدارة');
    }
    // (اختياري) لو أردت إشعارًا عند الخصم اليدوي:
    // else if (delta < 0) {
    //   await this.notifications.walletDebit(user.id, Math.abs(delta));
    // }

    return { ok: true, balance: Number(user.balance) };
  }

  /** تغيير كلمة السر (إدارية) */
  async setPassword(userId: string, newPassword: string) {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException('Password too short');
    }
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.password = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.save(user);
    return { ok: true };
  }

  /** ضبط حد السالب */
  async setOverdraft(userId: string, overdraftLimit: number) {
    if (!isFinite(overdraftLimit)) {
      throw new BadRequestException('Invalid overdraftLimit');
    }
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.overdraftLimit = Number(overdraftLimit);
    await this.usersRepository.save(user);
    return { ok: true, overdraftLimit: Number(user.overdraftLimit) };
  }

  /** عرض الملف الشخصي مع الرصيد بعملة المستخدم (دون تحويل) */
  async getProfileWithCurrency(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId }, relations: ['currency'] });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      balance: Number(user.balance),
      currencyCode: user.currency?.code ?? 'USD',
    };
  }

  // أضِف هذه الدالة
  async findByIdWithPassword(id: string): Promise<User | null> {
    return this.usersRepository.createQueryBuilder('u')
      .addSelect('u.password') // يضمن إرجاع الحقل حتى لو select:false
      .leftJoinAndSelect('u.priceGroup', 'priceGroup')
      .leftJoinAndSelect('u.currency', 'currency')
      .where('u.id = :id', { id })
      .getOne();
  }

}
