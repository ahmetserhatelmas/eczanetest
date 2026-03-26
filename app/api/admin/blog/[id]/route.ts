import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { slugifyTitle } from "@/lib/slugify";

export const dynamic = "force-dynamic";

type PatchBody = {
  title?: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  published?: boolean;
  pin_to_home?: boolean;
};

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const v = verifyAdmin(req);
  if (!v.ok) return v.response;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.title !== undefined) {
    const t = body.title.trim();
    if (!t) {
      return NextResponse.json({ error: "Başlık boş olamaz" }, { status: 400 });
    }
    patch.title = t;
  }
  if (body.excerpt !== undefined) patch.excerpt = body.excerpt.trim();
  if (body.content !== undefined) patch.content = body.content.trim();
  if (body.published !== undefined) patch.published = body.published;
  if (body.pin_to_home !== undefined) patch.pin_to_home = body.pin_to_home;

  if (body.slug !== undefined) {
    const s = body.slug.trim();
    patch.slug = s ? slugifyTitle(s) : "yazi";
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("blog_posts")
      .update(patch)
      .eq("id", id)
      .select(
        "id, slug, title, excerpt, content, published, pin_to_home, created_at, updated_at"
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Bu slug zaten kullanılıyor." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Yazı bulunamadı" }, { status: 404 });
    }
    return NextResponse.json({ post: data });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Güncelleme hatası",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const v = verifyAdmin(req);
  if (!v.ok) return v.response;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id gerekli" }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("blog_posts").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Silme hatası",
      },
      { status: 500 }
    );
  }
}
