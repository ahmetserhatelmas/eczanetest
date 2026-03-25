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
