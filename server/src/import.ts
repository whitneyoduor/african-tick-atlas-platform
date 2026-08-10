import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import prisma from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.resolve(SERVER_ROOT, "..", "public");
const CHUNK = 2000;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function parseYear(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = parseInt(String(raw), 10);
  return isNaN(n) ? null : n;
}

function parseYearRange(raw: unknown): { start: number | null; end: number | null } {
  const s = String(raw ?? "").trim();
  if (!s) return { start: null, end: null };
  const years = s.match(/\b(19\d\d|20\d\d)\b/g);
  if (!years) return { start: null, end: null };
  const nums = years.map((y) => parseInt(y, 10));
  return { start: nums[0], end: nums.length > 1 ? nums[nums.length - 1] : nums[0] };
}

function cleanString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s === "" || s.toLowerCase() === "nan" ? null : s;
}

function cleanFloat(raw: unknown): number | null {
  const s = cleanString(raw);
  if (s === null) return null;
  const n = Number.parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

async function importOccurrences(filePath: string): Promise<number> {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: null });

  const seen = new Set<string>();
  const records: {
    gbifId: string;
    species: string | null;
    latitude: number | null;
    longitude: number | null;
    country: string | null;
    year: number | null;
    citation: string | null;
  }[] = [];

  for (const r of rows) {
    const gbif = cleanString(r["GBIF occurrence ID"]);
    if (!gbif || seen.has(gbif)) continue;
    seen.add(gbif);
    records.push({
      gbifId: gbif,
      species: cleanString(r["Species"]),
      latitude: cleanFloat(r["Latitude"]),
      longitude: cleanFloat(r["Longitude"]),
      country: cleanString(r["Country"]),
      year: parseYear(r["Year"]),
      citation: cleanString(r["Citation"]),
    });
  }

  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    await prisma.occurrence.createMany({ data: chunk });
  }
  return records.length;
}

async function importEpidemiological(filePath: string): Promise<number> {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: null });

  const records: {
    species: string | null;
    yearOfStudy: string | null;
    yearStart: number | null;
    yearEnd: number | null;
    country: string | null;
    title: string | null;
    links: string | null;
    epidemiologicalDisease: string | null;
    methodOfExtraction: string | null;
    relatedHosts: string | null;
    epidemiologicalIncidences: string | null;
  }[] = [];

  for (const r of rows) {
    const rawYear = r["Year of study"];
    const range = parseYearRange(rawYear);
    records.push({
      species: cleanString(r["Species"]),
      yearOfStudy: rawYear === null || rawYear === undefined ? null : String(rawYear).trim(),
      yearStart: range.start,
      yearEnd: range.end,
      country: cleanString(r["Country"]),
      title: cleanString(r["Title"]),
      links: cleanString(r["Links"]),
      epidemiologicalDisease: cleanString(r["epidemiological disease"]),
      methodOfExtraction: cleanString(r["method of Extraction"]),
      relatedHosts: cleanString(r["related hosts"]),
      epidemiologicalIncidences: cleanString(r["epidemiological incidences"]),
    });
  }

  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    await prisma.epidemiologicalRecord.createMany({ data: chunk });
  }
  return records.length;
}

function groupBy(records: { field: string | null }[], field: string, filterEmpty = true) {
  const counts = new Map<string, number>();
  for (const r of records) {
    const v = (r as any)[field];
    if (filterEmpty && !v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function countSet(records: any[], field: string) {
  return new Set(records.map((r) => r[field]).filter(Boolean)).size;
}

async function writeStaticFiles() {
  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

  const occ = await prisma.occurrence.findMany({
    select: { id: true, gbifId: true, species: true, latitude: true, longitude: true, country: true, year: true, citation: true },
  });
  const epi = await prisma.epidemiologicalRecord.findMany();

  const occMeta = await prisma.occurrence.aggregate({ _min: { year: true }, _max: { year: true } });
  const epiMeta = await prisma.epidemiologicalRecord.aggregate({ _min: { yearStart: true }, _max: { yearEnd: true } });

  const occData = {
    data: occ,
    pagination: { page: 1, limit: 50000, total: occ.length, totalPages: Math.ceil(occ.length / 50000) },
  };
  const occCounts = {
    totalRecords: occ.length,
    yearRange: { min: occMeta._min.year, max: occMeta._max.year },
    species: groupBy(occ, "species"),
    countries: groupBy(occ, "country"),
  };

  let totalIncidence = 0;
  let incidenceCount = 0;
  for (const r of epi) {
    if (r.epidemiologicalIncidences) {
      const v = parseInt(r.epidemiologicalIncidences, 10);
      if (!isNaN(v)) {
        totalIncidence += v;
        incidenceCount++;
      }
    }
  }

  const epiData = {
    data: epi,
    pagination: { page: 1, limit: 50000, total: epi.length, totalPages: Math.ceil(epi.length / 50000) },
  };
  const epiCounts = {
    totalRecords: epi.length,
    yearRange: { min: epiMeta._min.yearStart, max: epiMeta._max.yearEnd },
    incidence: {
      total: totalIncidence,
      count: incidenceCount,
      ratePer1k: incidenceCount > 0 ? parseFloat(((totalIncidence / incidenceCount) * 1000).toFixed(1)) : null,
    },
    species: groupBy(epi, "species"),
    countries: groupBy(epi, "country"),
    hosts: groupBy(epi, "relatedHosts"),
    diseases: groupBy(epi, "epidemiologicalDisease"),
  };

  fs.writeFileSync(path.join(PUBLIC_DIR, "occurrences.json"), JSON.stringify(occData));
  fs.writeFileSync(path.join(PUBLIC_DIR, "occurrences-meta.json"), JSON.stringify(occCounts));
  fs.writeFileSync(path.join(PUBLIC_DIR, "epidemiological.json"), JSON.stringify(epiData));
  fs.writeFileSync(path.join(PUBLIC_DIR, "epidemiological-meta.json"), JSON.stringify(epiCounts));

  console.log("Static files written to", PUBLIC_DIR);
  console.log(`  occurrences.json: ${Math.round(occData.data.length * 100 / 1024)} KB`);
  console.log(`  epidemiological.json: ${Math.round(JSON.stringify(epiData).length / 1024)} KB`);
}

async function main() {
  const occurrenceFile = arg("--occurrences", path.join(SERVER_ROOT, "data", "tick_occurrence_simple.xlsx"));
  const epiFile = arg("--epidemiological", path.join(SERVER_ROOT, "data", "ticks_epidemiological_data.xlsx"));

  if (process.argv.includes("--static-only")) {
    console.log("Regenerating static files from database...");
    await writeStaticFiles();
    console.log("Done.");
    return;
  }

  if (!fs.existsSync(occurrenceFile) || !fs.existsSync(epiFile)) {
    console.error("Input files not found. Expected:", occurrenceFile, epiFile);
    console.error('Pass custom paths with --occurrences <path> --epidemiological <path>');
    process.exit(1);
  }

  console.log("Resetting tables...");
  await prisma.occurrence.deleteMany({});
  await prisma.epidemiologicalRecord.deleteMany({});

  console.log("Importing occurrences:", occurrenceFile);
  const occCount = await importOccurrences(occurrenceFile);
  console.log(`  ${occCount} occurrence records`);

  console.log("Importing epidemiological:", epiFile);
  const epiCount = await importEpidemiological(epiFile);
  console.log(`  ${epiCount} epidemiological records`);

  await writeStaticFiles();

  console.log(`Done. Total: ${occCount} occurrences, ${epiCount} epidemiological records`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
