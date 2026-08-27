export type Coordinate = [lng: number, lat: number];

export const EARTH_RADIUS_METERS = 6_371_008.8;

export function distanceBetweenCoordinates(a: Coordinate, b: Coordinate): number {
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const deltaLat = lat2 - lat1;
  const deltaLng = ((b[0] - a[0]) * Math.PI) / 180;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function lineDistance(coordinates: Coordinate[]): number {
  return coordinates
    .slice(1)
    .reduce(
      (total, coordinate, index) =>
        total + distanceBetweenCoordinates(coordinates[index], coordinate),
      0,
    );
}
