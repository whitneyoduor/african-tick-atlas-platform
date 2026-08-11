// Spatially thins Rhipicephalus sanguineus plotted points per country so dense
// clusters are decluttered while country coverage is preserved.
//
// The species has 10,679 plotted records but only 2,491 distinct sites (the
// rest are exact-coordinate duplicates that render as the same dot). This
// script collapses each distinct site to a single representative record and
// then greedily thins the sites by a minimum spacing (km) so ~50% of distinct
// sites remain. Other species and records without coordinates are untouched.
// Updates public/*.json and the source Excel.
const fs = require("fs");
const path = require("path");
const XLSX = require("../server/node_modules/xlsx");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "server", "data");

const SPECIES = "Rhipicephalus sanguineus";
const TARGET_KEEP = 0.5; // of distinct sites

function load(file) {
  return JSON.parse(fs.readFileSync(path.join(PUBLIC, file), "utf8"));
}
function save(file, obj) {
  fs.writeFileSync(path.join(PUBLIC, file), JSON.stringify(obj));
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
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

const occ = load("occurrences.json").data;

// Collect the first record for each distinct (country, lat, lon) site.
const sites = [];
const seen = new Set();
let duplicates = 0;
for (const r of occ) {
  const hasCoords = r.latitude != null && r.longitude != null && r.latitude !== "" && r.longitude !== "";
  if (r.species !== SPECIES || !hasCoords) continue;
  const key = (r.country || "Unknown") + "|" + Number(r.latitude) + "|" + Number(r.longitude);
  if (seen.has(key)) { duplicates++; continue; }
  seen.add(key);
  sites.push(r);
}
console.log("Plotted records:", duplicates + sites.length, "| distinct sites:", sites.length, "| exact duplicates:", duplicates);

const byCountry = new Map();
for (const r of sites) {
  const key = r.country || "Unknown";
  if (!byCountry.has(key)) byCountry.set(key, []);
  byCountry.get(key).push(r);
}

// Greedy thinning: keep a site if it is at least T km from every kept site in
// the same country. Sites keep their original (id) order.
function thin(groups, T) {
  let keptCount = 0;
  const keptIds = new Set();
  for (const [, recs] of groups) {
    const keptInCountry = [];
    for (const r of recs) {
      const lat = Number(r.latitude);
      const lon = Number(r.longitude);
      let tooClose = false;
      for (const k of keptInCountry) {
        if (haversineKm(lat, lon, k.lat, k.lon) < T) { tooClose = true; break; }
      }
      if (tooClose) continue;
      keptInCountry.push({ lat, lon, id: r.id });
      keptIds.add(r.id);
    }
    keptCount += keptInCountry.length;
  }
  return { keptCount, keptIds };
}

// Search for a distance threshold (km) keeping closest to the target share.
const distances = [1, 2, 3, 5, 8, 10, 15, 20, 25, 30, 40, 50, 75, 100];
let best = { d: 0, diff: Infinity, keptIds: new Set() };
for (const d of distances) {
  const { keptCount, keptIds } = thin(byCountry, d);
  const diff = Math.abs(keptCount / sites.length - TARGET_KEEP);
  console.log("T=" + String(d).padStart(3) + "km -> kept " + String(keptCount).padStart(5) + " (" + ((keptCount / sites.length) * 100).toFixed(1) + "% of sites)");
  if (diff < best.diff) best = { d, diff, keptIds, keptCount };
}

console.log("Chosen T=" + best.d + "km keeping " + best.keptCount + " sites (" + ((best.keptCount / sites.length) * 100).toFixed(1) + "%)");

const kept = [];
let removed = 0;
for (const r of occ) {
  const hasCoords = r.latitude != null && r.longitude != null && r.latitude !== "" && r.longitude !== "";
  if (r.species === SPECIES && hasCoords && !best.keptIds.has(r.id)) {
    removed++;
    continue;
  }
  kept.push(r);
}
console.log("Total records:", occ.length, "| kept:", kept.length, "| removed:", removed);

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

const occRows = kept.map((r) => ({
  Species: r.species, Latitude: r.latitude, Longitude: r.longitude,
  Country: r.country, Year: r.year, "GBIF occurrence ID": r.gbifId, Citation: r.citation,
}));
const occWs = XLSX.utils.json_to_sheet(occRows);
const occWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(occWb, occWs, "Occurrences");
XLSX.writeFile(occWb, path.join(DATA_DIR, "tick_occurrence_simple.xlsx"));
console.log("Rebuilt Excel from cleaned JSON ->", occRows.length, "rows");
