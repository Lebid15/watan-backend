import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

type PeriodStatus = 'open' | 'closed';

@Injectable()
export class AccountingPeriodsService {
  constructor(private readonly ds: DataSource) {}

  private ymFromDate(d: Date) {
    const dt = new Date(d);
    return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1 };
  }

  /** هل الشهر مُقفَل لهذا المستأجر؟ */
  async isClosed(tenantId: string, date: Date): Promise<boolean> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    const { year, month } = this.ymFromDate(date);
    const rows = await this.ds.query(
      `SELECT status
         FROM accounting_periods
        WHERE "tenantId" = $1 AND year = $2 AND month = $3
        LIMIT 1`,
      [tenantId, year, month],
    );
    const status: PeriodStatus = rows?.[0]?.status ?? 'open';
    return status === 'closed';
  }

  /** إقفال شهر محدد لهذا المستأجر */
  async closeMonth(tenantId: string, year: number, month: number, by?: string, note?: string) {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    await this.ds.query(
      `
      INSERT INTO accounting_periods ("tenantId", year, month, status, "closedAt", "closedBy", note)
      VALUES ($1, $2, $3, 'closed', NOW(), $4, $5)
      ON CONFLICT ("tenantId", year, month)
      DO UPDATE SET
        status   = 'closed',
        "closedAt" = NOW(),
        "closedBy" = $4,
        note     = COALESCE($5, accounting_periods.note)
      `,
      [tenantId, year, month, by ?? null, note ?? null],
    );
  }

  /** إقفال الشهر السابق */
  async closePreviousMonth(tenantId: string, by?: string, note?: string) {
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    await this.closeMonth(tenantId, prev.getUTCFullYear(), prev.getUTCMonth() + 1, by, note);
  }

  /** يمنع تعديل طلب معتمد يقع ضمن شهر مُقفَل */
  async assertApprovedMonthOpen(tenantId: string, approvedLocalDate?: Date | null) {
    if (!approvedLocalDate) return; // غير معتمد بعد → لا منع
    if (await this.isClosed(tenantId, approvedLocalDate)) {
      throw new ConflictException('الفترة محاسبيًا مُقفَلة — لا يمكن تعديل طلبات هذا الشهر');
    }
  }
}
