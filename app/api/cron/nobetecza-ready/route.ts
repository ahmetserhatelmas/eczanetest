import { NextRequest, NextResponse } from "next/server";
import { dutyListDateIstanbul } from "@/lib/duty-date";
import { probeNobeteczaListReady } from "@/lib/nobetecza";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Tek API isteği: nobetecza’da beklenen liste günü hazır mı?
 * (Tüm illerin güncellenme saati API’de yok; referans il + tarih/onceki_gun.)
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET tanımlı değil" },
      { status: 500 }
    );
  }

  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return unauthorized();
  }

  const apiKey = process.env.NOBETECZA_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "NOBETECZA_API_KEY tanımlı değil" },
      { status: 500 }
    );
  }

  const probeIl =
    req.nextUrl.searchParams.get("il")?.trim() ||
    process.env.NOBETECZA_PROBE_IL?.trim() ||
    "İstanbul";

  const listDateExpected = dutyListDateIstanbul();
  const probe = await probeNobeteczaListReady(apiKey, probeIl, listDateExpected);

  return NextResponse.json({
    probeIl,
    ...probe,
    hint:
      "readyForFullSync=true ise tam senkron mantıklı. Saat bilgisi API’de yok; cron’u günde birkaç kez (ör. saatlik 08–14) çalıştırıp skipped=true dönene kadar bekleyebilir veya tek saat seçip NOBETECZA_PROBE_BEFORE_SYNC=false yapabilirsiniz.",
  });
}
