import { NextRequest, NextResponse } from "next/server";
import { dutyListDateIstanbul } from "@/lib/duty-date";
import { createAnonClient } from "@/lib/supabase/anon";
import {
  fetchNobeteczaDuty,
  nobeteczaItemToDutyPharmacy,
} from "@/lib/nobetecza";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noCacheHeaders = {
  "Cache-Control": "private, no-store",
} as const;

function supabaseReadConfigured() {
  return Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_ANON_KEY?.trim()
  );
}

async function fetchFromSupabase(il: string, ilce: string) {
  const supabase = createAnonClient();
  const dutyDate = dutyListDateIstanbul();

  let q = supabase
    .from("duty_pharmacies")
    .select("name, ilce, address, phone, lat, lng, synced_at")
    .eq("duty_date", dutyDate)
    .eq("il", il);

  if (ilce) {
    q = q.eq("ilce", ilce);
  }

  const { data, error } = await q;

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 502 }
    );
  }

  const rows = data ?? [];
  let lastSyncedAt: string | null = null;
  for (const row of rows) {
    const t = row.synced_at;
    if (typeof t !== "string") continue;
    if (!lastSyncedAt || t > lastSyncedAt) lastSyncedAt = t;
  }

  const result = rows.map((row) => {
    const lat = row.lat;
    const lng = row.lng;
    const loc =
      typeof lat === "number" &&
      typeof lng === "number" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
        ? `${lat},${lng}`
        : "";
    return {
      name: row.name,
      dist: row.ilce ?? "",
      address: row.address ?? "",
      phone: row.phone ?? "",
      loc,
    };
  });

  return NextResponse.json(
    {
      success: true,
      result,
      source: "supabase",
      dutyDate,
      lastSyncedAt,
    },
    { headers: noCacheHeaders }
  );
}

async function fetchFromNobeteczaDirect(il: string, ilce: string) {
  const key = process.env.NOBETECZA_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "NOBETECZA_API_KEY tanımlı değil", success: false },
      { status: 500 }
    );
  }

  const body = await fetchNobeteczaDuty(key, il, ilce || undefined);
  if (!body.success) {
    return NextResponse.json(
      {
        success: false,
        error: body.message || "Eczane verisi alınamadı",
      },
      { status: 502 }
    );
  }

  const result = (body.data ?? []).map(nobeteczaItemToDutyPharmacy);

  return NextResponse.json(
    {
      success: true,
      result,
      source: "nobetecza",
      dutyDate: typeof body.tarih === "string" ? body.tarih : null,
      lastSyncedAt: null,
    },
    { headers: noCacheHeaders }
  );
}

export async function GET(req: NextRequest) {
  const il = req.nextUrl.searchParams.get("il")?.trim();
  if (!il) {
    return NextResponse.json({ error: "il gerekli" }, { status: 400 });
  }

  const ilce = req.nextUrl.searchParams.get("ilce")?.trim() ?? "";

  if (supabaseReadConfigured()) {
    try {
      return await fetchFromSupabase(il, ilce);
    } catch (e) {
      return NextResponse.json(
        {
          success: false,
          error: e instanceof Error ? e.message : "Supabase okunamadı",
        },
        { status: 500 }
      );
    }
  }

  try {
    return await fetchFromNobeteczaDirect(il, ilce);
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: e instanceof Error ? e.message : "İstek başarısız",
      },
      { status: 500 }
    );
  }
}
