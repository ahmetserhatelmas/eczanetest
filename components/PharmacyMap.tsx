"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Circle, GoogleMap, InfoWindow, Marker } from "@react-google-maps/api";
import {
  boundsCornersForRadiusKm,
  distanceKm,
  dutyPharmacyListSuspiciousSpread,
  NEARBY_MAP_CIRCLE_RADIUS_M,
  NEARBY_MAP_FOCUS_RADIUS_KM,
  NEARBY_RADIUS_KM,
} from "@/lib/geo";
import { dutyListDateIstanbul } from "@/lib/duty-date";
import { matchTurkishProvince } from "@/lib/match-turkish-province";
import { parseLoc, type DutyPharmacy } from "@/lib/pharmacy";
import { TURKISH_PROVINCES } from "@/lib/provinces";
import type { BlogTeaser } from "@/lib/blog-types";

const ANKARA_CENTER = { lat: 39.9334, lng: 32.8597 };
const mapContainerStyle = { width: "100%", height: "100%" };

const defaultMapOptions: google.maps.MapOptions = {
  fullscreenControl: false,
  streetViewControl: false,
  mapTypeControl: false,
  gestureHandling: "greedy",
};

type DistrictRow = { text: string; pharmacy_number?: string };

type Flow = "choose" | "manualForm" | "nearby" | "manual";

function fitNearbyMapToUser(
  map: google.maps.Map,
  userPos: google.maps.LatLngLiteral
) {
  const { southWest, northEast } = boundsCornersForRadiusKm(
    userPos,
    NEARBY_MAP_FOCUS_RADIUS_KM
  );
  map.fitBounds(new google.maps.LatLngBounds(southWest, northEast), 56);
}

function distKey(p: DutyPharmacy) {
  return `${p.name}|${p.loc}`;
}

/** Tarayıcı / proxy önbelleğini kırmak için İstanbul nöbet günü query’de (API yalnızca il/ilçe okur). */
function pharmaciesRequestUrl(il: string, ilce: string) {
  const params = new URLSearchParams({ il });
  if (ilce) params.set("ilce", ilce);
  params.set("dutyDay", dutyListDateIstanbul());
  return `/api/pharmacies?${params}`;
}

type PharmaciesApiJson = {
  result?: DutyPharmacy[];
  dutyDate?: string;
  source?: string;
  lastSyncedAt?: string | null;
  /** Doğrudan nobetecza yanıtından; `oncekiGun === true` ise liste önceki güne ait olabilir. */
  nobetecza?: { tarih?: string | null; oncekiGun?: boolean | null };
  error?: string;
};

function formatIstanbulTs(iso: string) {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      timeZone: "Europe/Istanbul",
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function PharmacyMap({
  homeBlogTeaser = null,
  mapsLoaded,
  mapsLoadError,
  googleMapsApiKey,
}: {
  homeBlogTeaser?: BlogTeaser | null;
  mapsLoaded: boolean;
  mapsLoadError: Error | undefined;
  googleMapsApiKey: string;
}) {
  const isLoaded = mapsLoaded;
  const loadError = mapsLoadError;

  const [flow, setFlow] = useState<Flow>("choose");
  const [il, setIl] = useState("Ankara");
  const [ilce, setIlce] = useState("");
  const [districts, setDistricts] = useState<DistrictRow[]>([]);
  const [pharmacies, setPharmacies] = useState<DutyPharmacy[]>([]);
  const [pharmacyDistKm, setPharmacyDistKm] = useState<Record<string, number>>(
    {}
  );
  const [nearbyExpandedToFullIl, setNearbyExpandedToFullIl] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nearbyBusy, setNearbyBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [userAccuracyM, setUserAccuracyM] = useState<number | null>(null);
  const [geoStatus, setGeoStatus] = useState<
    "pending" | "ok" | "denied" | "unavailable"
  >("pending");
  const [locating, setLocating] = useState(false);
  const [selected, setSelected] = useState<DutyPharmacy | null>(null);
  const [detectedIl, setDetectedIl] = useState<string | null>(null);
  /** İl/ilçe formu (haritaya geçmeden önce) */
  const [formIl, setFormIl] = useState("");
  const [formIlce, setFormIlce] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [listDutyDate, setListDutyDate] = useState<string | null>(null);
  const [listSource, setListSource] = useState<string | null>(null);
  const [listLastSynced, setListLastSynced] = useState<string | null>(null);
  /** nobetecza `onceki_gun`; true ise kaynak önceki güne ait liste diyebilir. */
  const [listNobeteczaOncekiGun, setListNobeteczaOncekiGun] = useState<
    boolean | null
  >(null);

  const center = useMemo(() => userPos ?? ANKARA_CENTER, [userPos]);

  /** Haritada pin çıkarılabilen kayıt (geçerli `loc`); liste sayısı bundan fazla olabilir. */
  const mappablePharmacyCount = useMemo(
    () => pharmacies.reduce((n, p) => n + (parseLoc(p.loc) ? 1 : 0), 0),
    [pharmacies]
  );

  /** Bazı sağlayıcı hatalarında pinler tek il yerine çok geniş alana yayılır. */
  const suspiciousProvinceSpread = useMemo(() => {
    if (flow !== "manual" || loading || pharmacies.length === 0) return false;
    return dutyPharmacyListSuspiciousSpread(pharmacies).suspicious;
  }, [flow, loading, pharmacies]);

  const resetToChoose = useCallback(() => {
    setFlow("choose");
    setPharmacies([]);
    setPharmacyDistKm({});
    setNearbyExpandedToFullIl(false);
    setSelected(null);
    setError(null);
    setDetectedIl(null);
    setUserPos(null);
    setUserAccuracyM(null);
    setGeoStatus("pending");
    setNearbyBusy(false);
    setLoading(false);
    setIl("Ankara");
    setIlce("");
    setFormIl("");
    setFormIlce("");
    setFormError(null);
    setDistricts([]);
    setListDutyDate(null);
    setListSource(null);
    setListLastSynced(null);
    setListNobeteczaOncekiGun(null);
  }, []);

  const goToManualForm = useCallback(() => {
    setFlow("manualForm");
    setError(null);
    setFormError(null);
    setFormIl("");
    setFormIlce("");
    setPharmacies([]);
    setPharmacyDistKm({});
    setNearbyExpandedToFullIl(false);
    setSelected(null);
    setDetectedIl(null);
    setUserPos(null);
    setUserAccuracyM(null);
    setGeoStatus("pending");
    setNearbyBusy(false);
    setDistricts([]);
    setListDutyDate(null);
    setListSource(null);
    setListLastSynced(null);
    setListNobeteczaOncekiGun(null);
  }, []);

  const backFromManualForm = useCallback(() => {
    setFlow("choose");
    setFormIl("");
    setFormIlce("");
    setFormError(null);
    setDistricts([]);
  }, []);

  const submitManualForm = useCallback(() => {
    if (!formIl.trim()) {
      setFormError("Lütfen il seçin.");
      return;
    }
    setFormError(null);
    setIl(formIl.trim());
    setIlce(formIlce.trim());
    setFlow("manual");
  }, [formIl, formIlce]);

  /**
   * Mobil Safari/Chrome: konum izni genelde yalnızca kullanıcı tıklamasıyla başlayan
   * getCurrentPosition çağrısında sorulur. Bu yüzden istek choose ekranındaki tıklamada
   * veya “Tekrar dene” butonunda başlatılmalı; useEffect içinde çağırmak izni susturabilir.
   */
  const goToNearby = useCallback(() => {
    setFlow("nearby");
    setError(null);
    setPharmacies([]);
    setPharmacyDistKm({});
    setNearbyExpandedToFullIl(false);
    setSelected(null);
    setDetectedIl(null);
    setUserPos(null);
    setUserAccuracyM(null);
    setGeoStatus("pending");
    setListDutyDate(null);
    setListSource(null);
    setListLastSynced(null);
    setListNobeteczaOncekiGun(null);
    setNearbyBusy(true);

    if (!navigator.geolocation) {
      setGeoStatus("unavailable");
      setError("Tarayıcı konum desteklemiyor.");
      setNearbyBusy(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserPos(next);
        const acc = pos.coords.accuracy;
        setUserAccuracyM(
          typeof acc === "number" && Number.isFinite(acc) ? acc : null
        );
        setGeoStatus("ok");
      },
      () => {
        setGeoStatus("denied");
        setUserAccuracyM(null);
        setNearbyBusy(false);
        setError(
          "Konum izni olmadan yakın eczaneler gösterilemez. «Konumu tekrar iste»ye basın veya tarayıcı / site ayarlarından konuma izin verin."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    );
  }, []);

  const readLocation = useCallback(
    (opts?: { fresh?: boolean; focusMap?: boolean }) => {
      if (!navigator.geolocation) {
        setGeoStatus("unavailable");
        return;
      }
      setError(null);
      setGeoStatus("pending");
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          setUserPos(next);
          const acc = pos.coords.accuracy;
          setUserAccuracyM(
            typeof acc === "number" && Number.isFinite(acc) ? acc : null
          );
          setGeoStatus("ok");
          setLocating(false);
          if (opts?.focusMap) {
            const m = mapRef.current;
            if (m) fitNearbyMapToUser(m, next);
          }
        },
        () => {
          setGeoStatus("denied");
          setUserAccuracyM(null);
          setLocating(false);
          setError(
            "Konum alınamadı. İzin verdiyseniz «Konumu tekrar iste»ye basın."
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: opts?.fresh ? 0 : 120_000,
        }
      );
    },
    []
  );

  const goToMyLocation = useCallback(() => {
    if (userPos) {
      const m = mapRef.current;
      if (m) {
        if (flow === "nearby") {
          fitNearbyMapToUser(m, userPos);
        } else {
          m.panTo(userPos);
          const z = m.getZoom();
          if (z == null || z < 14) m.setZoom(15);
        }
      }
      return;
    }
    readLocation({ fresh: true, focusMap: true });
  }, [userPos, readLocation, flow]);

  const loadDistricts = useCallback(async (city: string) => {
    try {
      const r = await fetch(`/api/districts?il=${encodeURIComponent(city)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "İlçeler yüklenemedi");
      setDistricts((data.result as DistrictRow[]) || []);
    } catch {
      setDistricts([]);
    }
  }, []);

  const loadPharmacies = useCallback(async (city: string, district: string) => {
    setLoading(true);
    setError(null);
    setSelected(null);
    setPharmacyDistKm({});
    setNearbyExpandedToFullIl(false);
    try {
      const r = await fetch(pharmaciesRequestUrl(city, district), {
        cache: "no-store",
      });
      const data = (await r.json()) as PharmaciesApiJson;
      if (!r.ok) throw new Error(data.error || "Liste alınamadı");
      setPharmacies(data.result ?? []);
      setListDutyDate(
        typeof data.dutyDate === "string" ? data.dutyDate : null
      );
      setListSource(typeof data.source === "string" ? data.source : null);
      setListLastSynced(
        typeof data.lastSyncedAt === "string" ? data.lastSyncedAt : null
      );
      const og = data.nobetecza?.oncekiGun;
      setListNobeteczaOncekiGun(typeof og === "boolean" ? og : null);
    } catch (e) {
      setPharmacies([]);
      setListDutyDate(null);
      setListSource(null);
      setListLastSynced(null);
      setListNobeteczaOncekiGun(null);
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (flow !== "manualForm" || !formIl.trim()) return;
    void loadDistricts(formIl.trim());
  }, [flow, formIl, loadDistricts]);

  useEffect(() => {
    if (flow !== "manual") return;
    void loadDistricts(il);
  }, [il, flow, loadDistricts]);

  useEffect(() => {
    if (flow !== "manual") return;
    void loadPharmacies(il, ilce);
  }, [il, ilce, flow, loadPharmacies]);

  /** Konum tıklamada alındı; harita yüklendikten sonra adres + liste. */
  useEffect(() => {
    if (flow !== "nearby" || !isLoaded || !userPos) return;
    const u = userPos;

    let cancelled = false;

    async function runNearbyFromPosition() {
      setNearbyBusy(true);
      setError(null);
      setPharmacies([]);
      setPharmacyDistKm({});
      setNearbyExpandedToFullIl(false);
      setSelected(null);
      setDetectedIl(null);
      setListDutyDate(null);
      setListSource(null);
      setListLastSynced(null);
      setListNobeteczaOncekiGun(null);

      const geocoder = new google.maps.Geocoder();
      const geo = await new Promise<{
        results: google.maps.GeocoderResult[] | null;
        status: google.maps.GeocoderStatus;
      }>((resolve) => {
        geocoder.geocode({ location: u }, (results, status) => {
          resolve({ results: results ?? null, status });
        });
      });

      if (cancelled) return;

      if (
        geo.status !== "OK" ||
        !geo.results?.[0]?.address_components
      ) {
        setError("Adres çözümlenemedi. İl/ilçe ile aramayı deneyin.");
        setNearbyBusy(false);
        return;
      }

      const matched = matchTurkishProvince(
        geo.results[0].address_components,
        TURKISH_PROVINCES
      );

      if (!matched) {
        setError(
          "Bulunduğunuz bölge il listesiyle eşleşmedi. İl/ilçe seçerek arayın."
        );
        setNearbyBusy(false);
        return;
      }

      setDetectedIl(matched);
      setIl(matched);

      try {
        const r = await fetch(pharmaciesRequestUrl(matched, ""), {
          cache: "no-store",
        });
        const data = (await r.json()) as PharmaciesApiJson;
        if (!r.ok) throw new Error(data.error || "Liste alınamadı");
        const all = data.result ?? [];
        if (!cancelled) {
          setListDutyDate(
            typeof data.dutyDate === "string" ? data.dutyDate : null
          );
          setListSource(typeof data.source === "string" ? data.source : null);
          setListLastSynced(
            typeof data.lastSyncedAt === "string" ? data.lastSyncedAt : null
          );
          const og = data.nobetecza?.oncekiGun;
          setListNobeteczaOncekiGun(typeof og === "boolean" ? og : null);
        }

        if (cancelled) return;

        const scored: { p: DutyPharmacy; km: number }[] = [];
        for (const p of all) {
          const loc = parseLoc(p.loc);
          if (!loc) continue;
          scored.push({ p, km: distanceKm(u, loc) });
        }
        scored.sort((a, b) => a.km - b.km);

        const inside = scored
          .filter((s) => s.km <= NEARBY_RADIUS_KM)
          .map((s) => s.p);

        let expanded = false;
        let show = inside;
        if (inside.length === 0 && scored.length > 0) {
          show = scored.map((s) => s.p);
          expanded = true;
        }

        const distMap: Record<string, number> = {};
        for (const s of scored) {
          distMap[distKey(s.p)] = s.km;
        }

        setPharmacies(show);
        setPharmacyDistKm(distMap);
        setNearbyExpandedToFullIl(expanded);
      } catch (e) {
        if (!cancelled) {
          setListDutyDate(null);
          setListSource(null);
          setListLastSynced(null);
          setListNobeteczaOncekiGun(null);
          setError(e instanceof Error ? e.message : "Hata");
        }
      } finally {
        if (!cancelled) setNearbyBusy(false);
      }
    }

    void runNearbyFromPosition();

    return () => {
      cancelled = true;
    };
  }, [flow, isLoaded, userPos]);

  /* Harita kamerası: layout aşamasında uygula; paint sonrası useEffect ile pinlere fit yarışıyordu. */
  useLayoutEffect(() => {
    if (!map || !isLoaded) return;
    if (flow === "choose" || flow === "manualForm") return;

    /*
     * Yakın modda userPos yokken aşağıdaki "tüm pinlere fit" dalına düşmek
     * (liste yüklenmişken) tüm ili Marmara ölçeğinde gösteriyordu — kesinlikle yapma.
     */
    if (flow === "nearby") {
      if (!userPos) {
        map.panTo(ANKARA_CENTER);
        map.setZoom(11);
        return;
      }
      /* ~3 km kutu: tek binaya yapışmaz, yakındaki pinler görünür */
      const focusUser = () => {
        fitNearbyMapToUser(map, userPos);
      };
      focusUser();
      const idleListener = google.maps.event.addListenerOnce(map, "idle", focusUser);
      return () => {
        google.maps.event.removeListener(idleListener);
      };
    }

    const bounds = new google.maps.LatLngBounds();
    let has = false;
    for (const p of pharmacies) {
      const ll = parseLoc(p.loc);
      if (ll) {
        bounds.extend(ll);
        has = true;
      }
    }
    if (userPos) {
      bounds.extend(userPos);
      has = true;
    }

    if (has) {
      map.fitBounds(bounds, 48);
      const listener = google.maps.event.addListenerOnce(
        map,
        "bounds_changed",
        () => {
          const z = map.getZoom();
          if (z != null && z > 15) map.setZoom(15);
        }
      );
      return () => {
        google.maps.event.removeListener(listener);
      };
    }

    map.panTo(center);
    map.setZoom(12);
  }, [map, isLoaded, pharmacies, userPos, center, flow]);

  const selectedPos = selected ? parseLoc(selected.loc) : null;
  const selectedKm =
    selected != null ? pharmacyDistKm[distKey(selected)] : undefined;

  if (loadError) {
    return (
      <div className="flex h-dvh items-center justify-center bg-white px-4 text-center text-red-700">
        Harita yüklenemedi. Google Cloud’da Maps JavaScript API ve Geocoding API
        ile anahtar kısıtlamalarını kontrol edin.
      </div>
    );
  }

  if (flow === "choose") {
    return (
      <div className="flex min-h-dvh flex-col bg-gradient-to-b from-slate-50 to-white px-4 py-8">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4">
          <div className="text-center">
            <Link
              href="/blog"
              className="text-lg font-semibold tracking-tight text-slate-900 transition hover:text-red-700"
            >
              Blog yazıları
            </Link>
          </div>
          <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900">
            Nöbetçi eczane
          </h1>
          <p className="text-center text-sm text-slate-600">
            Nasıl aramak istersiniz?
          </p>
          <button
            type="button"
            onClick={goToNearby}
            className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-red-200 hover:shadow-md active:scale-[0.99]"
          >
            <span className="text-base font-semibold text-slate-900">
              Konumuma yakın olanları bul
            </span>
            <span className="text-sm leading-snug text-slate-600">
              Bu düğmeye bastığınızda tarayıcı konum izni ister (telefonda özellikle
              önemli). Yaklaşık {NEARBY_RADIUS_KM} km içindeki nöbetçi eczaneler
              haritada gösterilir.
            </span>
          </button>
          <button
            type="button"
            onClick={goToManualForm}
            className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-red-200 hover:shadow-md active:scale-[0.99]"
          >
            <span className="text-base font-semibold text-slate-900">
              İl / ilçeye göre bul
            </span>
            <span className="text-sm leading-snug text-slate-600">
              Önce ili, isteğe bağlı ilçeyi seçin; o bölgedeki nöbetçi eczaneler
              listelenir.
            </span>
          </button>
          {homeBlogTeaser ? (
            <Link
              href={`/blog/${encodeURIComponent(homeBlogTeaser.slug)}`}
              className="flex flex-col gap-1 rounded-2xl border border-red-100 bg-white p-4 text-left shadow-sm ring-1 ring-red-100/80 transition hover:border-red-200 hover:shadow-md active:scale-[0.99]"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-red-600">
                Öne çıkan yazı
              </span>
              <span className="text-base font-semibold text-slate-900">
                {homeBlogTeaser.title}
              </span>
              {homeBlogTeaser.excerpt.trim() ? (
                <span className="line-clamp-2 text-sm leading-snug text-slate-600">
                  {homeBlogTeaser.excerpt}
                </span>
              ) : null}
              <span className="text-xs font-medium text-red-600">
                Yazıyı oku →
              </span>
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  if (flow === "manualForm") {
    return (
      <div className="flex min-h-dvh flex-col bg-gradient-to-b from-slate-50 to-white px-4 py-8">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5">
          <button
            type="button"
            onClick={backFromManualForm}
            className="self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Geri
          </button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              İl / ilçe seçin
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              İl zorunludur; ilçe isteğe bağlı. Seçimden sonra harita açılır.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-slate-800" htmlFor="form-il">
              İl <span className="text-red-600">*</span>
            </label>
            <select
              id="form-il"
              value={formIl}
              onChange={(e) => {
                setFormIl(e.target.value);
                setFormIlce("");
                setFormError(null);
              }}
              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
            >
              <option value="" disabled>
                İl seçin
              </option>
              {TURKISH_PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <label className="text-sm font-medium text-slate-800" htmlFor="form-ilce">
              İlçe <span className="font-normal text-slate-500">(isteğe bağlı)</span>
            </label>
            <select
              id="form-ilce"
              value={formIlce}
              onChange={(e) => setFormIlce(e.target.value)}
              disabled={!formIl.trim()}
              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
            >
              <option value="">Tüm ilçeler</option>
              {districts.map((d) => (
                <option key={d.text} value={d.text}>
                  {d.text}
                </option>
              ))}
            </select>
          </div>
          {formError && (
            <p className="text-sm text-red-600" role="alert">
              {formError}
            </p>
          )}
          <button
            type="button"
            onClick={submitManualForm}
            className="min-h-12 w-full rounded-xl bg-red-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-red-700 active:scale-[0.99]"
          >
            Haritada göster
          </button>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-dvh items-center justify-center bg-slate-50 text-slate-600">
        Harita yükleniyor…
      </div>
    );
  }

  const userIcon = {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: "#4285F4",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    scale: 9,
  };

  return (
    <div className="flex h-dvh flex-col bg-white">
      <header className="z-10 flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={resetToChoose}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Başa dön
          </button>
          {flow === "manual" && (
            <>
              <label className="sr-only" htmlFor="il">
                İl
              </label>
              <select
                id="il"
                value={il}
                onChange={(e) => {
                  setIl(e.target.value);
                  setIlce("");
                }}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-900"
              >
                {TURKISH_PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="ilce">
                İlçe
              </label>
              <select
                id="ilce"
                value={ilce}
                onChange={(e) => setIlce(e.target.value)}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 sm:max-w-[13rem]"
              >
                <option value="">Tüm ilçeler</option>
                {districts.map((d) => (
                  <option key={d.text} value={d.text}>
                    {d.text}
                  </option>
                ))}
              </select>
            </>
          )}
          {flow === "nearby" && (
            <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
              Yakın
              {detectedIl ? (
                <>
                  {" "}
                  · <span className="text-slate-600">{detectedIl}</span>
                </>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-2">
          {flow === "nearby" && (
            <div className="min-w-0 flex-1">
              {nearbyBusy ? (
                <p className="text-xs text-slate-500">Hazırlanıyor…</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-900">
                    {nearbyExpandedToFullIl
                      ? `${pharmacies.length} nöbetçi eczane · ~${NEARBY_RADIUS_KM} km · il geneli`
                      : `${pharmacies.length} nöbetçi eczane · ~${NEARBY_RADIUS_KM} km`}
                  </p>
                  {geoStatus === "ok" && (
                    <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                      Mavi halka ≈{NEARBY_MAP_FOCUS_RADIUS_KM} km
                      {listLastSynced ? (
                        <>
                          {" "}
                          · Veri:{" "}
                          <span className="font-medium text-slate-600">
                            {formatIstanbulTs(listLastSynced)}
                          </span>
                        </>
                      ) : null}
                    </p>
                  )}
                  {!nearbyBusy && nearbyExpandedToFullIl && (
                    <p className="mt-0.5 text-[11px] text-amber-800">
                      {NEARBY_RADIUS_KM} km içinde yok; mesafeye göre sıralı.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {flow === "manual" && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">
                {loading
                  ? "Güncelleniyor…"
                  : `${pharmacies.length} nöbetçi eczane${
                      pharmacies.length > 0 &&
                      mappablePharmacyCount !== pharmacies.length
                        ? ` · ${mappablePharmacyCount} haritada`
                        : ""
                    }`}
              </p>
              {listLastSynced ? (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Veri:{" "}
                  <span className="font-medium text-slate-600">
                    {formatIstanbulTs(listLastSynced)}
                  </span>
                </p>
              ) : null}
            </div>
          )}
          {flow === "nearby" && (
            <button
              type="button"
              disabled={locating}
              onClick={() =>
                userPos ? goToMyLocation() : readLocation({ fresh: true, focusMap: true })
              }
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              {userPos
                ? locating
                  ? "…"
                  : "Konuma git"
                : locating
                  ? "…"
                  : "Konumu yenile"}
            </button>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
        {listNobeteczaOncekiGun === true && (
          <p
            className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950"
            role="status"
          >
            Kaynak: Liste henüz tam güncellenmemiş olabilir (önceki güne ait veri).
            İllere göre yayın saati değişebilir; sabah saatlerinde tekrar deneyin.
          </p>
        )}
        {flow === "nearby" && geoStatus === "denied" && !nearbyBusy && (
          <button
            type="button"
            disabled={locating}
            onClick={() => readLocation({ fresh: true, focusMap: true })}
            className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 shadow-sm transition hover:bg-red-100 disabled:opacity-60"
          >
            {locating ? "İzin isteniyor…" : "Konumu tekrar iste"}
          </button>
        )}
        {suspiciousProvinceSpread && (
          <p
            className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-950"
            role="status"
          >
            Bu il için gelen konumlar çok geniş bir alana yayılıyor; kaynak veri hatalı
            veya karışık olabilir. Resmi eczacı odası listesiyle doğrulayın.
          </p>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        {nearbyBusy && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-[2px]">
            <p className="text-sm font-medium text-slate-700">
              Konum alınıyor ve yakın eczaneler yükleniyor…
            </p>
          </div>
        )}
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={center}
          {...(flow === "nearby"
            ? {}
            : {
                zoom: 12,
              })}
          options={defaultMapOptions}
          onLoad={(m) => {
            mapRef.current = m;
            setMap(m);
          }}
          onClick={() => setSelected(null)}
        >
          {flow === "nearby" && userPos && (
            <Circle
              center={userPos}
              radius={NEARBY_MAP_CIRCLE_RADIUS_M}
              options={{
                strokeColor: "#4285F4",
                strokeOpacity: 0.4,
                strokeWeight: 1,
                fillColor: "#4285F4",
                fillOpacity: 0.08,
                clickable: false,
                zIndex: 1,
              }}
            />
          )}
          {flow === "nearby" && userPos && (
            <Marker position={userPos} icon={userIcon} zIndex={999} />
          )}
          {pharmacies.map((p, i) => {
            const pos = parseLoc(p.loc);
            if (!pos) return null;
            return (
              <Marker
                key={`${p.name}-${i}-${p.loc}`}
                position={pos}
                onClick={() => setSelected(p)}
              />
            );
          })}
          {selected && selectedPos && (
            <InfoWindow
              position={selectedPos}
              onCloseClick={() => setSelected(null)}
            >
              <div className="max-w-[220px] p-1 text-sm text-slate-900">
                <p className="font-semibold">{selected.name}</p>
                <p className="mt-1 text-xs text-slate-600">{selected.dist}</p>
                {flow === "nearby" && selectedKm != null && (
                  <p className="mt-1 text-xs text-slate-500">
                    Yaklaşık {selectedKm.toFixed(1)} km
                  </p>
                )}
                <p className="mt-1 text-xs leading-snug">{selected.address}</p>
                <p className="mt-1 text-xs">
                  <a
                    className="text-blue-600 underline"
                    href={`tel:${selected.phone.replace(/\s/g, "")}`}
                  >
                    {selected.phone}
                  </a>
                </p>
                <a
                  className="mt-2 inline-flex w-full items-center justify-center rounded-md bg-red-600 px-3 py-2 text-xs font-medium text-white no-underline"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPos.lat},${selectedPos.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Yol tarifi al
                </a>
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>
    </div>
  );
}
