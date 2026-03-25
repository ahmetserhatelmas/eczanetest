import { NextRequest, NextResponse } from "next/server";
import { dutyListDateIstanbul } from "@/lib/duty-date";
import { createAnonClient } from "@/lib/supabase/anon";

/** Gün değişince edge önbellekte dünün listesi kalmasın. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const UPSTREAM = "https://api.collectapi.com/health/dutyPharmacy";

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

  const result = rows.map((row) => ({
    name: row.name,
    dist: row.ilce ?? "",
    address: row.address ?? "",
    phone: row.phone ?? "",
    loc: `${row.lat},${row.lng}`,
  }));

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

async function fetchFromCollectApi(il: string, ilce: string) {
  const key = process.env.COLLECT_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "COLLECT_API_KEY tanımlı değil" },
      { status: 500 }
    );
  }

  const dutyDate = dutyListDateIstanbul();
  const url = new URL(UPSTREAM);
  url.searchParams.set("il", il);
  if (ilce) url.searchParams.set("ilce", ilce);
  /* CollectAPI: farklı `date` değerleri birebir aynı JSON — gün seçilmiyor, tek snapshot. */
  url.searchParams.set("date", dutyDate);

  const upstream = await fetch(url.toString(), {
    headers: {
      authorization: `apikey ${key}`,
      "content-type": "application/json",
    },
    cache: "no-store",
  });

  const body = (await upstream.json()) as {
    success?: boolean;
    result?: unknown;
    message?: string;
  };

  if (!upstream.ok || body.success === false) {
    return NextResponse.json(
      {
        error: body.message || "Eczane verisi alınamadı",
        success: false,
      },
      { status: upstream.ok ? 502 : upstream.status }
    );
  }

  return NextResponse.json(
    {
      success: true,
      result: body.result ?? [],
      source: "collectapi",
      dutyDate,
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

  return fetchFromCollectApi(il, ilce);
}
