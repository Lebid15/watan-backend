import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { IntegrationConfig, NormalizedProduct } from '../types';
import { ProviderDriver } from './provider-driver.interface';

@Injectable()
export class BarakatProvider implements ProviderDriver {
  constructor(private readonly http: HttpService) {}

  private resolveBaseUrl(cfg: IntegrationConfig) {
    // إن لم يُرسل Base URL نستخدم الافتراضي
    return cfg.baseUrl?.replace(/\/+$/, '') || 'https://api.x-stor.net';
  }

  private authHeaders(cfg: IntegrationConfig) {
    if (!cfg.apiToken) {
      throw new Error('Barakat/Apstore: apiToken is required');
    }
    return { 'api-token': cfg.apiToken };
  }

  async getBalance(cfg: IntegrationConfig): Promise<{ balance: number }> {
    const url = `${this.resolveBaseUrl(cfg)}/client/api/profile`;
    const { data } = await firstValueFrom(
      this.http.get(url, { headers: this.authHeaders(cfg) }),
    );
    // مثال الرد: { balance: "43.55", email: "..." }
    const balance = typeof data?.balance === 'string' ? parseFloat(data.balance) : Number(data?.balance ?? 0);
    if (Number.isNaN(balance)) throw new Error('Invalid balance response');
    return { balance };
  }

  async listProducts(cfg: IntegrationConfig): Promise<NormalizedProduct[]> {
    const url = `${this.resolveBaseUrl(cfg)}/client/api/products`;
    const { data } = await firstValueFrom(
      this.http.get(url, { headers: this.authHeaders(cfg) }),
    );

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
    if (dto.clientOrderUuid) sp.set('order_uuid', dto.clientOrderUuid);

    const url = `${base}/client/api/newOrder/${encodeURIComponent(dto.productId)}/params?${sp.toString()}`;

    const { data } = await firstValueFrom(this.http.get(url, { headers }));
    const ok: boolean = data?.status === 'OK';
    const providerStatus: string = data?.data?.status ?? '';

    // ✅ ثبّت النوع لاتحاد القيم المسموح بها
    const mappedStatus: 'pending' | 'success' | 'failed' =
      providerStatus === 'wait' ? 'pending' : 'pending'; // حدّثها لاحقًا عند ظهور قيم أخرى

    return {
      success: ok,
      externalOrderId: data?.data?.order_id ? String(data.data.order_id) : undefined,
      providerStatus,
      mappedStatus,
      price: Number(data?.data?.price ?? 0),
      raw: data,
      costCurrency: ok ? 'USD' : undefined,
    };
  }


  async checkOrders(cfg: IntegrationConfig, ids: string[]) {
    const base = this.resolveBaseUrl(cfg);
    const headers = this.authHeaders(cfg);

    const encoded = encodeURIComponent(`[${ids.join(',')}]`);
    const url = `${base}/client/api/check?orders=${encoded}`;
    const { data } = await firstValueFrom(this.http.get(url, { headers }));

    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map((o: any) => {
      const providerStatus: string = o?.status ?? '';
      const mappedStatus: 'pending' | 'success' | 'failed' =
        providerStatus === 'wait' ? 'pending' : 'pending'; // عدّل mapping لاحقًا

      return {
        externalOrderId: o?.order_id ? String(o.order_id) : '',
        providerStatus,
        mappedStatus,
        raw: o,
      };
    });
  }

}
