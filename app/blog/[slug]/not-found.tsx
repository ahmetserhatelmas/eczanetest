import Link from "next/link";

export default function BlogPostNotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-slate-50 px-4">
      <p className="text-slate-700">Yazı bulunamadı.</p>
      <Link href="/blog" className="text-sm font-medium text-red-600 hover:text-red-700">
        Blog listesine dön
      </Link>
    </div>
  );
}
