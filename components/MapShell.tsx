"use client";

import dynamic from "next/dynamic";
import type { BlogTeaser } from "@/lib/blog-types";

const PharmacyMap = dynamic(() => import("@/components/PharmacyMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-slate-50 text-slate-600">
      Harita yükleniyor…
    </div>
  ),
});

export default function MapShell({
  homeBlogTeaser = null,
}: {
  homeBlogTeaser?: BlogTeaser | null;
} = {}) {
  return <PharmacyMap homeBlogTeaser={homeBlogTeaser} />;
}
