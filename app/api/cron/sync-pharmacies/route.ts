import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncDutyPharmacies } from "@/lib/sync-duty-pharmacies";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
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

  const collectKey = process.env.COLLECT_API_KEY;
  if (!collectKey) {
    return NextResponse.json(
      { error: "COLLECT_API_KEY tanımlı değil" },
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
          e instanceof Error ? e.message : "Supabase admin istemcisi oluşturulamadı",
      },
      { status: 500 }
    );
  }

  const summary = await syncDutyPharmacies({
    collectApiKey: collectKey,
    supabase,
  });

  return NextResponse.json({
    success: summary.provincesFailed === 0,
    ...summary,
  });
}

/** Vercel Cron GET gönderir; manuel tetikleme için POST da kabul edilir. */
export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
