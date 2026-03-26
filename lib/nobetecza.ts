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
  /** Kaynak dokümantasyon: önceki gün listesi / güncellik ipucu (uyarı için). */
  onceki_gun?: boolean | number | string;
  message?: string;
};

/** API `onceki_gun` alanını booleana çevirir; bilinmiyorsa `null`. */
export function parseNobeteczaOncekiGun(value: unknown): boolean | null {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "1" || s === "true" || s === "evet") return true;
    if (s === "0" || s === "false" || s === "hayir" || s === "hayır")
      return false;
  }
  return null;
}

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

const DUTY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Tek il isteğiyle “bugünün listesi API’de bizim beklediğimiz güne uyuyor mu?” kontrolü.
 * Tüm illerin aynı anda güncellenme saati API’de yok; bu yüzden referans il + `tarih` / `onceki_gun`.
 */
export async function probeNobeteczaListReady(
  apiKey: string,
  ilTurkishName: string,
  listDateExpected: string
): Promise<{
  apiOk: boolean;
  readyForFullSync: boolean;
  listDateExpected: string;
  apiTarih: string | null;
  oncekiGun: boolean | null;
  eczaneAdet: number;
  reason: string;
}> {
  const base = {
    listDateExpected,
    apiTarih: null as string | null,
    oncekiGun: null as boolean | null,
    eczaneAdet: 0,
  };

  if (!DUTY_DATE_RE.test(listDateExpected)) {
    return {
      ...base,
      apiOk: false,
      readyForFullSync: false,
      reason: "Geçersiz listDateExpected",
    };
  }

  const body = await fetchNobeteczaDuty(apiKey, ilTurkishName);
  const apiTarih =
    typeof body.tarih === "string" && DUTY_DATE_RE.test(body.tarih)
      ? body.tarih
      : null;
  const oncekiGun = parseNobeteczaOncekiGun(body.onceki_gun);
  const eczaneAdet = body.adet ?? body.data?.length ?? 0;

  if (!body.success) {
    return {
      ...base,
      apiTarih,
      oncekiGun,
      eczaneAdet,
      apiOk: false,
      readyForFullSync: false,
      reason: body.message || "API başarısız",
    };
  }

  if (!apiTarih) {
    return {
      ...base,
      apiTarih: null,
      oncekiGun,
      eczaneAdet,
      apiOk: true,
      readyForFullSync: false,
      reason: "Yanıtta geçerli tarih yok; hazırlık doğrulanamıyor",
    };
  }

  if (apiTarih !== listDateExpected) {
    return {
      ...base,
      apiTarih,
      oncekiGun,
      eczaneAdet,
      apiOk: true,
      readyForFullSync: false,
      reason: `API tarihi (${apiTarih}) beklenen liste günü (${listDateExpected}) ile aynı değil`,
    };
  }

  if (oncekiGun === true) {
    return {
      ...base,
      apiTarih,
      oncekiGun,
      eczaneAdet,
      apiOk: true,
      readyForFullSync: false,
      reason: "onceki_gun işaretli (önceki güne ait liste)",
    };
  }

  return {
    ...base,
    apiTarih,
    oncekiGun,
    eczaneAdet,
    apiOk: true,
    readyForFullSync: true,
    reason: "Referans il için liste günü uyumlu",
  };
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
