export class CreateDepositDto {
  /** وسيلة الدفع المختارة */
  methodId: string;

  /** المبلغ الذي أرسله فعليًا */
  originalAmount: number;

  /** العملة التي أرسل بها (مثل: USD, TRY) */
  originalCurrency: string;

  /** عملة محفظة المستخدم (مثل: TRY) */
  walletCurrency: string;

  /** ملاحظة اختيارية */
  note?: string;
}
