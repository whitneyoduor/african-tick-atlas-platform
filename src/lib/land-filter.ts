const AFRICA_LAND_BOXES: [number, number, number, number][] = [
  [30, -18, 37, 12],
  [15, -18, 32, 16],
  [4, -16, 15, 16],
  [-5, 8, 15, 32],
  [-2, 30, 15, 52],
  [-18, 12, 0, 36],
  [-35, 16, -5, 34],
  [-26, 43, -12, 50],
];

export function isOnLand(lat: number, lng: number): boolean {
  for (const [s, w, n, e] of AFRICA_LAND_BOXES) {
    if (lat >= s && lat <= n && lng >= w && lng <= e) return true;
  }
  return false;
}
