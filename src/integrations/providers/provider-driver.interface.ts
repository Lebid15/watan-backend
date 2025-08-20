// src/integrations/providers/provider-driver.interface.ts
import { IntegrationConfig, NormalizedProduct } from '../types';

/** حالة موحّدة نستخدمها في الدرايفرز قبل تحويلها إلى ExternalStatus داخل الـ Services */
export type MappedStatus = 'pending' | 'success' | 'failed';

export interface ProviderDriver {
  /** رصيد المزوّد */
  getBalance(cfg: IntegrationConfig): Promise<{ balance: number }>;

  /** قائمة المنتجات/الباقات بصيغة موحّدة */
  listProducts(cfg: IntegrationConfig): Promise<NormalizedProduct[]>;

  /**
   * إنشاء طلب عند المزوّد (اختياري لبعض المزودين)
   * ملاحظات:
   * - price: تكلفة العملية عند المزوّد (عدد موجب)
   * - costCurrency: عملة التكلفة (مثلاً ZNET ترجع TRY)
   * - providerStatus: الحالة الخام من المزوّد
   * - mappedStatus: حالة موحّدة: pending | success | failed
   * - note: رسالة وصفية إن وُجدت من المزوّد
   */
  placeOrder?(
    cfg: IntegrationConfig,
    dto: {
      productId: string;
      qty: number;
      params: Record<string, any>;
      clientOrderUuid?: string;
    }
  ): Promise<{
    success: boolean;
    externalOrderId?: string;
    providerStatus?: string;
    mappedStatus?: MappedStatus;
    price?: number;
    /** عملة التكلفة من المزوّد (مثلاً: 'TRY'، 'USD'…) */
    costCurrency?: string;
    /** رسالة نصيّة من المزوّد إن وُجدت */
    note?: string;
    /** الحمولة الخام للرد (لأغراض اللوج/التتبّع) */
    raw: any;
  }>;

  /**
   * الاستعلام عن حالة مجموعة طلبات عند المزوّد (اختياري)
   * - providerStatus: الخام من المزوّد (قد تكون '1'|'2'|'3' أو نص)
   * - mappedStatus: موحّدة: pending | success | failed
   * - note: ملاحظة نصية من رد المزوّد إن وُجدت
   * - pin: كود PIN إن وُجد
   */
  checkOrders?(
    cfg: IntegrationConfig,
    ids: string[],
  ): Promise<Array<{
    externalOrderId: string;
    providerStatus: string;
    mappedStatus: MappedStatus;
    /** ملاحظة الحالة من المزوّد (desc/note/message…) إن وُجدت */
    note?: string;
    /** كود PIN إن أعاده المزوّد */
    pin?: string;
    /** الحمولة الخام للرد (لأغراض اللوج/التتبّع) */
    raw: any;
  }>>;
}
