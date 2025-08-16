// src/utils/pagination.ts
export type CursorPair = { ts: number; id: string };

/** يبني كيرسر بالشكل: <createdAtEpochMs>_<id> */
export function encodeCursor(ts: number, id: string): string {
  return `${ts}_${id}`;
}

/** يفكّ الكيرسر ويعيد {ts, id} أو null لو فاسد */
export function decodeCursor(raw?: string | null): CursorPair | null {
  if (!raw) return null;
  const s = String(raw);
  const idx = s.indexOf('_');
  if (idx <= 0) return null;
  const ts = Number(s.slice(0, idx));
  const id = s.slice(idx + 1);
  if (!Number.isFinite(ts) || !id) return null;
  return { ts, id };
}

/** يحوّل تاريخ ISO إلى epoch ms (UTC) بأمان */
export function toEpochMs(dateLike: Date | string | number): number {
  const t = new Date(dateLike).getTime();
  return Number.isFinite(t) ? t : 0;
}
