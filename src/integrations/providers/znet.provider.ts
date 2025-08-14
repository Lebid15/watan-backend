import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { IntegrationConfig, NormalizedProduct } from '../types';
import { ProviderDriver } from './provider-driver.interface';
import { ZnetClient } from './znet.client';
import { ZnetParser } from './znet.parser';

type Mapped = 'pending' | 'success' | 'failed';

@Injectable()
export class ZnetProvider implements ProviderDriver {
  private client: ZnetClient;
  private readonly logger = new Logger(ZnetProvider.name);

  // cfg.id -> productId -> meta
  private productMeta = new Map<string, Map<string, { oyun_bilgi_id?: string; kupur?: string }>>();

  constructor(http: HttpService) {
    this.client = new ZnetClient(http);
  }

  private baseUrl(cfg: IntegrationConfig) {
    if (!cfg.baseUrl) throw new Error('Znet: baseUrl is required');
    return cfg.baseUrl.trim();
  }

  private authQuery(cfg: IntegrationConfig) {
    if (!cfg.kod || !cfg.sifre) throw new Error('Znet: kod & sifre are required');
    return { kod: cfg.kod, sifre: cfg.sifre };
  }

  async getBalance(cfg: IntegrationConfig): Promise<{ balance: number }> {
    const data = await this.client.getRaw(this.baseUrl(cfg), 'bakiye_kontrol', this.authQuery(cfg));
    return ZnetParser.parseBalance(data);
  }

  async listProducts(cfg: IntegrationConfig): Promise<NormalizedProduct[]> {
    const json = await this.client.getJson(this.baseUrl(cfg), 'pin_listesi', this.authQuery(cfg));
    const list = ZnetParser.parsePinList(json);

    const cache = new Map<string, { oyun_bilgi_id?: string; kupur?: string }>();
    const products: NormalizedProduct[] = list.map((item: any) => {
      const externalId = String(item?.id ?? '');
      const meta = {
        oyun_bilgi_id: item?.oyun_bilgi_id ? String(item.oyun_bilgi_id) : undefined,
        kupur: item?.kupur ? String(item.kupur) : undefined,
      };
      cache.set(externalId, meta);
      return {
        externalId,
        name: item?.adi || item?.oyun_adi || `Product ${externalId}`,
        basePrice: Number(item?.fiyat ?? 0),
        category: item?.oyun_adi ? String(item.oyun_adi) : null,
        available: true,
        inputParams: ['oyuncu_bilgi', 'musteri_tel'],
        quantity: { type: 'none' },
        kind: 'package',
        meta,
      };
    });

    this.productMeta.set(cfg.id, cache);
    return products;
  }

  async placeOrder(
    cfg: IntegrationConfig,
    dto: { productId: string; qty: number; params: Record<string, any>; clientOrderUuid?: string }
  ): Promise<{
    success: boolean;
    externalOrderId?: string;
    providerStatus?: string;
    mappedStatus?: Mapped;
    price?: number;
    raw: any;
    costCurrency?: string;
  }> {
    const base = this.baseUrl(cfg);
    const auth = this.authQuery(cfg);

    // رقم مرجعي رقمي
    const referans = Date.now().toString() + Math.floor(Math.random() * 1000).toString();

    // --------- التقاط oyun/kupur من الكاش أو من params ----------
    let oyun: string | undefined = dto.params?.oyun;
    let kupur: string | undefined = dto.params?.kupur;

    if (!oyun || !kupur) {
      if (!this.productMeta.get(cfg.id)) {
        try { await this.listProducts(cfg); } catch {}
      }
      const cached = this.productMeta.get(cfg.id)?.get(String(dto.productId));
      if (cached) {
        if (!oyun && cached.oyun_bilgi_id) oyun = cached.oyun_bilgi_id;
        if (!kupur && cached.kupur)       kupur = cached.kupur;
      }
    }

    if (!oyun || !kupur) {
      this.logger.warn(`[Znet] Missing oyun/kupur for productId=${dto.productId}`);
      return {
        success: false,
        mappedStatus: 'failed',
        raw: { error: 'Missing oyun/kupur', productId: dto.productId },
      };
    }

    // --------- الأهم: تحويل userIdentifier إلى oyuncu_bilgi ----------
    // نقبل عدة أسماء محتملة قادمة من الـ payload
    const oyuncu_bilgi =
      dto.params?.oyuncu_bilgi ??
      dto.params?.oyuncuNo ??
      dto.params?.playerId ??
      dto.params?.player ??
      dto.params?.userIdentifier ??   // هذا هو الذي يرسله الـ backend حالياً
      dto.params?.uid ??
      dto.params?.gameId ??
      dto.params?.user_id ??
      dto.params?.account;

    // هاتف اختياري إن توفر
    const musteri_tel =
      dto.params?.musteri_tel ??
      dto.params?.phone ??
      dto.params?.msisdn ??
      dto.params?.tel;

    if (!oyuncu_bilgi) {
      this.logger.warn(`[Znet] Missing oyuncu_bilgi (player identifier) for productId=${dto.productId}`);
      return {
        success: false,
        mappedStatus: 'failed',
        raw: { error: 'Missing oyuncu_bilgi (player id)' },
      };
    }

    // نبني الـ query بالأسماء التي يفهمها znet تحديدًا
    const q: any = {
      ...auth,
      oyun,
      kupur,
      referans,
      oyuncu_bilgi,
    };
    if (musteri_tel) q.musteri_tel = musteri_tel;

    // (لا ننشر dto.params كما هي حتى لا نرسل userIdentifier باسم غير معروف لدى znet)

    // لوج قبل الإرسال (إخفاء sifre)
    const redacted = { ...q, sifre: q?.sifre ? '***' : undefined };
    this.logger.debug(`[Znet] pin_ekle -> base=${base} query=${JSON.stringify(redacted)}`);

    try {
      const text = await this.client.getRaw(base, 'pin_ekle', q);

      // لوج الرد الخام
      this.logger.debug(`[Znet] pin_ekle <- raw="${String(text).slice(0, 200)}"`);

      const r = ZnetParser.parsePinEkle(text);

      // لوج بعد البارس
      this.logger.debug(`[Znet] pin_ekle parsed -> ${JSON.stringify(r)}`);

      const txnId = (r as any)?.tahsilat_api_islem_id ?? (r as any)?.islem_id ?? null;

      const success = !!r.ok;
      const mappedStatus: Mapped = success ? 'pending' : 'failed';
      const providerStatus = success ? 'accepted' : 'rejected';
      const price = success
        ? Math.abs(parseFloat(String(r.cost ?? 0).replace(',', '.')))
        : undefined;

      return {
        success,
        externalOrderId: txnId ? String(txnId) : referans,
        providerStatus,
        mappedStatus,
        price,
        raw: r,
        costCurrency: success ? 'TRY' : undefined,
      };
    } catch (err: any) {
      this.logger.error(`[Znet] pin_ekle error: ${String(err?.message || err)}`);
      return {
        success: false,
        mappedStatus: 'failed',
        raw: { error: String(err?.message || err), request: redacted },
      };
    }
  }

  async checkOrders(
    cfg: IntegrationConfig,
    ids: string[]
  ): Promise<Array<{ externalOrderId: string; providerStatus: string; mappedStatus: Mapped; raw: any }>> {
    const base = this.baseUrl(cfg);
    const auth = this.authQuery(cfg);

    const out: Array<{ externalOrderId: string; providerStatus: string; mappedStatus: Mapped; raw: any }> = [];

    for (const id of ids) {
      const q = { ...auth, tahsilat_api_islem_id: id };
      const redacted = { ...q, sifre: q?.sifre ? '***' : undefined };
      this.logger.debug(`[Znet] pin_kontrol -> base=${base} query=${JSON.stringify(redacted)}`);

      const text = await this.client.getRaw(base, 'pin_kontrol', q);
      this.logger.debug(`[Znet] pin_kontrol <- raw="${String(text).slice(0, 200)}"`);

      const r = ZnetParser.parsePinKontrol(text);

      const mapped: Mapped =
        r.mapped === 'success' ? 'success' :
        r.mapped === 'failed'  ? 'failed'  :
        'pending';

      out.push({
        externalOrderId: String(id),
        providerStatus: String(r.statusCode ?? 'unknown'),
        mappedStatus: mapped,
        raw: { text, pin: r.pin, desc: r.desc },
      });
    }

    return out;
  }
}
