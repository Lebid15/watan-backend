export type ZnetMapped = 'pending' | 'success' | 'failed';

export class ZnetParser {
  static parseBalance(text: string) {
    if (!text) throw new Error('Empty response (Auth/IP?)');
    const parts = String(text).trim().split('|');
    if (parts[0]?.toUpperCase() !== 'OK' || parts.length < 2) {
      throw new Error('Invalid balance response');
    }
    const balance = Number(parts[1]);
    if (Number.isNaN(balance)) throw new Error('Invalid balance number');
    return { balance };
  }

  static parsePinList(json: any) {
    if (!json || json.success !== true || !Array.isArray(json.result)) {
      const msg = json?.error || 'Invalid pin_listesi response';
      throw new Error(msg);
    }
    return json.result as Array<any>;
  }

  static parsePinEkle(text: string) {
    const t = String(text ?? '').trim();
    if (!t) throw new Error('Empty response from Znet (check IP/auth or params)');

    // مثال نجاح: "OK|{cost}|{balance}"
    if (/^OK\b/i.test(t)) {
      const parts = t.split('|');
      const cost = Number(parts[1] ?? 0);
      const balance = Number(parts[2] ?? 0);
      return { ok: true, cost, balance, raw: t };
    }

    // مثال خطأ: "8|Bağlantı ..."
    const m = t.match(/^(\d+)\|(.*)$/s);
    if (m) {
      const code = m[1];
      const msg = (m[2] ?? '').trim();
      return { ok: false, code, error: msg, raw: t };
    }

    if (t.startsWith('<!DOCTYPE') || t.startsWith('<html')) {
      throw new Error('HTML response from Znet (likely wrong baseUrl or IP restriction)');
    }

    throw new Error(`Unexpected pin_ekle response: ${t}`);
  }

  /**
   * pin_kontrol:
   *  - "OK|1|<PIN>|<DESC>"  => success (تم القبول)
   *  - "OK|2| - |"         => pending (انتظار)
   *  - "OK|3| - |"         => failed  (تم الرفض/الإبطال)
   *  كما قد يأتي أحياناً "1|..." بدون OK في بعض الحالات، ونعامله بنفس المنطق.
   */
  static parsePinKontrol(text: string) {
    const t = String(text ?? '').trim();
    if (!t) throw new Error('Empty response from Znet (pin_kontrol)');

    // الشكل الأساسي: OK|{code}|{pin}|{desc}
    const m = t.match(/^OK\|(\d)\|(.*?)\|(.*)$/s);
    if (!m) {
      // شكل بديل: {code}|{desc}
      const alt = t.match(/^(\d)\|(.*)$/s);
      if (alt) {
        const code = alt[1];
        const desc = (alt[2] ?? '').trim();
        const mapped: ZnetMapped =
          code === '1' ? 'pending' :
          code === '2' ? 'success' :
          'failed';
        return { statusCode: code, pin: '', desc, mapped };
      }
      throw new Error(`Unexpected pin_kontrol response: ${t}`);
    }

    const code = m[1];
    const pinRaw = (m[2] ?? '').trim();
    const desc = (m[3] ?? '').trim();
    const pin = pinRaw && pinRaw !== '-' ? pinRaw : '';

    const mapped: ZnetMapped =
      code === '1' ? 'pending' :
      code === '2' ? 'success' :
      'failed';

    return { statusCode: code, pin, desc, mapped };
  }
}
