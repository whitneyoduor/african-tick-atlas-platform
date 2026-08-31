// Builds the compact, Africa-focused datasets served to the map pages:
//   1. public/map-points.json        - Africa-visible occurrence points, dictionary-encoded
//   2. public/tick_occurrences.geojson - full downloadable GeoJSON of all occurrence records
//
// The map pages previously downloaded the entire 42MB public/occurrences.json
// only to render ~9-15k African points and discard the rest. map-points.json
// encodes exactly what the map shows (~15k points) with string dictionaries,
// cutting the map payload from ~42MB to well under 1MB.
//
// The Africa window matches the map's maxBounds (lon -25..55, lat -40..40) and
// every point is verified to be on land using the Natural Earth 1:50m mask, so
// the coarse isOnLand() boxes (which wrongly hid Madagascar, Comoros, Sao Tome,
// Cabo Verde, etc.) are no longer needed at render time.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "server", "data");
const LAND_FILE = path.join(DATA_DIR, "ne_50m_land.geojson");

const AFRICA_BBOX = { west: -25, south: -40, east: 55, north: 40 };

// ---- load land mask ----
const land = JSON.parse(fs.readFileSync(LAND_FILE, "utf8"));
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
    const rings = coords.map((r) => r.map((p) => [p[1], p[0]]));
    polygons.push({ minLat, maxLat, minLon, maxLon, rings });
  }
}

function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > lat !== yj > lat) {
      const x = xi + ((lat - yi) * (xj - xi)) / (yj - yi);
      if (lon < x) inside = !inside;
    }
  }
  return inside;
}

function onLand(lat, lon) {
  if (!isFinite(lat) || !isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
  for (const p of polygons) {
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

// ---- species detail (host / disease / method) from literature records ----
function isBlankValue(v) {
  if (!v) return true;
  const t = String(v).trim().toLowerCase();
  return t === "" || t === "none" || t === "n/a" || t === "na" || t === "unknown";
}

function buildSpeciesDetail(records) {
  const agg = {};
  for (const r of records) {
    if (!r.species) continue;
    const key = String(r.species).trim().toLowerCase();
    if (!key) continue;
    const e = (agg[key] ||= { disease: {}, host: {}, method: {} });
    if (!isBlankValue(r.epidemiologicalDisease)) {
      const v = String(r.epidemiologicalDisease).trim();
      e.disease[v] = (e.disease[v] || 0) + 1;
    }
    if (!isBlankValue(r.relatedHosts)) {
      const v = String(r.relatedHosts).trim();
      e.host[v] = (e.host[v] || 0) + 1;
    }
    if (!isBlankValue(r.methodOfExtraction)) {
      const v = String(r.methodOfExtraction).trim();
      e.method[v] = (e.method[v] || 0) + 1;
    }
  }
  const best = (m) => {
    let top = "", topN = 0;
    for (const [k, n] of Object.entries(m)) if (n > topN) { top = k; topN = n; }
    return top;
  };
  const map = {};
  for (const [key, e] of Object.entries(agg)) {
    map[key] = { disease: best(e.disease), host: best(e.host), method: best(e.method) };
  }
  return map;
}

// ---- load sources ----
const occ = JSON.parse(fs.readFileSync(path.join(PUBLIC, "occurrences.json"), "utf8")).data;
const epi = JSON.parse(fs.readFileSync(path.join(PUBLIC, "epidemiological.json"), "utf8")).data;
const speciesDetail = buildSpeciesDetail(epi);

// ---- select Africa-visible points ----
const usable = [];
for (const r of occ) {
  const hasCoords = r.latitude != null && r.longitude != null && r.latitude !== "" && r.longitude !== "";
  if (!hasCoords) continue;
  const lat = Number(r.latitude);
  const lon = Number(r.longitude);
  if (lon < AFRICA_BBOX.west || lon > AFRICA_BBOX.east || lat < AFRICA_BBOX.south || lat > AFRICA_BBOX.north) continue;
  if (!onLand(lat, lon)) continue;
  const attrs = speciesDetail[String(r.species || "").trim().toLowerCase()] || { disease: "", host: "", method: "" };
  usable.push({
    r,
    lat,
    lon,
    host: attrs.host || null,
    disease: attrs.disease || null,
    method: attrs.method || null,
  });
}

// ---- build dictionaries (stable order) ----
const dict = (list) => Array.from(new Set(list)).sort();
const speciesDict = dict(usable.map((u) => u.r.species || "Unknown"));
const countryDict = dict(usable.map((u) => u.r.country || "Unknown"));
const hostDict = dict(usable.filter((u) => u.host).map((u) => u.host));
const diseaseDict = dict(usable.filter((u) => u.disease).map((u) => u.disease));
const methodDict = dict(usable.filter((u) => u.method).map((u) => u.method));

const idx = (arr, v) => {
  if (v == null) return -1;
  const i = arr.indexOf(v);
  return i === -1 ? -1 : i;
};

const points = usable.map((u) => [
  Math.round(u.lon * 1e6) / 1e6,
  Math.round(u.lat * 1e6) / 1e6,
  idx(speciesDict, u.r.species || "Unknown"),
  idx(countryDict, u.r.country || "Unknown"),
  u.r.year == null ? -1 : u.r.year,
  idx(hostDict, u.host),
  idx(diseaseDict, u.disease),
  idx(methodDict, u.method),
]);

fs.writeFileSync(
  path.join(PUBLIC, "map-points.json"),
  JSON.stringify({
    species: speciesDict,
    country: countryDict,
    host: hostDict,
    disease: diseaseDict,
    method: methodDict,
    points,
  })
);

const mb = (b) => (b / 1e6).toFixed(2) + "MB";
console.log("occurrences.json size:", mb(fs.statSync(path.join(PUBLIC, "occurrences.json")).size));
console.log("map-points.json: " + points.length + " points, " + mb(fs.statSync(path.join(PUBLIC, "map-points.json")).size) + " (was ~42MB full download)");

// ---- downloadable GeoJSON (full dataset, compact) ----
const features = occ
  .filter((r) => r.latitude != null && r.longitude != null && r.latitude !== "" && r.longitude !== "")
  .map((r) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [Number(r.longitude), Number(r.latitude)] },
    properties: {
      id: r.id,
      gbifId: r.gbifId ?? null,
      species: r.species ?? null,
      country: r.country ?? null,
      year: r.year ?? null,
    },
  }));
fs.writeFileSync(
  path.join(PUBLIC, "tick_occurrences.geojson"),
  JSON.stringify({ type: "FeatureCollection", features })
);
fs.writeFileSync(
  path.join(PUBLIC, "tick_occurrences.meta.json"),
  JSON.stringify({ features: features.length, generatedAt: new Date().toISOString() })
);
console.log("tick_occurrences.geojson: " + features.length + " features, " + mb(fs.statSync(path.join(PUBLIC, "tick_occurrences.geojson")).size));

// sanity: every point must decode back cleanly
if (points.some((p) => p[2] === -1 || p[3] === -1)) {
  console.warn("Warning: some points have missing species/country index");
}
console.log("Done.");
