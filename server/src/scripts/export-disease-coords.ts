import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();
const MAX_POINTS_PER_DISEASE = 300;

const AFRICAN_COUNTRIES = new Set([
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cameroon", "Central African Republic", "Chad", "Comoros",
  "Congo", "Congo, Democratic Republic of the", "Democratic Republic of the Congo",
  "Côte d'Ivoire", "Ivory Coast",
  "Djibouti", "Egypt", "Equatorial Guinea", "Eritrea", "Eswatini", "Swaziland",
  "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea", "Guinea-Bissau",
  "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi",
  "Mali", "Mauritania", "Mauritius", "Mayotte", "Morocco", "Mozambique",
  "Namibia", "Niger", "Nigeria", "Réunion", "Rwanda",
  "Sao Tome and Principe", "Senegal", "Seychelles", "Sierra Leone",
  "Somalia", "South Africa", "South Sudan", "Sudan",
  "Tanzania, United Republic of", "United Republic of Tanzania",
  "Togo", "Tunisia", "Uganda",
  "Western Sahara", "Zambia", "Zimbabwe",
]);

const BOX = { minLat: -35, maxLat: 37, minLng: -20, maxLng: 55 };

function isAfricanPoint(country: string | null, lat: number, lng: number): boolean {
  if (country) return AFRICAN_COUNTRIES.has(country.trim());
  return lat >= BOX.minLat && lat <= BOX.maxLat && lng >= BOX.minLng && lng <= BOX.maxLng;
}

export interface DiseasePoint {
  lat: number;
  lng: number;
  species: string;
  country?: string;
  year?: number;
}

function thinPoints(points: DiseasePoint[], max: number): DiseasePoint[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const thinned: DiseasePoint[] = [];
  for (let i = 0; i < max; i++) {
    thinned.push(points[Math.floor(i * step)]);
  }
  return thinned;
}

async function main() {
  const epiRecords = await prisma.epidemiologicalRecord.findMany({
    where: { epidemiologicalDisease: { not: null }, species: { not: null } },
    select: { epidemiologicalDisease: true, species: true },
  });

  const diseaseSpeciesMap = new Map<string, Set<string>>();
  for (const r of epiRecords) {
    const disease = r.epidemiologicalDisease!.trim();
    const species = r.species!.trim();
    if (!diseaseSpeciesMap.has(disease)) diseaseSpeciesMap.set(disease, new Set());
    diseaseSpeciesMap.get(disease)!.add(species);
  }

  const allSpecies = [...new Set(epiRecords.map(r => r.species!.trim()))];
  const occurrences = await prisma.occurrence.findMany({
    where: { species: { in: allSpecies }, latitude: { not: null }, longitude: { not: null } },
    select: { species: true, latitude: true, longitude: true, country: true, year: true },
  });

  const speciesCoordsMap = new Map<string, DiseasePoint[]>();
  let dropped = 0;
  for (const o of occurrences) {
    const lat = o.latitude!;
    const lng = o.longitude!;
    if (!isAfricanPoint(o.country, lat, lng)) {
      dropped++;
      continue;
    }
    const sp = o.species!.trim();
    if (!speciesCoordsMap.has(sp)) speciesCoordsMap.set(sp, []);
    const point: DiseasePoint = { lat, lng, species: sp };
    if (o.country) point.country = o.country.trim();
    if (o.year) point.year = o.year;
    speciesCoordsMap.get(sp)!.push(point);
  }

  const result: Record<string, { points: DiseasePoint[]; species: string[]; totalPoints: number }> = {};
  let totalDiseases = 0;
  let totalPoints = 0;

  for (const [disease, speciesSet] of diseaseSpeciesMap) {
    const perSpecies: { sp: string; pts: DiseasePoint[] }[] = [];
    for (const sp of speciesSet) {
      const coords = speciesCoordsMap.get(sp);
      if (coords && coords.length > 0) perSpecies.push({ sp, pts: coords });
    }
    const allPoints = perSpecies.flatMap(p => p.pts);
    if (allPoints.length === 0) continue;

    const out: DiseasePoint[] = [];
    if (allPoints.length <= MAX_POINTS_PER_DISEASE) {
      out.push(...allPoints);
    } else {
      perSpecies.sort((a, b) => b.pts.length - a.pts.length);
      let budget = MAX_POINTS_PER_DISEASE;
      let remaining = perSpecies.length;
      for (const { pts } of perSpecies) {
        const cap = Math.ceil(budget / remaining);
        const take = Math.min(pts.length, cap);
        out.push(...thinPoints(pts, take));
        budget -= take;
        remaining--;
      }
    }

    result[disease] = {
      points: out,
      species: perSpecies.map(p => p.sp),
      totalPoints: allPoints.length,
    };
    totalDiseases++;
    totalPoints += out.length;
  }

  const outDir = join(import.meta.dirname, "../../../public", "genbank");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "disease-coordinates.json");
  writeFileSync(outPath, JSON.stringify(result));

  const sizeMB = (Buffer.byteLength(JSON.stringify(result)) / (1024 * 1024)).toFixed(1);
  console.log(`Dropped ${dropped} non-African points; exported ${totalDiseases} diseases with ${totalPoints} thinned GPS points (${sizeMB} MB)`);
}

main().catch(console.error).finally(() => prisma.$disconnect());