import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export class ZnetClient {
  constructor(private readonly http: HttpService) {}

  private buildUrl(baseUrl: string, path: string, query: Record<string, string | number | undefined>) {
    const base = baseUrl.replace(/\/+$/, '');
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) sp.set(k, String(v));
    }
    return `${base}/servis/${path}.php?${sp.toString()}`;
  }

  async getRaw(baseUrl: string, path: string, query: Record<string, string | number | undefined>) {
    const url = this.buildUrl(baseUrl, path, query);
    const { data } = await firstValueFrom(this.http.get(url, { responseType: 'text' as any }));
    return data;
  }

  async getJson(baseUrl: string, path: string, query: Record<string, string | number | undefined>) {
    const text = await this.getRaw(baseUrl, path, query);
    try {
      return JSON.parse(String(text));
    } catch {
      throw new Error(
        `Non-JSON response from Znet for ${path}.php (check baseUrl/IP/auth). Raw: ${String(text).slice(0, 200)}`
      );
    }
  }
}
