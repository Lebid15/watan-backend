import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { ProductOrder } from '../products/product-order.entity';
import { SupervisorStatsDto } from './dto/supervisor-stats.dto';
import { SupervisorDetailsDto } from './dto/supervisor-details.dto';

@Injectable()
export class StatsAdminService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(ProductOrder)
    private readonly ordersRepo: Repository<ProductOrder>,
  ) {}

  // 📊 قائمة كل المشرفين
  async getSupervisorsStats(from?: Date, to?: Date): Promise<SupervisorStatsDto[]> {
    const dateFilter = from && to ? { createdAt: Between(from, to) } : {};

    const supervisors = await this.usersRepo.find({ where: { role: 'admin' } });

    const result: SupervisorStatsDto[] = [];

    for (const sup of supervisors) {
      const usersCount = await this.usersRepo.count({
        where: { adminId: sup.id },
      });

      const approvedOrdersCount = await this.ordersRepo.count({
        where: {
          status: 'approved',
          user: { adminId: sup.id },
          ...dateFilter,
        },
        relations: ['user'],
      });

      result.push({
        id: sup.id,
        name: sup.fullName || sup.username || sup.email,
        email: sup.email,
        usersCount,
        approvedOrdersCount,
        isActive: sup.isActive,
      });
    }

    return result;
  }

  // 📑 تفاصيل مشرف واحد
  async getSupervisorDetails(id: string): Promise<SupervisorDetailsDto> {
    const sup = await this.usersRepo.findOne({ where: { id, role: 'admin' } });
    if (!sup) {
      throw new Error('Supervisor not found');
    }

    const usersCount = await this.usersRepo.count({ where: { adminId: sup.id } });

    const approvedOrders = await this.ordersRepo.count({
      where: { status: 'approved', user: { adminId: sup.id } },
      relations: ['user'],
    });

    const rejectedOrders = await this.ordersRepo.count({
      where: { status: 'rejected', user: { adminId: sup.id } },
      relations: ['user'],
    });

    const pendingOrders = await this.ordersRepo.count({
      where: { status: 'pending', user: { adminId: sup.id } },
      relations: ['user'],
    });

    const totalProfitRaw = await this.ordersRepo
      .createQueryBuilder('order')
      .leftJoin('order.user', 'user')
      .where('user.adminId = :adminId', { adminId: sup.id })
      .select('SUM(order.profitAmount)', 'sum')
      .getRawOne<{ sum: string }>();

    const totalProfit = parseFloat(totalProfitRaw?.sum || '0');

    return {
      id: sup.id,
      name: sup.fullName || sup.username || sup.email,
      email: sup.email,
      createdAt: sup.createdAt,
      usersCount,
      approvedOrders,
      rejectedOrders,
      pendingOrders,
      totalProfit,
      balance: Number(sup.balance),
    };
  }

  // 👥 إحصائيات المستخدمين
  async getUsersStats() {
    const total = await this.usersRepo.count();
    const active = await this.usersRepo.count({ where: { isActive: true } });
    const inactive = total - active;

    return { total, active, inactive };
  }

  // 📦 إحصائيات الطلبات
  async getOrdersStats() {
    const total = await this.ordersRepo.count();
    const approved = await this.ordersRepo.count({ where: { status: 'approved' } });
    const rejected = await this.ordersRepo.count({ where: { status: 'rejected' } });

    return { total, approved, rejected };
  }
}
