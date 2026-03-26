import { createAnonClient } from "@/lib/supabase/anon";
import type { BlogListItem, BlogTeaser } from "@/lib/blog-types";

export type { BlogListItem, BlogTeaser } from "@/lib/blog-types";

export type BlogPostRow = BlogTeaser & {
  content: string;
  published: boolean;
  pin_to_home: boolean;
  created_at: string;
  updated_at: string;
};

function safeAnon() {
  try {
    return createAnonClient();
  } catch {
    return null;
  }
}

/** Ana ekran kartı: pin_to_home öncelik, sonra en yeni yayın. */
export async function getHomeBlogTeaser(): Promise<BlogTeaser | null> {
  const supabase = safeAnon();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug, title, excerpt")
    .eq("published", true)
    .order("pin_to_home", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    slug: data.slug,
    title: data.title,
    excerpt: data.excerpt ?? "",
  };
}

export async function getPublishedBlogPosts(): Promise<BlogListItem[]> {
  const supabase = safeAnon();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug, title, excerpt, created_at")
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map((r) => ({
    slug: r.slug,
    title: r.title,
    excerpt: r.excerpt ?? "",
    created_at: r.created_at,
  }));
}

export async function getPublishedPostBySlug(
  slug: string
): Promise<BlogPostRow | null> {
  const supabase = safeAnon();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("blog_posts")
    .select(
      "slug, title, excerpt, content, published, pin_to_home, created_at, updated_at"
    )
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (error || !data) return null;
  return data as BlogPostRow;
}
