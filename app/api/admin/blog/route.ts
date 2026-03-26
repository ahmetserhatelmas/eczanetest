import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugifyTitle } from "@/lib/slugify";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const v = verifyAdmin(req);
  if (!v.ok) return v.response;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("blog_posts")
      .select(
        "id, slug, title, excerpt, content, published, pin_to_home, created_at, updated_at"
      )
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ posts: data ?? [] });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Supabase hatası",
      },
      { status: 500 }
    );
  }
}

type CreateBody = {
  title?: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  published?: boolean;
  pin_to_home?: boolean;
};

export async function POST(req: NextRequest) {
  const v = verifyAdmin(req);
  if (!v.ok) return v.response;

  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Başlık gerekli" }, { status: 400 });
  }

  const rawSlug = (body.slug ?? "").trim();
  let slug = rawSlug ? slugifyTitle(rawSlug) : slugifyTitle(title);
  if (!slug) slug = "yazi";

  const excerpt = (body.excerpt ?? "").trim();
  const content = (body.content ?? "").trim();
  const published = body.published !== false;
  const pin_to_home = body.pin_to_home === true;

  try {
    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("blog_posts")
      .insert({
        slug,
        title,
        excerpt,
        content,
        published,
        pin_to_home,
        updated_at: now,
      })
      .select(
        "id, slug, title, excerpt, content, published, pin_to_home, created_at, updated_at"
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Bu slug zaten kullanılıyor; başka bir slug deneyin." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ post: data });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Kayıt hatası",
      },
      { status: 500 }
    );
  }
}
