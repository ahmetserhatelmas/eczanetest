export type DutyPharmacy = {
  name: string;
  dist: string;
  address: string;
  phone: string;
  loc: string;
};

export function parseLoc(
  loc: string | undefined
): { lat: number; lng: number } | null {
  if (!loc) return null;
  const parts = loc.split(",").map((s) => Number.parseFloat(s.trim()));
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null;
  return { lat: parts[0], lng: parts[1] };
}
