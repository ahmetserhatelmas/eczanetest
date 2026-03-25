import { parseLoc } from "@/lib/pharmacy";
import { TURKISH_PROVINCES } from "@/lib/provinces";
import { dutyListDateIstanbul } from "@/lib/duty-date";
import type { SupabaseClient } from "@supabase/supabase-js";

type CollectItem = {
  name: string;
  dist: string;
  address: string;
  phone: string;
  loc: string;
};

export type DutyPharmacyRow = {
  duty_date: string;
  il: string;
  ilce: string;
  name: string;
  address: string;
  phone: string;
  lat: number;
  lng: number;
};

export type SyncSummary = {
  dutyDate: string;
  provincesOk: number;
  provincesFailed: number;
  rowsInserted: number;
  errors: { il: string; message: string }[];
  durationMs: number;
};

const COLLECT_URL = "https://api.collectapi.com/health/dutyPharmacy";

function formatSyncError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint, o.code].filter(
      (x): x is string => typeof x === "string" && x.length > 0
    );
    if (parts.length) return parts.join(" — ");
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function looksLikeRateLimit(text: string, status: number) {
  if (status === 429) return true;
  const t = text.toLowerCase();
  return t.includes("rate limit") || t.includes("too many requests");
}

/**
 * CollectAPI’ye `date` eklenir (dokümanda yok). Saha testi: `date=2025-03-25` vs `26` vs `27`
 * yanıtı birebir aynı — parametre gün seçmiyor; sadece bizim `duty_date` ile eşleme için gönderiliyor.
 */
async function fetchDutyPharmacyProvince(
  il: string,
  collectApiKey: string,
  dutyDate: string
): Promise<CollectItem[]> {
  const url = new URL(COLLECT_URL);
  url.searchParams.set("il", il);
  url.searchParams.set("date", dutyDate);
  const headers = {
    authorization: `apikey ${collectApiKey}`,
    "content-type": "application/json",
  };

  let lastErr = "Bilinmeyen hata";

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url.toString(), { headers });
    const raw = await res.text();

    let body: {
      success?: boolean;
      result?: CollectItem[];
      message?: string;
    };

    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      const snippet = raw.slice(0, 280).trim();
      lastErr = snippet || `HTTP ${res.status} (JSON değil)`;
      if (looksLikeRateLimit(raw, res.status) && attempt < 3) {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      throw new Error(lastErr);
    }

    if (!res.ok || body.success === false) {
      const msg = body.message || `HTTP ${res.status}`;
      if (looksLikeRateLimit(msg, res.status) && attempt < 3) {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      throw new Error(msg);
    }

    return body.result ?? [];
  }

  throw new Error(lastErr);
}

const DUTY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function syncDutyPharmacies(opts: {
  collectApiKey: string;
  supabase: SupabaseClient;
  /** İller arası bekleme; CollectAPI dakika bazlı limit için yüksek tutun (ör. 800+). */
  delayMs?: number;
  /** `YYYY-MM-DD` — CollectAPI `date=` ve `duty_date`; yoksa aktif liste günü (`dutyListDateIstanbul`). */
  dutyDate?: string;
}): Promise<SyncSummary> {
  const start = Date.now();
  const fromOpt = opts.dutyDate?.trim();
  const dutyDate =
    fromOpt && DUTY_DATE_RE.test(fromOpt) ? fromOpt : dutyListDateIstanbul();
  const envDelay = Number(process.env.SYNC_DELAY_MS);
  const defaultDelay = Number.isFinite(envDelay) && envDelay >= 0 ? envDelay : 850;
  const { collectApiKey, supabase, delayMs = defaultDelay } = opts;
  const errors: { il: string; message: string }[] = [];
  let provincesOk = 0;
  let provincesFailed = 0;
  let rowsInserted = 0;

  const total = TURKISH_PROVINCES.length;
  for (let i = 0; i < total; i++) {
    const il = TURKISH_PROVINCES[i];
    console.log(`[duty-sync] ${i + 1}/${total} ${il} (${dutyDate})…`);
    try {
      const items = await fetchDutyPharmacyProvince(il, collectApiKey, dutyDate);

      const { error: delErr } = await supabase
        .from("duty_pharmacies")
        .delete()
        .eq("duty_date", dutyDate)
        .eq("il", il);

      if (delErr) throw delErr;

      const rows: DutyPharmacyRow[] = [];
      for (const item of items) {
        const ll = parseLoc(item.loc);
        if (!ll) continue;
        rows.push({
          duty_date: dutyDate,
          il,
          ilce: (item.dist ?? "").trim(),
          name: item.name,
          address: item.address ?? "",
          phone: item.phone ?? "",
          lat: ll.lat,
          lng: ll.lng,
        });
      }

      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from("duty_pharmacies")
          .insert(rows);
        if (insErr) throw insErr;
        rowsInserted += rows.length;
      }

      provincesOk++;
      console.log(`[duty-sync] ${il} tamam (${rows.length} satır)`);
    } catch (e) {
      provincesFailed++;
      console.warn(`[duty-sync] ${il} hata:`, formatSyncError(e));
      errors.push({
        il,
        message: formatSyncError(e),
      });
    }

    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    dutyDate,
    provincesOk,
    provincesFailed,
    rowsInserted,
    errors,
    durationMs: Date.now() - start,
  };
}
