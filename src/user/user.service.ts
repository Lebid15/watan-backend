// src/user/user.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { PriceGroup } from '../products/price-group.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,

    @InjectRepository(PriceGroup)
    private readonly priceGroupsRepository: Repository<PriceGroup>,
  ) {}

  /** إنشاء مستخدم جديد مع تشفير كلمة السر */
  async createUser(createUserDto: CreateUserDto): Promise<User> {
    const { email, password } = createUserDto;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.usersRepository.create({ email, password: hashedPassword });
    return this.usersRepository.save(user);
  }

  /** البحث عن مستخدم بواسطة البريد الإلكتروني مع دعم relations */
  async findByEmail(email: string, relations: string[] = []): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { email },
      relations,
    });
  }

  /** إرجاع كل المستخدمين مع مجموعة الأسعار */
  async findAllUsers(): Promise<User[]> {
    return this.usersRepository.find({
      relations: ['priceGroup'],
    });
  }

  /** البحث عن مستخدم بواسطة المعرف مع إمكانية تحميل relations */
  async findById(id: string, relations: string[] = ['priceGroup']): Promise<User | null> {
    return this.usersRepository.findOne({
      where: { id },
      relations,
    });
  }

  /** تحديث بيانات مستخدم */
  async updateUser(id: string, updateData: Partial<User>): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User with id ${id} not found`);

    Object.assign(user, updateData);
    return this.usersRepository.save(user);
  }

  /** حذف مستخدم */
  async deleteUser(id: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User with id ${id} not found`);
    await this.usersRepository.remove(user);
  }

  // ---------------------------------------------
  // ✅ دوال ربط المستخدمين بمجموعات الأسعار
  // ---------------------------------------------

  /** جلب كل المستخدمين مع مجموعة الأسعار المرتبطة */
  async findAllWithPriceGroup() {
    const users = await this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.priceGroup', 'priceGroup')
      .getMany();

    return users.map((u) => ({
      id: String(u.id),
      email: u.email,
      priceGroup: u.priceGroup
        ? { id: String(u.priceGroup.id), name: u.priceGroup.name }
        : null,
    }));
  }

  /** تعديل مجموعة السعر لمستخدم معين */
  async updatePriceGroup(userId: string, priceGroupId: string | null) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['priceGroup'],
    });

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
      priceGroup: updatedUser.priceGroup
        ? { id: updatedUser.priceGroup.id, name: updatedUser.priceGroup.name }
        : null,
    };
  }

  /** تحديث مجموعة السعر باستخدام groupId */
  async updateUserPriceGroup(userId: string, groupId: string | null) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['priceGroup'],
    });
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
      priceGroup: user.priceGroup
        ? { id: user.priceGroup.id, name: user.priceGroup.name }
        : null,
    };
  }
}
