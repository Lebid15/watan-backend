// src/integrations/providers/barakat.provider.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { IntegrationConfig, NormalizedProduct } from '../types';
import { ProviderDriver } from './provider-driver.interface';

type Mapped = 'pending' | 'success' | 'failed';

@Injectable()
export class BarakatProvider implements ProviderDriver {
  private readonly logger = new Logger(BarakatProvider.name);

  constructor(private readonly http: HttpService) {}

  private resolveBaseUrl(cfg: IntegrationConfig) {
    // إن لم يُرسل Base URL نستخدم الافتراضي
    return cfg.baseUrl?.replace(/\/+$/, '') || 'https://api.x-stor.net';
  }

  private authHeaders(cfg: IntegrationConfig): Record<string, string> {
    if (!cfg.apiToken) {
      throw new Error('Barakat/Apstore: apiToken is required');
    }
    // after the guard above, non-null assertion is fine for TS
    return { 'api-token': cfg.apiToken! };
  }

  // ----------------------------
  // Helpers: mapping + extraction
  // ----------------------------
  private mapStatus(s?: string): Mapped {
    const v = String(s ?? '').trim().toLowerCase();
    if (['success', 'ok', 'done', 'complete', 'completed'].includes(v)) return 'success';
    if (['reject', 'rejected', 'failed', 'fail', 'error', 'cancelled', 'canceled'].includes(v)) return 'failed';
    if (['wait', 'pending', 'processing', 'inprogress', 'queued', 'queue', 'accepted'].includes(v)) return 'pending';
    return 'pending';
  }

  private looksLikeHardFailure(data: any): boolean {
    // أمثلة رسائل نقص الرصيد أو خطأ واضح من الـ top-level
    const top = String(data?.status ?? '').toUpperCase();
    if (top && top !== 'OK') return true;

    const msg =
      (data?.message ?? data?.error ?? data?.desc ?? data?.text ?? '') as string;
    const s = String(msg).toLowerCase();
    if (!s) return false;

    return [
      'insufficient balance',
      'bakiye',
      'balance',
      'not enough',
      'unauthorized',
      'invalid token',
      'missing',
      'hata',
      'error',
      'fail',
      'rejected',
    ].some((kw) => s.includes(kw));
  }

  private pickNote(obj: any): string | undefined {
    if (!obj) return undefined;

    // replay_api غالبًا مصفوفة نصوص توضيحيّة
    if (Array.isArray(obj.replay_api) && obj.replay_api.length) {
      const txt = obj.replay_api.find((x: any) => typeof x === 'string') as string | undefined;
      if (txt && txt.trim()) return txt.trim();
    }

    const candidates = [
      obj.note,
      obj.message,
      obj.desc,
      obj.text,
      obj.error,
      obj.status_text,
      obj.statusMessage,
    ];
    for (const c of candidates) {
      const s = (c ?? '').toString().trim();
      if (s) return s;
    }
    return undefined;
  }

  private pickPin(obj: any): string | undefined {
    if (!obj) return undefined;
    // حاول التقاط pin إن كان موجودًا داخل data/raw
    const candidates = [obj.pin, obj.code, obj.voucher, obj.serial];
    for (const c of candidates) {
      if (c != null) {
        const s = String(c).trim();
        if (s) return s;
      }
    }
    return undefined;
  }

  // --------------
  // API methods
  // --------------
  async getBalance(cfg: IntegrationConfig): Promise<{ balance: number }> {
  const url = `${this.resolveBaseUrl(cfg)}/client/api/profile`;
  const started = Date.now();
  const { data } = await firstValueFrom(this.http.get(url, { headers: this.authHeaders(cfg), timeout: 15000 }));
  this.logger.log(`[Barakat] getBalance duration=${Date.now()-started}ms`);
    // مثال الرد: { balance: "43.55", email: "..." }
    const balance =
      typeof data?.balance === 'string' ? parseFloat(data.balance) : Number(data?.balance ?? 0);
    if (Number.isNaN(balance)) throw new Error('Invalid balance response');
    return { balance };
  }

  async listProducts(cfg: IntegrationConfig): Promise<NormalizedProduct[]> {
    const url = `${this.resolveBaseUrl(cfg)}/client/api/products`;
    const started = Date.now();
    let data: any;
    try {
      const resp = await firstValueFrom(this.http.get(url, { headers: this.authHeaders(cfg), timeout: 30000 }));
      data = resp.data;
    } catch (e: any) {
      this.logger.error(`[Barakat] listProducts failed after ${Date.now()-started}ms: ${e?.message || e}`);
      throw e;
    }
    const duration = Date.now() - started;
    if (!Array.isArray(data)) {
      this.logger.warn(`[Barakat] listProducts non-array response duration=${duration}ms`);
      return [];
    }
    this.logger.log(`[Barakat] listProducts fetched count=${data.length} duration=${duration}ms`);

    if (!Array.isArray(data)) return [];

    return data.map((p: any) => {
      // qty_values: null | {min,max} | string[]
      let quantity: NormalizedProduct['quantity'] = { type: 'none' };
      if (p.qty_values && typeof p.qty_values === 'object' && !Array.isArray(p.qty_values)) {
        const min = Number(p.qty_values.min);
        const max = Number(p.qty_values.max);
        quantity = { type: 'range', min, max };
      } else if (Array.isArray(p.qty_values)) {
        const values = p.qty_values.map((v: any) => Number(v)).filter((n: number) => !Number.isNaN(n));
        quantity = { type: 'set', values };
      }

      return {
        externalId: p.id,
        name: p.name,
        basePrice: Number(p.price),
        category: p.category_name && p.category_name !== 'null' ? p.category_name : null,
        available: Boolean(p.available),
        inputParams: Array.isArray(p.params) ? p.params : [],
        quantity,
        kind: p.product_type as 'package' | 'amount' | 'specificPackage',
      } as NormalizedProduct;
    });
  }

  async placeOrder(
    cfg: IntegrationConfig,
    dto: { productId: string; qty: number; params: Record<string, any>; clientOrderUuid?: string }
  ) {
    const base = this.resolveBaseUrl(cfg);
    const headers = this.authHeaders(cfg);

    const sp = new URLSearchParams();
    sp.set('qty', String(dto.qty));
    for (const [k, v] of Object.entries(dto.params || {})) sp.set(k, String(v));
    if (dto.clientOrderUuid) sp.set('order_uuid', String(dto.clientOrderUuid));

    const url = `${base}/client/api/newOrder/${encodeURIComponent(dto.productId)}/params?${sp.toString()}`;

    try {
      const { data } = await firstValueFrom(this.http.get(url, { headers }));

      this.logger.debug(`[Barakat] newOrder <- raw="${JSON.stringify(data).slice(0, 400)}"`);

      const okTop = String(data?.status ?? '').toUpperCase() === 'OK';
      const providerStatus =
        data?.data?.status ??
        data?.status ??
        data?.data?.state ??
        data?.state ??
        '';

      // إذا الرد العام خطأ أو رسالة نقص رصيد → mapped=failed
      const hardFail = this.looksLikeHardFailure(data);
      const mappedStatus: Mapped = hardFail ? 'failed' : this.mapStatus(providerStatus);

      const note = this.pickNote(data?.data) ?? this.pickNote(data);
      const pin = this.pickPin(data?.data) ?? this.pickPin(data);

      this.logger.debug(
        `[Barakat] newOrder parsed -> {okTop:${okTop}, providerStatus:"${providerStatus}", mappedStatus:"${mappedStatus}", note:"${note ?? ''}", pin:"${pin ?? ''}"}`
      );

      // لو الرد العام ليس OK نعتبر العملية فاشلة
      if (!okTop) {
        return {
          success: false,
          mappedStatus: 'failed' as Mapped,
          providerStatus: providerStatus || (data?.status as string) || 'error',
          raw: data,
          ...(note ? { note } : {}),
        };
      }

      // success حقيقي (قد يكون بانتظار المعالجة عند المزوّد)
      const priceNum = Number(data?.data?.price ?? 0);
      return {
        success: true,
        externalOrderId: data?.data?.order_id ? String(data.data.order_id) : undefined,
        providerStatus,
        mappedStatus,
        price: Number.isFinite(priceNum) ? priceNum : 0,
        raw: data,
        // ⬅️ مهم: بركات بالليرة
        costCurrency: 'TRY',
        ...(note ? { note } : {}),
        ...(pin ? { pin } : {}),
      };
    } catch (err: any) {
      this.logger.error(`[Barakat] newOrder error: ${String(err?.message || err)}`);
      return {
        success: false,
        mappedStatus: 'failed' as Mapped,
        providerStatus: 'error',
        raw: { error: String(err?.message || err) },
      };
    }
  }

  async checkOrders(cfg: IntegrationConfig, ids: string[]) {
    const base = this.resolveBaseUrl(cfg);
    const headers = this.authHeaders(cfg);

    // API يتوقع JSON array ضمن query param
    const encoded = encodeURIComponent(`[${ids.join(',')}]`);
    const url = `${base}/client/api/check?orders=${encoded}`;

    const { data } = await firstValueFrom(this.http.get(url, { headers }));
    const list = Array.isArray(data?.data) ? data.data : [];

    this.logger.debug(`[Barakat] check <- raw="${JSON.stringify(data).slice(0, 400)}"`);

    const mapped = list.map((o: any) => {
      const providerStatus: string =
        o?.status ??
        o?.state ??
        o?.orderStatus ??
        '';

      const mappedStatus: Mapped = this.mapStatus(providerStatus);

      const note = this.pickNote(o) ?? this.pickNote(data); // التقط ملاحظة من العنصر أو الغلاف
      const pin  = this.pickPin(o);

      const row = {
        externalOrderId: o?.order_id ? String(o.order_id) : '',
        providerStatus,
        mappedStatus,
        raw: o,
        ...(note ? { note } : {}),
        ...(pin ? { pin } : {}),
        // لتوحيد العملة إن استُخدمت price من check
        costCurrency: 'TRY' as const,
      };

      this.logger.debug(
        `[Barakat] check parsed -> ${JSON.stringify({
          externalOrderId: row.externalOrderId,
          providerStatus: row.providerStatus,
          mappedStatus: row.mappedStatus,
          note: note ?? '',
          pin: pin ?? '',
        })}`
      );

      return row;
    });

    return mapped;
  }
}
