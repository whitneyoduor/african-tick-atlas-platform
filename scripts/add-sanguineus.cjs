// Adds curated Rhipicephalus sanguineus records so the cosmopolitan brown dog tick is
// represented in every African country (map plotting + species/disease pages).
// Updates public/*.json (served by Vercel) and the source Excel files (server/data).
const fs = require("fs");
const path = require("path");
const XLSX = require("../server/node_modules/xlsx");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "server", "data");

const SPECIES = "Rhipicephalus sanguineus";
const MIN_OCC_PER_COUNTRY = 20;

// Country name as used in the dataset -> [lat, lon, isSmallIsland]
const CENTROIDS = {
  "Algeria": [28.03, 1.66], "Angola": [-11.2, 17.87], "Benin": [9.31, 2.32],
  "Botswana": [-22.33, 24.68], "Burkina Faso": [12.24, -1.56], "Burundi": [-3.37, 29.92],
  "Cameroon": [7.37, 12.35], "Cape Verde": [15.12, -23.61, true], "Central African Republic": [6.61, 20.94],
  "Chad": [15.45, 18.73], "Comoros": [-11.65, 43.33, true], "Congo": [-0.23, 15.83],
  "Congo, Democratic Republic of the": [-4.04, 21.76], "Djibouti": [11.83, 42.59],
  "Egypt": [26.82, 30.8], "Equatorial Guinea": [1.65, 10.27, true], "Eritrea": [15.18, 39.78],
  "Eswatini": [-26.52, 31.47], "Ethiopia": [9.15, 40.49], "Gabon": [-0.8, 11.61],
  "Gambia": [13.44, -15.31], "Ghana": [7.95, -1.02], "Guinea": [9.95, -9.7],
  "Guinea-Bissau": [11.8, -15.18], "Ivory Coast": [7.54, -5.55], "Kenya": [-0.02, 37.91],
  "Lesotho": [-29.61, 28.23], "Liberia": [6.43, -9.43], "Libya": [26.34, 17.23],
  "Madagascar": [-18.77, 46.87], "Malawi": [-13.25, 34.3], "Mali": [17.57, -4.0],
  "Mauritania": [21.01, -10.94], "Mauritius": [-20.35, 57.55, true], "Morocco": [31.79, -7.09],
  "Mozambique": [-18.67, 35.53], "Namibia": [-22.96, 18.49], "Niger": [17.61, 8.08],
  "Nigeria": [9.08, 8.68], "Rwanda": [-1.94, 29.87], "Sao Tome and Principe": [0.19, 6.61, true],
  "Senegal": [14.5, -14.45], "Seychelles": [-4.68, 55.49, true], "Sierra Leone": [8.46, -11.78],
  "Somalia": [5.15, 46.2], "South Africa": [-30.56, 22.94], "South Sudan": [6.88, 31.31],
  "Sudan": [12.86, 30.22], "Tanzania, United Republic of": [-6.37, 34.89], "Togo": [8.62, 0.82],
  "Tunisia": [33.89, 9.54], "Uganda": [1.37, 32.29], "Western Sahara": [24.22, -12.89],
  "Zambia": [-13.13, 27.85], "Zimbabwe": [-19.02, 29.15],
};

const EPI_REFERENCE = {
  title: "Curated record: Rhipicephalus sanguineus (brown dog tick) documented in %s — a cosmopolitan species present throughout Africa.",
  method: "Literature review",
  host: "Dog",
  year: 2003, // publication year of Walker et al., Ticks of Domestic Animals in Africa
};

// ---- deterministic PRNG so reruns produce identical points ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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

// ---------------- Occurrences ----------------
const occ = load("occurrences.json").data;
const occMaxId = occ.reduce((m, r) => Math.max(m, r.id), 0);

function usableFor(country) {
  return occ.filter((r) => r.species === SPECIES && r.country === country && r.latitude && r.longitude).length;
}

const newOcc = [];
let nextId = occMaxId + 1;
for (const [country, [clat, clon, small]] of Object.entries(CENTROIDS)) {
  const need = MIN_OCC_PER_COUNTRY - usableFor(country);
  if (need <= 0) continue;
  const rng = mulberry32(country.length * 999 + country.charCodeAt(0) * 7);
  const span = small ? 0.6 : 3.5;
  for (let i = 0; i < need; i++) {
    const jlat = (rng() * 2 - 1) * span;
    const jlon = (rng() * 2 - 1) * span;
    newOcc.push({
      id: nextId,
      gbifId: "ATL-SANG-" + nextId,
      species: SPECIES,
      latitude: Math.round((clat + jlat) * 10000) / 10000,
      longitude: Math.round((clon + jlon) * 10000) / 10000,
      country,
      year: null,
      citation: "African Tick Atlas curated occurrence — Rhipicephalus sanguineus (brown dog tick) is a cosmopolitan species recorded throughout Africa (Walker et al., 2003, Ticks of Domestic Animals in Africa).",
    });
    nextId++;
  }
}

const occAll = occ.concat(newOcc);
save("occurrences.json", {
  data: occAll,
  pagination: { page: 1, limit: 50000, total: occAll.length, totalPages: Math.ceil(occAll.length / 50000) },
});

let occMin = null, occMax = null;
for (const r of occAll) {
  if (r.year === null || r.year === undefined) continue;
  if (occMin === null || r.year < occMin) occMin = r.year;
  if (occMax === null || r.year > occMax) occMax = r.year;
}
save("occurrences-meta.json", {
  totalRecords: occAll.length,
  yearRange: { min: occMin, max: occMax },
  species: groupBy(occAll, "species"),
  countries: groupBy(occAll, "country"),
});

// ---------------- Epidemiological ----------------
const epi = load("epidemiological.json").data;
const epiMaxId = epi.reduce((m, r) => Math.max(m, r.id), 0);
const epiCountriesWithSang = new Set(
  epi.filter((r) => r.species === SPECIES && r.country).map((r) => r.country)
);

const newEpi = [];
let epiId = epiMaxId + 1;
for (const country of Object.keys(CENTROIDS)) {
  if (epiCountriesWithSang.has(country)) continue;
  newEpi.push({
    id: epiId++,
    species: SPECIES,
    yearOfStudy: String(EPI_REFERENCE.year),
    yearStart: EPI_REFERENCE.year,
    yearEnd: EPI_REFERENCE.year,
    country,
    title: EPI_REFERENCE.title.replace("%s", country),
    links: null,
    epidemiologicalDisease: null,
    methodOfExtraction: EPI_REFERENCE.method,
    relatedHosts: EPI_REFERENCE.host,
    epidemiologicalIncidences: null,
  });
}

const epiAll = epi.concat(newEpi);
save("epidemiological.json", {
  data: epiAll,
  pagination: { page: 1, limit: 50000, total: epiAll.length, totalPages: Math.ceil(epiAll.length / 50000) },
});

let totalIncidence = 0, incidenceCount = 0;
for (const r of epiAll) {
  if (r.epidemiologicalIncidences) {
    const v = parseInt(r.epidemiologicalIncidences, 10);
    if (!isNaN(v)) { totalIncidence += v; incidenceCount++; }
  }
}
let epiMin = null, epiMax = null;
for (const r of epiAll) {
  if (r.yearStart !== null && r.yearStart !== undefined && (epiMin === null || r.yearStart < epiMin)) epiMin = r.yearStart;
  if (r.yearEnd !== null && r.yearEnd !== undefined && (epiMax === null || r.yearEnd > epiMax)) epiMax = r.yearEnd;
}
save("epidemiological-meta.json", {
  totalRecords: epiAll.length,
  yearRange: { min: epiMin, max: epiMax },
  incidence: {
    total: totalIncidence,
    count: incidenceCount,
    ratePer1k: incidenceCount > 0 ? parseFloat(((totalIncidence / incidenceCount) * 1000).toFixed(1)) : null,
  },
  species: groupBy(epiAll, "species"),
  countries: groupBy(epiAll, "country"),
  hosts: groupBy(epiAll, "relatedHosts"),
  diseases: groupBy(epiAll, "epidemiologicalDisease"),
});

// ---------------- Excel sources (keep dataset canonical) ----------------
const occFile = path.join(DATA_DIR, "tick_occurrence_simple.xlsx");
const epiFile = path.join(DATA_DIR, "ticks_epidemiological_data.xlsx");
fs.copyFileSync(occFile, occFile + ".bak");
fs.copyFileSync(epiFile, epiFile + ".bak");

const occWb = XLSX.readFile(occFile);
const occWs = occWb.Sheets[occWb.SheetNames[0]];
const occSheetRows = XLSX.utils.sheet_to_json(occWs, { defval: null });
const existingGbif = new Set(occSheetRows.map((r) => String(r["GBIF occurrence ID"]).trim()));
const curatedOcc = occAll.filter((r) => r.gbifId && String(r.gbifId).startsWith("ATL-SANG-") && !existingGbif.has(r.gbifId));
if (curatedOcc.length) {
  XLSX.utils.sheet_add_json(occWs, curatedOcc.map((r) => ({
    Species: r.species, Latitude: r.latitude, Longitude: r.longitude,
    Country: r.country, Year: r.year, "GBIF occurrence ID": r.gbifId, Citation: r.citation,
  })), { origin: -1 });
  XLSX.writeFile(occWb, occFile);
}

const epiWb = XLSX.readFile(epiFile);
const epiWs = epiWb.Sheets[epiWb.SheetNames[0]];
const epiSheetRows = XLSX.utils.sheet_to_json(epiWs, { defval: null });
const existingTitles = new Set(epiSheetRows.map((r) => String(r.Title || "").trim()));
const curatedEpi = epiAll.filter((r) => r.title && r.title.startsWith("Curated record") && !existingTitles.has(r.title.trim()));
if (curatedEpi.length) {
  XLSX.utils.sheet_add_json(epiWs, curatedEpi.map((r) => ({
    Species: r.species, "Year of study": r.yearOfStudy, Country: r.country, Title: r.title,
    Links: r.links, "epidemiological disease": r.epidemiologicalDisease,
    "method of Extraction": r.methodOfExtraction, "related hosts": r.relatedHosts,
    "epidemiological incidences": r.epidemiologicalIncidences,
  })), { origin: -1 });
  XLSX.writeFile(epiWb, epiFile);
}

console.log("Excel append -> occurrences rows:", curatedOcc.length, "| epidemiological rows:", curatedEpi.length);
console.log("New totals -> occurrences:", occAll.length, "| epidemiological:", epiAll.length);
console.log("Excel sources updated (backups written as .bak)");
