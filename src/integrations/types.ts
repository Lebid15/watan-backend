export type ProviderKind = 'barakat' | 'apstore' | 'znet';

export interface IntegrationConfig {
  id: string;            // in-memory id (uuid string)
  name: string;          // اسم الـ API عندنا
  provider: ProviderKind;
  baseUrl?: string;      // barakat/apstore (افتراضي: https://api.x-stor.net)
  apiToken?: string;     // barakat/apstore
  // Znet:
  kod?: string;
  sifre?: string;
}

export interface NormalizedProduct {
  externalId: string; // توحيدًا: نخزّنه كسلسلة دومًا
  name: string;
  basePrice: number;
  category: string | null;
  available: boolean;
  inputParams: string[];
  quantity:
    | { type: 'none' }
    | { type: 'range'; min: number; max: number }
    | { type: 'set'; values: number[] };
  kind: 'package' | 'amount' | 'specificPackage';
  meta?: Record<string, any>;     // ميتا اختيارية (لـ Znet: oyun_bilgi_id, kupur, ...)
  currencyCode?: string | null;   // (اختياري) لو وفر المزوّد عملة العنصر
}
