const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");
const COORDS = path.join(ROOT, "public/genbank/disease-coordinates.json");
const INDEX = path.join(ROOT, "public/rc-data/index.json");
const GEO_DIR = path.join(ROOT, "public/rc-data/geo");
const OUT = path.join(ROOT, "public/febrile-choropleth.geojson");

const GENERA = [
  { key: "rickettsia", match: /rickettsia|spotted\s*fever|tick[-\s]?bite\s*fever|tick\s*typhus/i },
  { key: "borrelia", match: /borrelia|lyme|relapsing\s*fever/i },
  { key: "babesia", match: /babesia/i },
  { key: "coxiella", match: /coxiella|q\s?fever|query\s*fever/i },
  { key: "anaplasma", match: /anaplasma/i },
  { key: "ehrlichia", match: /ehrlichia/i },
];
const FEBRILE_RE = /rickettsia|spotted\s*fever|tick[-\s]?bite\s*fever|tick\s*typhus|borrelia|lyme|relapsing\s*fever|babesia|coxiella|q\s?fever|query\s*fever|anaplasma|ehrlichia/i;

const ALIASES = {
  "congo democratic republic of the": "COD",
  "congo democratic republic of": "COD",
  "democratic republic of the congo": "COD",
  "dr congo": "COD",
  "drc": "COD",
  "tanzania united republic of": "TZA",
  "tanzania united republic of the": "TZA",
  "eswatini": "SWZ",
  "swaziland": "SWZ",
  "sao tome and principe": "STP",
  "sao tome and principe (sao tome and principe)": "STP",
  "congo": "COG",
  "republic of the congo": "COG",
};

function normalize(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function distToSegSq(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  const t2 = Math.max(0, Math.min(1, t));
  const qx = ax + t2 * dx, qy = ay + t2 * dy;
  const rx = px - qx, ry = py - qy;
  return rx * rx + ry * ry;
}

function simplifyRing(ring, tol) {
  if (ring.length < 5) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const sq = tol * tol;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const ax = ring[s][0], ay = ring[s][1], bx = ring[e][0], by = ring[e][1];
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegSq(ring[i][0], ring[i][1], ax, ay, bx, by);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx >= 0 && maxD > sq) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out = [];
  for (let i = 0; i < ring.length; i++) if (keep[i]) out.push(ring[i]);
  return out;
}

const TOL = 0.008;
const R3 = (v) => Math.round(v * 1e3) / 1e3;

function cleanRing(ring) {
  const pts = [];
  for (const c of ring) {
    const x = R3(c[0]), y = R3(c[1]);
    if (pts.length && pts[pts.length - 1][0] === x && pts[pts.length - 1][1] === y) continue;
    pts.push([x, y]);
  }
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  const closed = pts.length > 2 ? simplifyRing([...pts, pts[0]], TOL) : pts;
  closed.pop();
  return closed;
}

function cleanGeom(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const outPolys = [];
  for (const poly of polys) {
    const rings = poly.map(cleanRing).filter((r) => r.length >= 3);
    if (rings.length) outPolys.push(rings);
  }
  if (!outPolys.length) return null;
  return {
    type: geom.type === "Polygon" ? "Polygon" : "MultiPolygon",
    coordinates: geom.type === "Polygon" ? outPolys[0] : outPolys,
  };
}

function inRing(pt, ring) {
  const x = pt[0], y = pt[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInGeometry(pt, geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    const outer = inRing(pt, poly[0]);
    if (!outer) continue;
    for (let i = 1; i < poly.length; i++) if (inRing(pt, poly[i])) return false;
    return true;
  }
  return false;
}

function bbox(geom) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) for (const ring of poly) for (const c of ring) {
    if (c[0] < minX) minX = c[0];
    if (c[0] > maxX) maxX = c[0];
    if (c[1] < minY) minY = c[1];
    if (c[1] > maxY) maxY = c[1];
  }
  return [minX, minY, maxX, maxY];
}

const coords = JSON.parse(fs.readFileSync(COORDS, "utf8"));
const idx = JSON.parse(fs.readFileSync(INDEX, "utf8"));

const gidByName = new Map();
for (const c of idx.countries) gidByName.set(normalize(c.name), c.gid);

function nameToGid(name) {
  if (!name) return null;
  const n = normalize(name);
  if (ALIASES[n]) return ALIASES[n];
  return gidByName.get(n) || null;
}

const featureCache = new Map();
function countryFeatures(gid) {
  if (!featureCache.has(gid)) {
    const file = path.join(GEO_DIR, `${gid}.json`);
    if (!fs.existsSync(file)) { featureCache.set(gid, null); return null; }
    const fc = JSON.parse(fs.readFileSync(file, "utf8"));
    const feats = fc.features.map((f) => ({ ...f, b: bbox(f.geometry) }));
    featureCache.set(gid, feats);
  }
  return featureCache.get(gid);
}

const counts = {
  byGenus: { rickettsia: 0, borrelia: 0, babesia: 0, coxiella: 0, anaplasma: 0, ehrlichia: 0 },
  byAdm1: {}, // gid1 -> { genusKey: count, total }
  byCountry: {},
  unmappedCountry: {},
  mapped: 0,
  total: 0,
};

let indexedFeatures = 0;

for (const [disease, entry] of Object.entries(coords)) {
  if (!FEBRILE_RE.test(disease)) continue;
  let primary = null;
  for (const g of GENERA) {
    const m = g.match.exec(disease);
    if (m && (primary === null || m.index < primary.i)) primary = { k: g.key, i: m.index };
  }
  if (!primary) continue;
  const genera = [primary.k];
  for (const p of entry.points) {
    counts.total++;
    const gid = nameToGid(p.country);
    if (!gid) {
      const cn = (p.country || "unknown").trim();
      counts.unmappedCountry[cn] = (counts.unmappedCountry[cn] || 0) + 1;
      continue;
    }
    counts.byCountry[gid] = (counts.byCountry[gid] || 0) + 1;
    const feats = countryFeatures(gid);
    if (!feats) {
      const cn = (p.country || "unknown").trim();
      counts.unmappedCountry[cn] = (counts.unmappedCountry[cn] || 0) + 1;
      continue;
    }
    const pt = [p.lng, p.lat];
    let hit = null;
    for (const f of feats) {
      const bb = f.b;
      if (pt[0] < bb[0] || pt[0] > bb[2] || pt[1] < bb[1] || pt[1] > bb[3]) continue;
      if (pointInGeometry(pt, f.geometry)) { hit = f; break; }
    }
    if (!hit) continue;
    counts.mapped++;
    const g1 = hit.properties.GID_1;
    for (const gk of genera) {
      counts.byGenus[gk]++;
      const b = (counts.byAdm1[g1] = counts.byAdm1[g1] || {});
      b[gk] = (b[gk] || 0) + 1;
      b.total = (b.total || 0) + 1;
    }
  }
}

const features = [];
for (const gid of featureCache.keys()) {
  const feats = featureCache.get(gid);
  if (!feats) continue;
  const countryName = idx.countries.find((c) => c.gid === gid)?.name || gid;
  for (const f of feats) {
    const props = f.properties;
    const g1 = props.GID_1;
    const c = counts.byAdm1[g1] || {};
    const clean = { G0: gid, CN: countryName, G1: g1, N1: props.NAME_1 };
    for (const g of GENERA) clean[`d_${g.key}`] = c[g.key] || 0;
    clean.d_total = c.total || 0;
    const g2 = cleanGeom(f.geometry);
    if (!g2) continue;
    features.push({
      type: "Feature",
      properties: clean,
      geometry: g2,
    });
    indexedFeatures++;
  }
}

const out = {
  type: "FeatureCollection",
  meta: {
    total: counts.total,
    mapped: counts.mapped,
    byGenus: counts.byGenus,
    unmappedCountries: counts.unmappedCountry,
  },
  features,
};

fs.writeFileSync(OUT, JSON.stringify(out));
console.log("total febrile points:", counts.total);
console.log("mapped to admin regions:", counts.mapped);
console.log("byGenus:", counts.byGenus);
console.log("features:", out.features.length);
console.log("unmapped countries:", JSON.stringify(counts.unmappedCountry));
console.log("asset KB:", Math.round(fs.statSync(OUT).size / 1024));