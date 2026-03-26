import { NextRequest, NextResponse } from "next/server";

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function verifyAdmin(req: NextRequest):
  | { ok: true }
  | { ok: false; response: NextResponse } {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "ADMIN_SECRET tanımlı değil" },
        { status: 500 }
      ),
    };
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return { ok: false, response: unauthorized() };
  }
  return { ok: true };
}
