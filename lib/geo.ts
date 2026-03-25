export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Yakınlık yarıçapı (km). */
export const NEARBY_RADIUS_KM = 30;

/**
 * Yakın mod harita çerçevesi: kullanıcı etrafında bu yarıçap (km).
 * Eczane listesi ayrıca NEARBY_RADIUS_KM ile süzülür (daha geniş).
 */
export const NEARBY_MAP_FOCUS_RADIUS_KM = 2.8;

/** Haritada mavi daire (m): NEARBY_MAP_FOCUS_RADIUS_KM ile aynı — dev şehri kaplamaz. */
export const NEARBY_MAP_CIRCLE_RADIUS_M = NEARBY_MAP_FOCUS_RADIUS_KM * 1000;

export type LatLng = { lat: number; lng: number };

/**
 * Tek il seçiliyken, tüm pinlerin enlem/boylam yayılımı bu dereceden büyükse
 * (ör. hatalı kaynak verisinde) liste güvenilir değildir.
 * Türkiye’de en büyük illerin tipik kutusu ~2–3°; ülke geneli karışımı çok daha geniştir.
 */
export const PROVINCE_COORD_SPAN_SUSPICIOUS_DEG = 3.6;

/**
 * Yayılım anlamlı olsun diye en az bu kadar geçerli koordinat gerekir.
 */
export const PROVINCE_SPAN_MIN_POINTS = 10;

export type ProvinceSpanCheck = {
  suspicious: boolean;
  latSpan: number;
  lngSpan: number;
  points: number;
};

/** `loc` alanı "lat,lng" olan eczane satırları için enlem/boylam kutusu şüpheli mi? */
export function dutyPharmacyListSuspiciousSpread(
  rows: { loc: string }[]
): ProvinceSpanCheck {
  const pts: LatLng[] = [];
  for (const row of rows) {
    const parts = row.loc.split(",").map((s) => Number.parseFloat(s.trim()));
    if (
      parts.length >= 2 &&
      Number.isFinite(parts[0]) &&
      Number.isFinite(parts[1])
    ) {
      pts.push({ lat: parts[0], lng: parts[1] });
    }
  }
  if (pts.length < PROVINCE_SPAN_MIN_POINTS) {
    return {
      suspicious: false,
      latSpan: 0,
      lngSpan: 0,
      points: pts.length,
    };
  }
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const latSpan = Math.max(...lats) - Math.min(...lats);
  const lngSpan = Math.max(...lngs) - Math.min(...lngs);
  const maxSpan = Math.max(latSpan, lngSpan);
  const suspicious = maxSpan > PROVINCE_COORD_SPAN_SUSPICIOUS_DEG;
  return { suspicious, latSpan, lngSpan, points: pts.length };
}

/**
 * Merkez + km yarıçapı için harita fitBounds (dikdörtgen köşeler).
 * Enlem boyunca ~111 km/°; boylam enleme göre ölçeklenir.
 */
export function boundsCornersForRadiusKm(
  center: LatLng,
  radiusKm: number
): { southWest: LatLng; northEast: LatLng } {
  const latRad = (center.lat * Math.PI) / 180;
  const latDelta = radiusKm / 111.32;
  const cosLat = Math.cos(latRad);
  const safeCos = Math.max(Math.abs(cosLat), 0.25);
  const lngDelta = radiusKm / (111.32 * safeCos);
  return {
    southWest: {
      lat: center.lat - latDelta,
      lng: center.lng - lngDelta,
    },
    northEast: {
      lat: center.lat + latDelta,
      lng: center.lng + lngDelta,
    },
  };
}
