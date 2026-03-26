import { fetchNobeteczaDuty } from "@/lib/nobetecza";
import { dutyListDateIstanbul } from "@/lib/duty-date";
import { TURKISH_PROVINCES } from "@/lib/provinces";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DutyPharmacyRow = {
  duty_date: string;
  il: string;
  ilce: string;
  name: string;
  address: string;
  phone: string;
  lat: number | null;
  lng: number | null;
  nobetecza_id: number | null;
};

export type NobeteczaSyncSummary = {
  dutyDateUsed: string;
  provincesOk: number;
  provincesFailed: number;
  rowsInserted: number;
  errors: { il: string; message: string }[];
  durationMs: number;
  /** Güncel nöbet günü dışındaki tüm satırlar silindi mi */
  staleDutyDatesPurged: boolean;
  purgeError: string | null;
};

const DUTY_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function formatSyncError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function normalizePhone(t: string): string {
  const tel = t.trim();
  if (!tel) return "";
  if (tel.startsWith("+") || tel.startsWith("0")) return tel;
  return `0${tel}`;
}

/** Sadece `keepDutyDate` kalsın; önceki nöbet günleri ve yanlış tarih kalıntıları silinir. */
async function purgeDutyDatesExcept(
  supabase: SupabaseClient,
  keepDutyDate: string
): Promise<{ error: Error | null }> {
  if (!DUTY_DATE_RE.test(keepDutyDate)) {
    return { error: new Error("Geçersiz duty_date; temizlik atlandı") };
  }
  const { error } = await supabase
    .from("duty_pharmacies")
    .delete()
    .neq("duty_date", keepDutyDate);
  return { error: error ? new Error(error.message) : null };
}

export async function syncDutyPharmaciesFromNobetecza(opts: {
  apiKey: string;
  supabase: SupabaseClient;
  /** nobetecza ~1 istek/s; varsayılan 1100 ms */
  delayMs?: number;
}): Promise<NobeteczaSyncSummary> {
  const start = Date.now();
  const envDelayNob = Number(process.env.NOBETECZA_SYNC_DELAY_MS);
  const envDelayShort = Number(process.env.SYNC_DELAY_MS);
  const fromEnv =
    Number.isFinite(envDelayNob) && envDelayNob >= 0
      ? envDelayNob
      : Number.isFinite(envDelayShort) && envDelayShort >= 0
        ? envDelayShort
        : null;
  const delayMs = fromEnv ?? opts.delayMs ?? 1100;

  const { apiKey, supabase } = opts;
  const errors: { il: string; message: string }[] = [];
  let provincesOk = 0;
  let provincesFailed = 0;
  let rowsInserted = 0;
  let dutyDateUsed = dutyListDateIstanbul();
  let dutyDateSetFromApi = false;

  const total = TURKISH_PROVINCES.length;

  for (let i = 0; i < total; i++) {
    const il = TURKISH_PROVINCES[i];
    console.log(`[nobetecza-sync] ${i + 1}/${total} ${il}…`);

    try {
      const body = await fetchNobeteczaDuty(apiKey, il);
      if (!body.success) {
        throw new Error(body.message || "API başarısız");
      }

      const tarih =
        typeof body.tarih === "string" && DUTY_DATE_RE.test(body.tarih)
          ? body.tarih
          : dutyListDateIstanbul();

      if (!dutyDateSetFromApi) {
        dutyDateUsed = tarih;
        dutyDateSetFromApi = true;
      }

      const { error: delErr } = await supabase
        .from("duty_pharmacies")
        .delete()
        .eq("duty_date", tarih)
        .eq("il", il);

      if (delErr) throw delErr;

      const rows: DutyPharmacyRow[] = [];
      for (const row of body.data ?? []) {
        const lat = row.konum?.lat;
        const lng = row.konum?.lng;
        const latOk =
          typeof lat === "number" && Number.isFinite(lat) ? lat : null;
        const lngOk =
          typeof lng === "number" && Number.isFinite(lng) ? lng : null;

        rows.push({
          duty_date: tarih,
          il: (row.il ?? il).trim() || il,
          ilce: (row.ilce ?? "").trim(),
          name: (row.ad ?? "").trim(),
          address: (row.adres ?? "").trim(),
          phone: normalizePhone(row.telefon ?? ""),
          lat: latOk,
          lng: lngOk,
          nobetecza_id: typeof row.id === "number" ? row.id : null,
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
      console.log(`[nobetecza-sync] ${il} tamam (${rows.length} satır)`);
    } catch (e) {
      provincesFailed++;
      const msg = formatSyncError(e);
      console.warn(`[nobetecza-sync] ${il} hata:`, msg);
      errors.push({ il, message: msg });
    }

    if (delayMs > 0 && i < total - 1) {
      await sleep(delayMs);
    }
  }

  let staleDutyDatesPurged = false;
  let purgeError: string | null = null;

  if (provincesOk > 0 && DUTY_DATE_RE.test(dutyDateUsed)) {
    const { error: pErr } = await purgeDutyDatesExcept(supabase, dutyDateUsed);
    if (pErr) {
      purgeError = pErr.message;
      console.warn("[nobetecza-sync] Eski duty_date temizliği:", pErr.message);
    } else {
      staleDutyDatesPurged = true;
      console.log(
        `[nobetecza-sync] Eski tarihler silindi; kalan duty_date=${dutyDateUsed}`
      );
    }
  }

  return {
    dutyDateUsed,
    provincesOk,
    provincesFailed,
    rowsInserted,
    errors,
    durationMs: Date.now() - start,
    staleDutyDatesPurged,
    purgeError,
  };
}
