// Removes occurrence records whose coordinates fall in the sea (not on land),
// using Natural Earth 1:50m land polygons as the land mask. Records without
// coordinates (which are never plotted) are kept. Idempotent: rerunning removes
// nothing further. Updates public/*.json and the source Excel.
const fs = require("fs");
const path = require("path");
const XLSX = require("../server/node_modules/xlsx");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "server", "data");
const LAND_FILE = path.join(DATA_DIR, "ne_50m_land.geojson");

const GRID = 5; // degrees per grid cell

// ---- load land mask ----
const land = JSON.parse(fs.readFileSync(LAND_FILE, "utf8"));

// Polygon: { minLat, minLon, maxLat, maxLon, rings: [outer, ...holes] }
const polygons = [];
for (const feat of land.features) {
  const geom = feat.geometry;
  if (!geom) continue;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const coords of polys) {
    const outer = coords[0];
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const [lo, la] of outer) {
      if (la < minLat) minLat = la;
      if (la > maxLat) maxLat = la;
      if (lo < minLon) minLon = lo;
      if (lo > maxLon) maxLon = lo;
    }
    const rings = coords.map((r) => r.map((p) => [p[1], p[0]])); // [lat, lon]
    polygons.push({ minLat, maxLat, minLon, maxLon, rings });
  }
}

// grid index: cell -> polygon indices
const nLatCells = Math.ceil(180 / GRID);
const nLonCells = Math.ceil(360 / GRID);
const grid = Array.from({ length: nLatCells }, () => Array.from({ length: nLonCells }, () => []));
for (let i = 0; i < polygons.length; i++) {
  const p = polygons[i];
  const c0 = Math.max(0, Math.floor((p.minLat + 90) / GRID));
  const c1 = Math.min(nLatCells - 1, Math.floor((p.maxLat + 90) / GRID));
  const r0 = Math.max(0, Math.floor((p.minLon + 180) / GRID));
  const r1 = Math.min(nLonCells - 1, Math.floor((p.maxLon + 180) / GRID));
  for (let c = c0; c <= c1; c++)
    for (let r = r0; r <= r1; r++) grid[c][r].push(i);
}

function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]; // ring stored as [lat, lon]
    const [yj, xj] = ring[j];
    if (yi > lat !== yj > lat) {
      const x = xi + ((lat - yi) * (xj - xi)) / (yj - yi);
      if (lon < x) inside = !inside;
    }
  }
  return inside;
}

function onLand(lat, lon) {
  if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return true;
  const c = Math.max(0, Math.min(nLatCells - 1, Math.floor((lat + 90) / GRID)));
  const r = Math.max(0, Math.min(nLonCells - 1, Math.floor((lon + 180) / GRID)));
  for (const idx of grid[c][r]) {
    const p = polygons[idx];
    if (lat < p.minLat || lat > p.maxLat || lon < p.minLon || lon > p.maxLon) continue;
    if (!pointInRing(lat, lon, p.rings[0])) continue;
    let inHole = false;
    for (let h = 1; h < p.rings.length; h++) {
      if (pointInRing(lat, lon, p.rings[h])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

function load(file) {
  return JSON.parse(fs.readFileSync(path.join(PUBLIC, file), "utf8"));
}
function save(file, obj) {
  fs.writeFileSync(path.join(PUBLIC, file), JSON.stringify(obj));
}

function groupBy(records, field, filterEmpty = true) {
  const counts = new Map();
  for (const r of records) {
    const v = r[field];
    if (filterEmpty && !v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

// ---- filter occurrences ----
const occ = load("occurrences.json").data;
const removed = [];
const kept = [];
for (const r of occ) {
  const hasCoords = r.latitude != null && r.longitude != null && r.latitude !== "" && r.longitude !== "";
  if (!hasCoords) { kept.push(r); continue; }
  const lat = Number(r.latitude);
  const lon = Number(r.longitude);
  if (onLand(lat, lon)) kept.push(r);
  else removed.push(r);
}

console.log("Total records:", occ.length, "| kept:", kept.length, "| removed (sea):", removed.length);

const byCountry = new Map();
for (const r of removed) {
  const key = r.country || "Unknown";
  byCountry.set(key, (byCountry.get(key) || 0) + 1);
}
console.log("--- removed by country (top 25) ---");
console.log(
  Array.from(byCountry.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([c, n]) => c + ": " + n)
    .join("\n")
);
console.log("--- sample removed records ---");
for (const r of removed.slice(0, 12)) {
  console.log(
    r.species + " | " + r.country + " | " + r.latitude + ", " + r.longitude
  );
}

save("occurrences.json", {
  data: kept,
  pagination: { page: 1, limit: 50000, total: kept.length, totalPages: Math.ceil(kept.length / 50000) },
});

let occMin = null, occMax = null;
for (const r of kept) {
  if (r.year === null || r.year === undefined) continue;
  if (occMin === null || r.year < occMin) occMin = r.year;
  if (occMax === null || r.year > occMax) occMax = r.year;
}
save("occurrences-meta.json", {
  totalRecords: kept.length,
  yearRange: { min: occMin, max: occMax },
  species: groupBy(kept, "species"),
  countries: groupBy(kept, "country"),
});

// ---- rebuild Excel from cleaned JSON ----
const occRows = kept.map((r) => ({
  Species: r.species, Latitude: r.latitude, Longitude: r.longitude,
  Country: r.country, Year: r.year, "GBIF occurrence ID": r.gbifId, Citation: r.citation,
}));
const occWs = XLSX.utils.json_to_sheet(occRows);
const occWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(occWb, occWs, "Occurrences");
XLSX.writeFile(occWb, path.join(DATA_DIR, "tick_occurrence_simple.xlsx"));
console.log("Rebuilt Excel from cleaned JSON ->", occRows.length, "rows");
