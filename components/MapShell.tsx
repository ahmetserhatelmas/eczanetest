"use client";

import dynamic from "next/dynamic";
import { useJsApiLoader } from "@react-google-maps/api";
import type { BlogTeaser } from "@/lib/blog-types";

const PharmacyMap = dynamic(() => import("@/components/PharmacyMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-slate-50 text-slate-600">
      Harita yükleniyor…
    </div>
  ),
});

/**
 * useJsApiLoader tek yerde: PharmacyMap dynamic/HMR ile yeniden yüklenince
 * farklı bundle’dan ikinci bir anahtarla çağrılıp "Loader must not be called again
 * with different options" hatası oluşmasın diye.
 */
export default function MapShell({
  homeBlogTeaser = null,
}: {
  homeBlogTeaser?: BlogTeaser | null;
} = {}) {
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded, loadError } = useJsApiLoader({
    id: "eczane-google-map",
    googleMapsApiKey,
  });

  if (!googleMapsApiKey.trim()) {
    return (
      <div className="flex h-dvh items-center justify-center bg-white px-4 text-center text-red-700">
        NEXT_PUBLIC_GOOGLE_MAPS_API_KEY eksik. `.env.local` dosyasını kontrol edin.
      </div>
    );
  }

  return (
    <PharmacyMap
      homeBlogTeaser={homeBlogTeaser}
      mapsLoaded={isLoaded}
      mapsLoadError={loadError}
      googleMapsApiKey={googleMapsApiKey}
    />
  );
}
