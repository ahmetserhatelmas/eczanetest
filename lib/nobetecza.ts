/** nobetecza.com API — `il` / `ilce` URL slug’ları (küçük harf, Türkçe harfsiz). */
export function toNobeteczaSlug(s: string): string {
  const t = s.trim().toLocaleLowerCase("tr-TR");
  const map: Record<string, string> = {
    ç: "c",
    ğ: "g",
    ı: "i",
    ö: "o",
    ş: "s",
    ü: "u",
  };
  let out = "";
  for (const ch of t) {
    out += map[ch] ?? ch;
  }
  return out.replace(/[^a-z0-9]/g, "");
}

const NOBETECZA_BASE = "https://api.nobetecza.com/v1/nobetci";

export type NobeteczaItem = {
  id: number;
  ad: string;
  adres: string;
  telefon: string;
  il: string;
  ilce: string;
  konum: { lat: number; lng: number } | null;
};

export type NobeteczaResponse = {
  success: boolean;
  data?: NobeteczaItem[];
  adet?: number;
  tarih?: string;
  message?: string;
};

export async function fetchNobeteczaDuty(
  apiKey: string,
  ilTurkishName: string,
  ilceTurkishName?: string
): Promise<NobeteczaResponse> {
  const ilSlug = toNobeteczaSlug(ilTurkishName);
  if (!ilSlug) {
    return { success: false, message: "Geçersiz il" };
  }

  const url = new URL(NOBETECZA_BASE);
  url.searchParams.set("il", ilSlug);
  if (ilceTurkishName?.trim()) {
    const ilceSlug = toNobeteczaSlug(ilceTurkishName);
    if (ilceSlug) url.searchParams.set("ilce", ilceSlug);
  }

  const res = await fetch(url.toString(), {
    headers: {
      "X-API-Key": apiKey,
      accept: "application/json",
    },
    cache: "no-store",
  });

  const raw = await res.text();
  let body: NobeteczaResponse;
  try {
    body = JSON.parse(raw) as NobeteczaResponse;
  } catch {
    return {
      success: false,
      message: raw.slice(0, 200) || `HTTP ${res.status}`,
    };
  }

  if (!res.ok) {
    return {
      success: false,
      message:
        (body as { message?: string }).message ||
        `HTTP ${res.status}`,
    };
  }

  if (body.success === false) {
    return {
      success: false,
      message: (body as { message?: string }).message || "API başarısız",
    };
  }

  return body;
}

/** API satırını harita bileşeninin beklediği forma çevirir. */
export function nobeteczaItemToDutyPharmacy(row: NobeteczaItem): {
  name: string;
  dist: string;
  address: string;
  phone: string;
  loc: string;
} {
  const lat = row.konum?.lat;
  const lng = row.konum?.lng;
  const loc =
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
      ? `${lat},${lng}`
      : "";
  const tel = (row.telefon ?? "").trim();
  const phone =
    tel.startsWith("+") || tel.startsWith("0")
      ? tel
      : tel
        ? `0${tel}`
        : "";
  return {
    name: row.ad ?? "",
    dist: row.ilce ?? "",
    address: row.adres ?? "",
    phone,
    loc,
  };
}
