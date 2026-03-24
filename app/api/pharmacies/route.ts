import { NextRequest, NextResponse } from "next/server";
import { dutyDateIstanbul } from "@/lib/duty-date";
import { createAnonClient } from "@/lib/supabase/anon";

const UPSTREAM = "https://api.collectapi.com/health/dutyPharmacy";

function supabaseReadConfigured() {
  return Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_ANON_KEY?.trim()
  );
}

async function fetchFromSupabase(il: string, ilce: string) {
  const supabase = createAnonClient();
  const dutyDate = dutyDateIstanbul();

  let q = supabase
    .from("duty_pharmacies")
    .select("name, ilce, address, phone, lat, lng")
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

  const result = (data ?? []).map((row) => ({
    name: row.name,
    dist: row.ilce ?? "",
    address: row.address ?? "",
    phone: row.phone ?? "",
    loc: `${row.lat},${row.lng}`,
  }));

  return NextResponse.json(
    { success: true, result, source: "supabase", dutyDate },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    }
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

  const url = new URL(UPSTREAM);
  url.searchParams.set("il", il);
  if (ilce) url.searchParams.set("ilce", ilce);

  const upstream = await fetch(url.toString(), {
    headers: {
      authorization: `apikey ${key}`,
      "content-type": "application/json",
    },
    next: { revalidate: 3600 },
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
    { success: true, result: body.result ?? [], source: "collectapi" },
    {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    }
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
