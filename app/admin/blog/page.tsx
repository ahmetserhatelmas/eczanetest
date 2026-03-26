"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  published: boolean;
  pin_to_home: boolean;
  created_at: string;
  updated_at: string;
};

export default function AdminBlogPage() {
  const [secret, setSecret] = useState("");
  const [connected, setConnected] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [published, setPublished] = useState(true);
  const [pinToHome, setPinToHome] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch("/api/admin/blog", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = (await r.json()) as { posts?: Post[]; error?: string };
      if (!r.ok) throw new Error(data.error || "Hata");
      setPosts(data.posts ?? []);
      setConnected(true);
      setMsg("Liste güncellendi.");
    } catch (e) {
      setConnected(false);
      setErr(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  }, [secret]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setSlug("");
    setExcerpt("");
    setContent("");
    setPublished(true);
    setPinToHome(false);
  }

  function editPost(p: Post) {
    setEditingId(p.id);
    setTitle(p.title);
    setSlug(p.slug);
    setExcerpt(p.excerpt);
    setContent(p.content);
    setPublished(p.published);
    setPinToHome(p.pin_to_home);
    setMsg(null);
    setErr(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (!title.trim()) {
      setErr("Başlık gerekli.");
      return;
    }
    setLoading(true);
    try {
      const headers = {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      };
      if (editingId) {
        const r = await fetch(`/api/admin/blog/${editingId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            title: title.trim(),
            slug: slug.trim(),
            excerpt,
            content,
            published,
            pin_to_home: pinToHome,
          }),
        });
        const data = (await r.json()) as { error?: string };
        if (!r.ok) throw new Error(data.error || "Güncellenemedi");
        setMsg("Yazı güncellendi.");
      } else {
        const r = await fetch("/api/admin/blog", {
          method: "POST",
          headers,
          body: JSON.stringify({
            title: title.trim(),
            slug: slug.trim() || undefined,
            excerpt,
            content,
            published,
            pin_to_home: pinToHome,
          }),
        });
        const data = (await r.json()) as { error?: string };
        if (!r.ok) throw new Error(data.error || "Eklenemedi");
        setMsg("Yazı eklendi.");
        resetForm();
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!globalThis.confirm("Bu yazı silinsin mi?")) return;
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/blog/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(data.error || "Silinemedi");
      if (editingId === id) resetForm();
      setMsg("Silindi.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-slate-900">Blog yönetimi</h1>
          <Link
            href="/"
            className="text-sm font-medium text-red-600 hover:text-red-700"
          >
            Siteye dön
          </Link>
        </div>

        {!connected ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">
              `.env` içindeki <code className="rounded bg-slate-100 px-1">ADMIN_SECRET</code>{" "}
              değerini girin. Bu sayfa tarayıcıda açıkken şifre bellekte kalır; paylaşmayın.
            </p>
            <input
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="ADMIN_SECRET"
              className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={loading || !secret.trim()}
              onClick={() => void load()}
              className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? "…" : "Bağlan"}
            </button>
            {err ? (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {err}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {msg ? (
              <p className="mb-3 text-sm text-green-700" role="status">
                {msg}
              </p>
            ) : null}
            {err ? (
              <p className="mb-3 text-sm text-red-600" role="alert">
                {err}
              </p>
            ) : null}

            <form
              onSubmit={(e) => void submit(e)}
              className="mb-10 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="text-sm font-semibold text-slate-800">
                {editingId ? "Yazıyı düzenle" : "Yeni yazı"}
              </h2>
              <div className="mt-4 flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                  Başlık
                  <input
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                  Slug (URL) — boş bırakırsanız başlıktan üretilir
                  <input
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="ornek-yazi"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                  Özet (ana sayfa kartı / liste)
                  <textarea
                    value={excerpt}
                    onChange={(e) => setExcerpt(e.target.value)}
                    rows={2}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
                  İçerik
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={10}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    checked={published}
                    onChange={(e) => setPublished(e.target.checked)}
                  />
                  Yayında
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    checked={pinToHome}
                    onChange={(e) => setPinToHome(e.target.checked)}
                  />
                  Ana sayfa kartında öne çıkar (birden fazlaysa en yenisi gösterilir)
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {loading ? "…" : editingId ? "Kaydet" : "Yayınla"}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    Vazgeç
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void load()}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700"
                >
                  Listeyi yenile
                </button>
              </div>
            </form>

            <h2 className="mb-3 text-sm font-semibold text-slate-800">
              Tüm yazılar ({posts.length})
            </h2>
            <ul className="flex flex-col gap-2">
              {posts.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-slate-900">{p.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      /blog/{p.slug}
                      {!p.published ? " · taslak" : ""}
                      {p.pin_to_home ? " · ana sayfa" : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => editPost(p)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                      Düzenle
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(p.id)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700"
                    >
                      Sil
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
