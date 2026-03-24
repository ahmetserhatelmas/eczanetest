/** Google Geocoder `administrative_area_level_1` → TURKISH_PROVINCES eşlemesi. */
export function matchTurkishProvince(
  components: google.maps.GeocoderAddressComponent[] | undefined,
  provinces: readonly string[]
): string | null {
  if (!components?.length) return null;

  const admin1 = components.find((c) =>
    c.types.includes("administrative_area_level_1")
  )?.long_name;

  if (!admin1) return null;

  const normalized = admin1
    .replace(/\s+Province$/i, "")
    .replace(/\s+ili$/i, "")
    .replace(/\s+İli$/i, "")
    .trim();

  const lower = (s: string) => s.toLocaleLowerCase("tr");

  for (const p of provinces) {
    if (p.localeCompare(normalized, "tr", { sensitivity: "accent" }) === 0) {
      return p;
    }
  }

  const n = lower(normalized);
  for (const p of provinces) {
    if (lower(p) === n) return p;
  }

  for (const p of provinces) {
    const pl = lower(p);
    if (n.includes(pl) || pl.includes(n)) return p;
  }

  return null;
}
