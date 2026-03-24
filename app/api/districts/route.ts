import { NextRequest, NextResponse } from "next/server";
import { dutyDateIstanbul } from "@/lib/duty-date";
import { createAnonClient } from "@/lib/supabase/anon";

const UPSTREAM = "https://api.collectapi.com/health/districtList";

function supabaseReadConfigured() {
  return Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_ANON_KEY?.trim()
  );
}

async function fetchDistrictsFromSupabase(il: string) {
  const supabase = createAnonClient();
  const dutyDate = dutyDateIstanbul();

  const { data, error } = await supabase
    .from("duty_pharmacies")
    .select("ilce")
    .eq("duty_date", dutyDate)
    .eq("il", il);

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 502 }
    );
  }

  const seen = new Set<string>();
  const list: { text: string; pharmacy_number: string }[] = [];

  for (const row of data ?? []) {
    const t = (row.ilce ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    list.push({ text: t, pharmacy_number: "" });
  }

  list.sort((a, b) => a.text.localeCompare(b.text, "tr"));

  return NextResponse.json(
    { success: true, result: list, source: "supabase", dutyDate },
    {
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400",
      },
    }
  );
}

async function fetchDistrictsFromCollect(il: string) {
  const key = process.env.COLLECT_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "COLLECT_API_KEY tanımlı değil" },
      { status: 500 }
    );
  }

  const url = new URL(UPSTREAM);
  url.searchParams.set("il", il);

  const upstream = await fetch(url.toString(), {
    headers: {
      authorization: `apikey ${key}`,
      "content-type": "application/json",
    },
    next: { revalidate: 86400 },
  });

  const body = (await upstream.json()) as {
    success?: boolean;
    result?: unknown;
    message?: string;
  };

  if (!upstream.ok || body.success === false) {
    return NextResponse.json(
      {
        error: body.message || "İlçe listesi alınamadı",
        success: false,
      },
      { status: upstream.ok ? 502 : upstream.status }
    );
  }

  return NextResponse.json(
    { success: true, result: body.result ?? [], source: "collectapi" },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}

export async function GET(req: NextRequest) {
  const il = req.nextUrl.searchParams.get("il")?.trim();
  if (!il) {
    return NextResponse.json({ error: "il gerekli" }, { status: 400 });
  }

  if (supabaseReadConfigured()) {
    try {
      return await fetchDistrictsFromSupabase(il);
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

  return fetchDistrictsFromCollect(il);
}
