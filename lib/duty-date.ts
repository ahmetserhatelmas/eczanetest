/** Nöbetçi eczane günü — Türkiye saati (Europe/Istanbul). */
export function dutyDateIstanbul(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) {
    return new Date().toISOString().slice(0, 10);
  }
  return `${y}-${m}-${d}`;
}
