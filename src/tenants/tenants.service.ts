import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { randomUUID } from 'crypto';

import { Tenant } from './tenant.entity';
import { TenantDomain } from './tenant-domain.entity';

import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { AddDomainDto } from './dto/add-domain.dto';
import { PatchDomainDto } from './dto/patch-domain.dto';

import * as bcrypt from 'bcrypt';
import { User } from '../user/user.entity';
import { UserRole } from '../auth/user-role.enum';

const RESERVED_CODES = new Set(['www', 'admin', 'dev', 'api', 'static', 'cdn', 'assets']);

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant) private tenants: Repository<Tenant>,
    @InjectRepository(TenantDomain) private domains: Repository<TenantDomain>,
    @InjectRepository(User) private users: Repository<User>,
  ) {}

  // كلمة مرور مؤقتة (dev فقط)
  private generateTempPassword(len = 10) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let out = '';
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  private ensureCodeAllowed(code: string) {
    if (RESERVED_CODES.has(code)) {
      throw new BadRequestException('هذا الكود محجوز');
    }
  }

  // ===== Tenants =====

  async listTenants() {
    return this.tenants.find({ order: { createdAt: 'DESC' } });
  }

  async getTenant(id: string) {
    const t = await this.tenants.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Tenant not found');
    return t;
  }

  async createTenant(dto: CreateTenantDto) {
    if (dto.code) this.ensureCodeAllowed(dto.code);

    const exists = await this.tenants.findOne({ where: { code: dto.code } });
    if (exists) throw new BadRequestException('الكود مستخدم من قبل');

    // 1) تجهيز سجل المتجر
  const t = this.tenants.create({ ...dto, isActive: dto.isActive ?? true });
  // فfallback: لو لم يضبط الـ DB default للـ id (حالة إنتاج قديمة) نولّد UUID يدوياً
  if (!(t as any).id) (t as any).id = randomUUID();

    let ownerPlainPassword: string | undefined;

    // 2) إنشاء/ربط مالك المتجر إن أُرسل بريد
    if (dto.ownerEmail) {
      let user: User | null = await this.users.findOne({ where: { email: dto.ownerEmail } });

      if (!user) {
        // أنشئ مستخدم جديد بدور ADMIN
        ownerPlainPassword = this.generateTempPassword();
        const hash = await bcrypt.hash(ownerPlainPassword, 10);

        // صرّحنا بالنوع صراحةً لتجنّب اختيار overload المصفوفة
        const newUser: User = this.users.create({
          email: dto.ownerEmail,
          password: hash,
          role: UserRole.ADMIN,
          // أضف حقولًا إضافية لو موجودة في الـ entity عندك:
          // name: dto.ownerName,
          // isActive: true as any,
        } as Partial<User>) as User;

        user = await this.users.save(newUser);
      } else {
        // ارفع الدور إلى ADMIN (اختياري)
        if (user.role !== UserRole.ADMIN) {
          user.role = UserRole.ADMIN;
          user = await this.users.save(user);
        }
      }

      // اربط مالك المتجر
      (t as any).ownerUserId = (user as any).id;
    }

    // 3) احفظ المتجر
    const savedTenant = await this.tenants.save(t);

    // 4) أنشئ نطاق افتراضي: code.localhost
    const defaultDomain = `${dto.code}.localhost`;
    const domainEntity: TenantDomain = this.domains.create({
      tenantId: savedTenant.id,
      domain: defaultDomain,
      type: 'subdomain',
      isPrimary: true,
      isVerified: true, // محليًا نعتبره متحققًا
    } as Partial<TenantDomain>) as TenantDomain;
    if (!(domainEntity as any).id) (domainEntity as any).id = randomUUID();

    await this.domains.save(domainEntity);

    // 5) أعد البيانات + كلمة السر المؤقتة (dev فقط)
    const isProd = (process.env.NODE_ENV || 'development') === 'production';
    return {
      tenant: savedTenant,
      defaultDomain,
      ownerEmail: dto.ownerEmail || null,
      ownerTempPassword: ownerPlainPassword && !isProd ? ownerPlainPassword : undefined,
    };
  }

  async resetOwnerPassword(tenantId: string) {
    const t = await this.getTenant(tenantId);
    if (!(t as any).ownerUserId) throw new BadRequestException('لا يوجد مالك مرتبط بهذا المتجر');

    const user = await this.users.findOne({ where: { id: (t as any).ownerUserId } as any });
    if (!user) throw new NotFoundException('مالك المتجر غير موجود');

    const plain = this.generateTempPassword();
    user.password = await bcrypt.hash(plain, 10);
    await this.users.save(user);

    const isProd = (process.env.NODE_ENV || 'development') === 'production';
    return {
      ownerEmail: (user as any).email,
      ownerTempPassword: !isProd ? plain : undefined,
    };
  }

  async updateTenant(id: string, dto: UpdateTenantDto) {
    const t = await this.getTenant(id);
    if (dto.code) {
      this.ensureCodeAllowed(dto.code);
      const dup = await this.tenants.findOne({ where: { code: dto.code, id: Not(id) } });
      if (dup) throw new BadRequestException('الكود مستخدم من قبل');
    }
    Object.assign(t, dto);
    return this.tenants.save(t);
  }

  async deleteTenant(id: string) {
    await this.tenants.delete(id);
    return { ok: true };
  }

  // ===== Domains =====

  async listDomains(tenantId: string) {
    return this.domains.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async addDomain(tenantId: string, dto: AddDomainDto) {
    await this.getTenant(tenantId);
    const dupe = await this.domains.findOne({ where: { domain: dto.domain } });
    if (dupe) throw new BadRequestException('النطاق مستخدم من قبل');

    const d: TenantDomain = this.domains.create({
      tenantId,
      domain: dto.domain,
      type: dto.type,
      isPrimary: !!dto.isPrimary,
      isVerified: dto.type === 'subdomain' ? true : false,
    } as Partial<TenantDomain>) as TenantDomain;

    if (d.isPrimary) {
      await this.domains.update({ tenantId, isPrimary: true }, { isPrimary: false });
    }

    return this.domains.save(d);
  }

  async patchDomain(tenantId: string, domainId: string, dto: PatchDomainDto) {
    const d = await this.domains.findOne({ where: { id: domainId, tenantId } });
    if (!d) throw new NotFoundException('Domain not found');

    if (dto.isPrimary === true) {
      await this.domains.update({ tenantId, isPrimary: true }, { isPrimary: false });
      d.isPrimary = true;
    } else if (dto.isPrimary === false) {
      d.isPrimary = false;
    }

    if (typeof dto.isVerified === 'boolean') d.isVerified = dto.isVerified;

    return this.domains.save(d);
  }

  async deleteDomain(tenantId: string, domainId: string) {
    await this.domains.delete({ id: domainId, tenantId });
    return { ok: true };
  }
}
