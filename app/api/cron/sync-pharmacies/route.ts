import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncDutyPharmaciesFromNobetecza } from "@/lib/sync-duty-nobetecza";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET tanımlı değil" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return unauthorized();
  }

  const apiKey = process.env.NOBETECZA_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "NOBETECZA_API_KEY tanımlı değil" },
      { status: 500 }
    );
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Supabase admin oluşturulamadı",
      },
      { status: 500 }
    );
  }

  const summary = await syncDutyPharmaciesFromNobetecza({
    apiKey,
    supabase,
  });

  return NextResponse.json({
    success: summary.provincesFailed === 0,
    source: "nobetecza→supabase",
    ...summary,
  });
}
