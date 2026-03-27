import Link from "next/link";
import type { Metadata } from "next";
import SiteContact from "@/components/SiteContact";
import { notFound } from "next/navigation";
import { getPublishedPostBySlug } from "@/lib/blog-queries";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(decodeURIComponent(slug));
  if (!post) return { title: "Yazı bulunamadı" };
  return {
    title: `${post.title} | Blog`,
    description: post.excerpt.slice(0, 160) || post.title,
  };
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      timeZone: "Europe/Istanbul",
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();

  return (
    <article className="min-h-dvh bg-gradient-to-b from-slate-50 to-white px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href="/"
            className="font-medium text-slate-600 hover:text-slate-900"
          >
            ← Ana sayfa
          </Link>
          <Link
            href="/blog"
            className="font-medium text-slate-600 hover:text-slate-900"
          >
            Tüm yazılar
          </Link>
        </div>
        <header className="mt-6">
          <p className="text-xs text-slate-500">
            {formatDate(post.created_at)}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
            {post.title}
          </h1>
          {post.excerpt.trim() ? (
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {post.excerpt}
            </p>
          ) : null}
        </header>
        <div className="mt-8 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
          {post.content}
        </div>
        <div className="mt-12 border-t border-slate-200 pt-6">
          <SiteContact />
        </div>
      </div>
    </article>
  );
}
