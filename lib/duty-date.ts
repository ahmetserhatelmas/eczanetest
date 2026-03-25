/** Takvim “bugünü” — İstanbul, `YYYY-MM-DD`. */
export function dutyDateIstanbul(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function dutyHandoverHourTrt(): number {
  const n = Number(process.env.DUTY_HANDOVER_HOUR_TRT);
  if (Number.isFinite(n) && n >= 0 && n <= 23) return n;
  return 8;
}

/**
 * Supabase / CollectAPI için nöbet **liste günü** (İstanbul).
 * Resmi yayınlar genelde nöbetin başladığı güne göredir: “25 Mart 19:00 – 26 Mart sabahı” → **25 Mart**.
 * 00:00–08:00 (TRT, varsayılan) arası hâlâ bir önceki gecenin nöbeti sayılır → liste günü bir gün geri.
 */
export function dutyListDateIstanbul(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      hour: "2-digit",
      hour12: false,
    })
      .formatToParts(now)
      .find((p) => p.type === "hour")?.value ?? "12"
  );

  if (hour >= dutyHandoverHourTrt()) {
    return dutyDateIstanbul(now);
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);

  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  anchor.setUTCDate(anchor.getUTCDate() - 1);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(anchor);
}
