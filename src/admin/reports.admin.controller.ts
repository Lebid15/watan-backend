import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
  Patch,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import type { Request } from 'express'; // ✅ type-only لتفادي TS1272
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { ProductOrder } from '../products/product-order.entity';
import { Currency } from '../currencies/currency.entity';
import { User } from '../user/user.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';
import { AccountingPeriodsService } from '../accounting/accounting-periods.service';

const _fmtTR = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Istanbul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
function formatDateIstanbul(d: Date) {
  return _fmtTR.format(d); // => YYYY-MM-DD
}

type RangePreset = 'today' | 'this_month' | 'last_month' | 'last_6_months' | 'custom';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** (اختياري) أسماء ودّية للمزوّدين كـ fallback */
const PROVIDER_LABELS: Record<string, string> = {
  // 'ACTUAL_UUID_APSTORE': 'أب ستور (apstore/barakat-store)',
  // 'ACTUAL_UUID_ALAYA'  : 'alaya (znet)',
};

const PROVIDER_TABLE_CANDIDATES = ['integrations', 'providers', 'payment_providers'];
const PROVIDER_LABEL_CANDIDATE_COLUMNS = [
  'name', 'title', 'label', 'display_name', 'provider', 'vendor', 'code', 'slug',
];

function parseDateOnly(d: string) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) throw new BadRequestException('Invalid date');
  return dt;
}
function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function endOfToday()   { const d = new Date(); d.setHours(23,59,59,999); return d; }
function startOfMonth(date = new Date()) { return new Date(date.getFullYear(), date.getMonth(), 1, 0,0,0,0); }
function endOfMonth(date = new Date())   { return new Date(date.getFullYear(), date.getMonth()+1, 0, 23,59,59,999); }
function addMonths(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, date.getDate(), 0,0,0,0);
}

@Controller('admin/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ReportsAdminController {
  constructor(
    @InjectRepository(ProductOrder) private readonly ordersRepo: Repository<ProductOrder>,
    @InjectRepository(Currency) private readonly currencyRepo: Repository<Currency>,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly accounting: AccountingPeriodsService,
  ) {}

  /* ============== Helpers ============== */
  private getTenantId(req: Request): string {
    const fromUser = (req as any)?.user?.tenantId as string | undefined;
  const fromTenant = (req as any)?.tenant?.id as string | undefined;
    const fromHeader = (req.headers['x-tenant-id'] as string | undefined) || undefined;
    const fromQuery = (req.query?.tenantId as string | undefined) || undefined;
  const tenantId = fromUser || fromTenant || fromHeader || fromQuery;
    if (!tenantId) throw new BadRequestException('tenantId is required');
    return tenantId;
  }

  private async getTableColumns(table: string): Promise<Set<string>> {
    const rows = await this.ordersRepo.manager.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    return new Set<string>((rows || []).map((r: any) => String(r.column_name).toLowerCase()));
  }

  private async readProvidersFromAnyTable(tenantId: string): Promise<Array<{ id: string; label: string }>> {
    for (const table of PROVIDER_TABLE_CANDIDATES) {
      try {
        const cols = await this.getTableColumns(table);
        if (!cols.has('id')) continue;
        const labelCol = PROVIDER_LABEL_CANDIDATE_COLUMNS.find((c) => cols.has(c));
        if (!labelCol) continue;

        let rows: any[] = [];
        if (cols.has('tenantid')) {
          rows = await this.ordersRepo.manager.query(
            `SELECT id, ${labelCol} AS label FROM ${table} WHERE "tenantId" = $1`,
            [tenantId],
          );
        } else {
          rows = await this.ordersRepo.manager.query(
            `SELECT id, ${labelCol} AS label FROM ${table}`,
          );
        }

        const mapped = (rows || [])
          .filter((r: any) => r?.id)
          .map((r: any) => ({
            id: String(r.id),
            label: (r.label && String(r.label).trim()) || String(r.id),
          }));
        if (mapped.length) return mapped;
      } catch { continue; }
    }
    return [];
  }
  /* ===================================== */

  /** بحث المستخدمين (ID + label) */
  @Get('users')
  async searchUsers(
    @Req() req: Request,
    @Query('q') q = '',
    @Query('limit') limit = '20',
  ) {
    const tenantId = this.getTenantId(req);
    const take = Math.max(1, Math.min(50, Number(limit) || 20));

    const qb = this.usersRepo.createQueryBuilder('u')
      .select(['u.id AS id', `CONCAT(COALESCE(u.username,''),' — ',COALESCE(u.email,'')) AS label`])
      .where(`"u"."tenantId" = :tenantId`, { tenantId }) // ✅ scope
      .orderBy('u.createdAt', 'DESC')
      .take(take);

    if (q && q.trim()) {
      qb.andWhere(new Brackets(b => {
        b.where(`LOWER(u.username) LIKE :q`, { q: `%${q.toLowerCase()}%` })
         .orWhere(`LOWER(u.email) LIKE :q`,   { q: `%${q.toLowerCase()}%` });
      }));
    }
    return await qb.getRawMany<{ id: string; label: string }>();
  }

  /** قائمة المزوّدين (اسم ودّي إن وُجد) */
  @Get('providers')
  async listProviders(@Req() req: Request) {
    const tenantId = this.getTenantId(req);

    const fromTables = await this.readProvidersFromAnyTable(tenantId);
    const map = new Map<string, string>();
    for (const r of fromTables) map.set(r.id, r.label);

    const rowsFromOrders = await this.ordersRepo.createQueryBuilder('o')
      .select('DISTINCT "o"."providerId"', 'providerId')
      .where(`"o"."tenantId" = :tenantId`, { tenantId })    // ✅ scope
      .andWhere(`"o"."providerId" IS NOT NULL`)
      .andWhere(`"o"."providerId" <> ''`)
      .orderBy(`"o"."providerId"`, 'ASC')
      .getRawMany<{ providerId: string }>();

    for (const r of rowsFromOrders) {
      const id = r.providerId;
      const label = map.get(id) || PROVIDER_LABELS[id] || id.toUpperCase();
      map.set(id, label);
    }

    for (const [id, label] of Object.entries(PROVIDER_LABELS)) {
      if (!map.has(id)) map.set(id, label);
    }

    const list = [{ id: 'manual', label: 'يدوي' }, ...[...map.entries()].map(([id, label]) => ({ id, label }))];
    list.sort((a, b) => a.label.localeCompare(b.label, 'ar'));
    return list;
  }

  /** تقرير الأرباح — يعتمد القيم المجمّدة + approvedLocalDate */
  @Get('profits')
  async getProfits(
    @Req() req: Request,
    @Query('range') range: RangePreset = 'today',
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('userId') userId?: string,
    @Query('provider') provider?: string,
  ) {
    const tenantId = this.getTenantId(req);

    // 1) userId → UUID (كما هو)
    let userUUID: string | undefined = userId;
    if (userId && !UUID_RE.test(userId)) {
      const u = await this.usersRepo.createQueryBuilder('u')
        .select(['u.id'])
        .where(`"u"."tenantId" = :tenantId`, { tenantId }) // ✅ scope
        .andWhere(new Brackets(b => {
          b.where(`LOWER(u.username) = :x`, { x: userId.toLowerCase() })
           .orWhere(`LOWER(u.email) = :x`,   { x: userId.toLowerCase() });
        }))
        .getOne();
      userUUID = u?.id || undefined;
    }

    // 2) نطاق التاريخ (كما هو)
    let startAt: Date; let endAt: Date;
    if (range === 'custom') {
      if (!start || !end) throw new BadRequestException('start and end are required for custom range');
      startAt = parseDateOnly(start); startAt.setHours(0,0,0,0);
      endAt   = parseDateOnly(end);   endAt.setHours(23,59,59,999);
    } else if (range === 'this_month') {
      startAt = startOfMonth(); endAt = endOfMonth();
    } else if (range === 'last_month') {
      const last = addMonths(new Date(), -1);
      startAt = startOfMonth(last); endAt = endOfMonth(last);
    } else if (range === 'last_6_months') {
      const now = new Date();
      startAt = startOfMonth(addMonths(now, -5)); endAt = endOfMonth(now);
    } else {
      startAt = startOfToday(); endAt = endOfToday();
    }

    // 3) سعر TRY لكل 1 USD (مُScoped)
    const tryCurrency = await this.currencyRepo.findOne({
      where: { code: 'TRY', isActive: true, tenantId }, // ✅ scope
    });
    if (!tryCurrency || !tryCurrency.rate) throw new BadRequestException('TRY currency rate not configured.');
    const tryPerUsd = Number(tryCurrency.rate);

    // 4) فلتر المزوّد (كما هو)
    const providerFilter = (qb: any) => {
      if (!provider) return;
      if (provider.toLowerCase() === 'manual') {
        qb.andWhere(new Brackets((b: any) => {
          b.where(`"o"."providerId" IS NULL`).orWhere(`"o"."providerId" = ''`);
        }));
      } else {
        qb.andWhere(`"o"."providerId" = :provider`, { provider });
      }
    };

    // 5) العدّادات (createdAt) — مع tenant
    const countsQb = this.ordersRepo.createQueryBuilder('o')
      .select('COUNT(*)', 'total')
      .addSelect(`SUM(CASE WHEN "o"."status" = 'approved' THEN 1 ELSE 0 END)`, 'approved')
      .addSelect(`SUM(CASE WHEN "o"."status" = 'rejected' THEN 1 ELSE 0 END)`, 'rejected')
      .where(`"o"."tenantId" = :tenantId`, { tenantId })      // ✅ scope
      .andWhere(`"o"."createdAt" BETWEEN :start AND :end`, { start: startAt, end: endAt });
    if (userUUID) countsQb.andWhere(`"o"."userId" = :userId`, { userId: userUUID });
    providerFilter(countsQb);
    const countsRow = await countsQb.getRawOne<{ total: string; approved: string; rejected: string }>();

    // 6) الإجماليات — من القيم المجمّدة + approvedLocalDate (مع tenant)
    const approvedQb = this.ordersRepo.createQueryBuilder('o')
      .select(`SUM(COALESCE("o"."sellTryAtApproval", 0))`, 'salesTry')
      .addSelect(`SUM(COALESCE("o"."costTryAtApproval", 0))`, 'costTry')
      .addSelect(`SUM(COALESCE("o"."profitTryAtApproval", 0))`, 'profitTry')
      .addSelect(
        `
        SUM(
          COALESCE(
            "o"."profitUsdAtApproval",
            CASE
              WHEN "o"."fxUsdTryAtApproval" IS NOT NULL AND "o"."fxUsdTryAtApproval" > 0
              THEN ("o"."profitTryAtApproval" / "o"."fxUsdTryAtApproval")
              ELSE 0
            END
          )
        )
        `,
        'profitUsd'
      )
      .where(`"o"."tenantId" = :tenantId`, { tenantId })      // ✅ scope
      .andWhere(`"o"."status" = 'approved'`)
      .andWhere(`"o"."approvedLocalDate" BETWEEN :start AND :end`, { start: startAt, end: endAt });
    if (userUUID) approvedQb.andWhere(`"o"."userId" = :userId`, { userId: userUUID });
    providerFilter(approvedQb);

    const totalsRow = await approvedQb.getRawOne<{ salesTry: string | null; costTry: string | null; profitTry: string | null; profitUsd: string | null }>();
    const totalSalesTRY = Number(totalsRow?.salesTry ?? 0);
    const totalCostTRY  = Number(totalsRow?.costTry ?? 0);
    const profitTRY     = Number(totalsRow?.profitTry ?? (totalSalesTRY - totalCostTRY));
    const profitUSD     = Number(totalsRow?.profitUsd ?? (tryPerUsd > 0 ? (profitTRY / tryPerUsd) : 0));

    return {
      filters: {
        range,
        start: formatDateIstanbul(startAt),
        end:   formatDateIstanbul(endAt),
        userId: userUUID ?? null,
        provider: provider ?? null,
        basis: 'approvedLocalDate',
      },
      counts: {
        total: Number(countsRow?.total ?? 0),
        approved: Number(countsRow?.approved ?? 0),
        rejected: Number(countsRow?.rejected ?? 0),
      },
      totalsTRY: {
        cost: Number.isFinite(totalCostTRY) ? +totalCostTRY.toFixed(2) : 0,
        sales: Number.isFinite(totalSalesTRY) ? +totalSalesTRY.toFixed(2) : 0,
      },
      profit: {
        try: Number.isFinite(profitTRY) ? +profitTRY.toFixed(2) : 0,
        usd: Number.isFinite(profitUSD) ? +profitUSD.toFixed(2) : 0,
        rateTRY: tryPerUsd,
      },
    };
  }

  @Get('profits/by-provider')
  async getProfitByProvider(
    @Req() req: Request,
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    const tenantId = this.getTenantId(req);

    if (!start || !end) throw new BadRequestException('start & end are required (YYYY-MM-DD)');

    const startAt = parseDateOnly(start); startAt.setHours(0,0,0,0);
    const endAt   = parseDateOnly(end);   endAt.setHours(23,59,59,999);

    const rows = await this.ordersRepo.createQueryBuilder('o')
      .select(`COALESCE(NULLIF("o"."providerId", ''), 'manual')`, 'provider')
      .addSelect(`SUM(COALESCE("o"."sellTryAtApproval", 0))`, 'salesTry')
      .addSelect(`SUM(COALESCE("o"."costTryAtApproval", 0))`, 'costTry')
      .addSelect(`SUM(COALESCE("o"."sellTryAtApproval", 0) - COALESCE("o"."costTryAtApproval", 0))`, 'profitTry')
      .where(`"o"."tenantId" = :tenantId`, { tenantId })    // ✅ scope
      .andWhere(`"o"."status" = 'approved'`)
      .andWhere(`"o"."approvedLocalDate" BETWEEN :start AND :end`, { start: startAt, end: endAt })
      .groupBy(`COALESCE(NULLIF("o"."providerId", ''), 'manual')`)
      .orderBy(`profitTry`, 'ASC')
      .getRawMany();

    return rows.map(r => ({
      provider: r.provider,
      totalsTRY: {
        sales: +Number(r.salesTry || 0).toFixed(2),
        cost : +Number(r.costTry  || 0).toFixed(2),
      },
      profitTRY: +Number(r.profitTry || 0).toFixed(2),
    }));
  }

  @Patch('accounting/close')
  async closeMonth(
    @Req() req: Request,
    @Query('year', new ParseIntPipe()) year: number,
    @Query('month', new ParseIntPipe()) month: number,
    @Query('note') note?: string,
  ) {
    await this.accounting.closeMonth(this.getTenantId(req), year, month, undefined, note);
    return { message: 'closed', year, month };
  }

  @Patch('accounting/close-previous')
  async closePrev(@Req() req: Request, @Query('note') note?: string) {
    await this.accounting.closePreviousMonth(this.getTenantId(req), undefined, note);
    return { message: 'closed_previous' };
  }
}
