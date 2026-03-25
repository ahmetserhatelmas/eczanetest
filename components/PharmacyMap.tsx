"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Circle,
  GoogleMap,
  InfoWindow,
  Marker,
  useJsApiLoader,
} from "@react-google-maps/api";
import {
  boundsCornersForRadiusKm,
  distanceKm,
  NEARBY_MAP_CIRCLE_RADIUS_M,
  NEARBY_MAP_FOCUS_RADIUS_KM,
  NEARBY_RADIUS_KM,
} from "@/lib/geo";
import { matchTurkishProvince } from "@/lib/match-turkish-province";
import { parseLoc, type DutyPharmacy } from "@/lib/pharmacy";
import { TURKISH_PROVINCES } from "@/lib/provinces";

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

export default function PharmacyMap() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const { isLoaded, loadError } = useJsApiLoader({
    id: "eczane-google-map",
    googleMapsApiKey: apiKey,
  });

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

  const center = useMemo(() => userPos ?? ANKARA_CENTER, [userPos]);

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
  }, []);

  const readLocation = useCallback(
    (opts?: { fresh?: boolean; focusMap?: boolean }) => {
      if (!navigator.geolocation) {
        setGeoStatus("unavailable");
        return;
      }
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
      const params = new URLSearchParams({ il: city });
      if (district) params.set("ilce", district);
      const r = await fetch(`/api/pharmacies?${params}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Liste alınamadı");
      setPharmacies((data.result as DutyPharmacy[]) || []);
    } catch (e) {
      setPharmacies([]);
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

  useEffect(() => {
    if (flow !== "nearby" || !isLoaded) return;

    let cancelled = false;

    async function runNearby() {
      setNearbyBusy(true);
      setError(null);
      setPharmacies([]);
      setPharmacyDistKm({});
      setNearbyExpandedToFullIl(false);
      setSelected(null);
      setDetectedIl(null);

      if (!navigator.geolocation) {
        setGeoStatus("unavailable");
        setError("Tarayıcı konum desteklemiyor.");
        setNearbyBusy(false);
        return;
      }

      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        });
      });

      if (cancelled) return;

      if (!pos) {
        setGeoStatus("denied");
        setError("Konum izni olmadan yakın eczaneler gösterilemez.");
        setNearbyBusy(false);
        return;
      }

      const u = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      setUserPos(u);
      const acc = pos.coords.accuracy;
      setUserAccuracyM(
        typeof acc === "number" && Number.isFinite(acc) ? acc : null
      );
      setGeoStatus("ok");

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
        const r = await fetch(
          `/api/pharmacies?il=${encodeURIComponent(matched)}`
        );
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Liste alınamadı");
        const all = (data.result as DutyPharmacy[]) ?? [];

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
          setError(e instanceof Error ? e.message : "Hata");
        }
      } finally {
        if (!cancelled) setNearbyBusy(false);
      }
    }

    void runNearby();

    return () => {
      cancelled = true;
    };
  }, [flow, isLoaded]);

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

  if (!apiKey.trim()) {
    return (
      <div className="flex h-dvh items-center justify-center bg-white px-4 text-center text-red-700">
        NEXT_PUBLIC_GOOGLE_MAPS_API_KEY eksik. `.env.local` dosyasını kontrol edin.
      </div>
    );
  }

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
              Konumunuz kullanılır; yaklaşık {NEARBY_RADIUS_KM} km içindeki
              nöbetçi eczaneler haritada gösterilir.
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
            <div className="min-w-0 flex-1 text-sm text-slate-700">
              <span className="font-medium">Konumunuza yakın</span>
              {detectedIl && (
                <span className="text-slate-500">
                  {" "}
                  · Tespit edilen il: <strong>{detectedIl}</strong>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 gap-y-2 text-xs text-slate-500">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {nearbyBusy && <span>Konum ve liste hazırlanıyor…</span>}
            {!nearbyBusy && flow === "nearby" && (
              <>
                <span>
                  {nearbyExpandedToFullIl
                    ? `${pharmacies.length} nöbetçi eczane (${NEARBY_RADIUS_KM} km içinde yok; tüm il mesafeye göre sıralı)`
                    : `${pharmacies.length} nöbetçi eczane (~${NEARBY_RADIUS_KM} km)`}
                </span>
                {nearbyExpandedToFullIl && (
                  <span className="text-amber-700/90">
                    Yakın çemberde kayıt yok; haritada il geneli gösteriliyor.
                  </span>
                )}
              </>
            )}
            {!nearbyBusy && flow === "manual" && (
              <span>
                {loading
                  ? "Güncelleniyor…"
                  : `${pharmacies.length} nöbetçi eczane`}
              </span>
            )}
            <span className="text-[11px] leading-snug text-slate-400">
              Günlük nöbetçi listesi (Supabase / bugünün tarihi).
            </span>
          </div>

          {flow === "nearby" && (
            <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
              <span className="max-w-[14rem] text-right leading-snug">
                {geoStatus === "ok" && (
                  <>
                    Mavi nokta sizsiniz
                    <br />
                    <span className="text-slate-400">
                      Mavi halka ≈{NEARBY_MAP_FOCUS_RADIUS_KM} km (görsel). Liste
                      ~{NEARBY_RADIUS_KM} km
                    </span>
                    {userAccuracyM != null && userAccuracyM > 0 && (
                      <>
                        <br />
                        <span className="text-slate-400">
                          GPS belirsizliği: ±~{Math.round(userAccuracyM)} m
                        </span>
                      </>
                    )}
                  </>
                )}
              </span>
              <button
                type="button"
                disabled={locating}
                onClick={() =>
                  userPos ? goToMyLocation() : readLocation({ fresh: true, focusMap: true })
                }
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              >
                {userPos
                  ? locating
                    ? "…"
                    : "Konuma git"
                  : locating
                    ? "…"
                    : "Konumu yenile"}
              </button>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
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
