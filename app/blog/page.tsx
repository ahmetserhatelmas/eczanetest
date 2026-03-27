import Link from "next/link";
import SiteContact from "@/components/SiteContact";
import SiteDisclaimer from "@/components/SiteDisclaimer";
import { getPublishedBlogPosts } from "@/lib/blog-queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Blog | Nöbetçi Eczane",
  description: "Sağlık ve nöbetçi eczane ile ilgili yazılar",
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("tr-TR", {
      timeZone: "Europe/Istanbul",
      dateStyle: "medium",
    });
  } catch {
    return iso;
  }
}

export default async function BlogIndexPage() {
  const posts = await getPublishedBlogPosts();

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-50 to-white px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <Link
          href="/"
          className="mb-6 inline-block text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Ana sayfa
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Blog
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Yazı listesi
        </p>
        <ul className="mt-8 flex flex-col gap-3">
          {posts.length === 0 ? (
            <li className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
              Henüz yayınlanmış yazı yok.
            </li>
          ) : (
            posts.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/blog/${encodeURIComponent(p.slug)}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-red-200 hover:shadow-md"
                >
                  <span className="text-xs text-slate-500">
                    {formatDate(p.created_at)}
                  </span>
                  <span className="mt-1 block text-lg font-semibold text-slate-900">
                    {p.title}
                  </span>
                  {p.excerpt.trim() ? (
                    <span className="mt-2 line-clamp-2 block text-sm text-slate-600">
                      {p.excerpt}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))
          )}
        </ul>
        <div className="mt-10 space-y-4 border-t border-slate-200 pt-6">
          <SiteDisclaimer />
          <SiteContact />
        </div>
      </div>
    </div>
  );
}
