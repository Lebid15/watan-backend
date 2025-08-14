import { IntegrationConfig, NormalizedProduct } from '../types';

export interface ProviderDriver {
  getBalance(cfg: IntegrationConfig): Promise<{ balance: number }>;
  listProducts(cfg: IntegrationConfig): Promise<NormalizedProduct[]>;
  placeOrder?(
    cfg: IntegrationConfig,
    dto: { productId: string; qty: number; params: Record<string, any>; clientOrderUuid?: string }
  ): Promise<{
    success: boolean;
    externalOrderId?: string;
    providerStatus?: string;
    mappedStatus?: 'pending' | 'success' | 'failed';
    price?: number;
    raw: any;
  }>;
  checkOrders?(
    cfg: IntegrationConfig,
    ids: string[],
  ): Promise<Array<{
    externalOrderId: string;
    providerStatus: string;
    mappedStatus: 'pending' | 'success' | 'failed';
    raw: any;
  }>>;
}
