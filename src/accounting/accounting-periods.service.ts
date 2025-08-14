import { Injectable, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';

type PeriodStatus = 'open' | 'closed';

@Injectable()
export class AccountingPeriodsService {
  constructor(private readonly ds: DataSource) {}

  private ymFromDate(d: Date) {
    const dt = new Date(d);
    return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1 };
  }

  async isClosed(date: Date): Promise<boolean> {
    const { year, month } = this.ymFromDate(date);
    const rows = await this.ds.query(
      `SELECT status FROM accounting_periods WHERE year = $1 AND month = $2 LIMIT 1`,
      [year, month],
    );
    const status: PeriodStatus = rows?.[0]?.status ?? 'open';
    return status === 'closed';
  }

  async closeMonth(year: number, month: number, by?: string, note?: string) {
    await this.ds.query(
      `
      INSERT INTO accounting_periods (year, month, status, "closedAt", "closedBy", note)
      VALUES ($1, $2, 'closed', NOW(), $3, $4)
      ON CONFLICT (year, month)
      DO UPDATE SET status='closed', "closedAt" = NOW(), "closedBy" = $3, note = COALESCE($4, accounting_periods.note)
      `,
      [year, month, by ?? null, note ?? null],
    );
  }

  async closePreviousMonth(by?: string, note?: string) {
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    await this.closeMonth(prev.getUTCFullYear(), prev.getUTCMonth() + 1, by, note);
  }

  /** يمنع تعديل طلب معتمد يقع ضمن شهر مُقفَل */
  async assertApprovedMonthOpen(approvedLocalDate?: Date | null) {
    if (!approvedLocalDate) return; // غير معتمد بعد → لا منع
    if (await this.isClosed(approvedLocalDate)) {
      throw new ConflictException('الفترة محاسبيًا مُقفَلة — لا يمكن تعديل طلبات هذا الشهر');
    }
  }
}
