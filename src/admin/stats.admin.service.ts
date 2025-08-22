import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  // 📊 قائمة كل المشرفين — مفلترة على tenantId
  async getSupervisorsStats(
    from?: Date,
    to?: Date,
    tenantId?: string,
  ): Promise<SupervisorStatsDto[]> {
    const supervisors = await this.usersRepo.find({
      where: {
        role: 'admin',
        ...(tenantId ? ({ tenantId } as any) : {}),
      } as any,
      order: { createdAt: 'DESC' } as any,
    });

    const result: SupervisorStatsDto[] = [];

    for (const sup of supervisors) {
      // عدد المستخدمين تحت هذا المشرف داخل نفس المستأجر
      const usersCount = await this.usersRepo.count({
        where: {
          adminId: sup.id,
          ...(tenantId ? ({ tenantId } as any) : {}),
        } as any,
      });

      // عدد الطلبات المقبولة لهذا المشرف (بانضمام على user) + فلترة التاريخ اختيارياً
      const qb = this.ordersRepo
        .createQueryBuilder('o')
        .leftJoin('o.user', 'u')
        .where('u.adminId = :aid', { aid: sup.id })
        .andWhere('o.status = :st', { st: 'approved' });

      if (tenantId) qb.andWhere('u.tenantId = :tid', { tid: tenantId });

      if (from && to) {
        qb.andWhere('o.createdAt BETWEEN :from AND :to', { from, to });
      } else if (from) {
        qb.andWhere('o.createdAt >= :from', { from });
      } else if (to) {
        qb.andWhere('o.createdAt <= :to', { to });
      }

      const approvedOrdersCount = await qb.getCount();

      result.push({
        id: sup.id,
        name: sup.fullName || sup.username || sup.email,
        email: sup.email,
        usersCount,
        approvedOrdersCount,
        isActive: !!sup.isActive,
      });
    }

    return result;
  }

  // 📑 تفاصيل مشرف واحد — مفلترة على tenantId
  async getSupervisorDetails(id: string, tenantId?: string): Promise<SupervisorDetailsDto> {
    const sup = await this.usersRepo.findOne({
      where: {
        id,
        role: 'admin',
        ...(tenantId ? ({ tenantId } as any) : {}),
      } as any,
    });

    if (!sup) throw new NotFoundException('Supervisor not found');

    const usersCount = await this.usersRepo.count({
      where: {
        adminId: sup.id,
        ...(tenantId ? ({ tenantId } as any) : {}),
      } as any,
    });

    const countByStatus = async (status: 'approved' | 'rejected' | 'pending') => {
      const qb = this.ordersRepo
        .createQueryBuilder('o')
        .leftJoin('o.user', 'u')
        .where('u.adminId = :aid', { aid: sup.id })
        .andWhere('o.status = :st', { st: status });

      if (tenantId) qb.andWhere('u.tenantId = :tid', { tid: tenantId });

      return qb.getCount();
    };

    const [approvedOrders, rejectedOrders, pendingOrders] = await Promise.all([
      countByStatus('approved'),
      countByStatus('rejected'),
      countByStatus('pending'),
    ]);

    const profitQb = this.ordersRepo
      .createQueryBuilder('o')
      .leftJoin('o.user', 'u')
      .where('u.adminId = :aid', { aid: sup.id });

    if (tenantId) profitQb.andWhere('u.tenantId = :tid', { tid: tenantId });

    const totalProfitRaw = await profitQb.select('COALESCE(SUM(o.profitAmount),0)', 'sum').getRawOne<{ sum: string }>();
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
      balance: Number(sup.balance ?? 0),
    };
  }

  // 👥 إحصائيات المستخدمين — حسب المستأجر
  async getUsersStats(tenantId?: string) {
    const where = tenantId ? ({ tenantId } as any) : ({} as any);
    const total = await this.usersRepo.count({ where });
    const active = await this.usersRepo.count({ where: { ...where, isActive: true } });
    const inactive = total - active;
    return { total, active, inactive };
  }

  // 📦 إحصائيات الطلبات — حسب المستأجر
  async getOrdersStats(tenantId?: string) {
    if (!tenantId) {
      // fallback عام إذا لم يمر tenantId (نادر)
      const total = await this.ordersRepo.count();
      const approved = await this.ordersRepo.count({ where: { status: 'approved' } as any });
      const rejected = await this.ordersRepo.count({ where: { status: 'rejected' } as any });
      return { total, approved, rejected };
    }

    const baseQb = this.ordersRepo
      .createQueryBuilder('o')
      .leftJoin('o.user', 'u')
      .where('u.tenantId = :tid', { tid: tenantId });

    const total = await baseQb.getCount();

    const approved = await this.ordersRepo
      .createQueryBuilder('o')
      .leftJoin('o.user', 'u')
      .where('u.tenantId = :tid', { tid: tenantId })
      .andWhere('o.status = :st', { st: 'approved' })
      .getCount();

    const rejected = await this.ordersRepo
      .createQueryBuilder('o')
      .leftJoin('o.user', 'u')
      .where('u.tenantId = :tid', { tid: tenantId })
      .andWhere('o.status = :st', { st: 'rejected' })
      .getCount();

    return { total, approved, rejected };
  }
}
