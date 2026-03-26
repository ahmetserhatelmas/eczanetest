import { NextRequest, NextResponse } from "next/server";
import { dutyListDateIstanbul } from "@/lib/duty-date";
import { createAnonClient } from "@/lib/supabase/anon";
import { fetchNobeteczaDuty } from "@/lib/nobetecza";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function supabaseReadConfigured() {
  return Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_ANON_KEY?.trim()
  );
}

async function fetchDistrictsFromSupabase(il: string) {
  const supabase = createAnonClient();
  const dutyDate = dutyListDateIstanbul();

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

async function fetchDistrictsFromNobetecza(il: string) {
  const key = process.env.NOBETECZA_API_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "NOBETECZA_API_KEY tanımlı değil", success: false },
      { status: 500 }
    );
  }

  const body = await fetchNobeteczaDuty(key, il);
  if (!body.success) {
    return NextResponse.json(
      {
        success: false,
        error: body.message || "İlçe listesi alınamadı",
      },
      { status: 502 }
    );
  }

  const seen = new Set<string>();
  const list: { text: string; pharmacy_number: string }[] = [];

  for (const row of body.data ?? []) {
    const t = (row.ilce ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    list.push({ text: t, pharmacy_number: "" });
  }

  list.sort((a, b) => a.text.localeCompare(b.text, "tr"));

  return NextResponse.json(
    {
      success: true,
      result: list,
      source: "nobetecza",
      dutyDate: typeof body.tarih === "string" ? body.tarih : null,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
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
      const supaRes = await fetchDistrictsFromSupabase(il);
      if (
        process.env.NOBETECZA_API_KEY?.trim() &&
        supaRes.ok &&
        supaRes.headers.get("content-type")?.includes("application/json")
      ) {
        const j = (await supaRes.clone().json()) as {
          success?: boolean;
          result?: unknown[];
        };
        if (
          j.success === true &&
          Array.isArray(j.result) &&
          j.result.length === 0
        ) {
          return await fetchDistrictsFromNobetecza(il);
        }
      }
      return supaRes;
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
    return await fetchDistrictsFromNobetecza(il);
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
