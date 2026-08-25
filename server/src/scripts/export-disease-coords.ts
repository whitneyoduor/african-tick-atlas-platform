import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();
const MAX_POINTS_PER_DISEASE = 200;

function thinPoints(points: { lat: number; lng: number }[], max: number): { lat: number; lng: number }[] {
  if (points.length <= max) return points;
  const step = points.length / max;
  const thinned: { lat: number; lng: number }[] = [];
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
    select: { species: true, latitude: true, longitude: true },
  });

  const speciesCoordsMap = new Map<string, { lat: number; lng: number }[]>();
  for (const o of occurrences) {
    const sp = o.species!.trim();
    if (!speciesCoordsMap.has(sp)) speciesCoordsMap.set(sp, []);
    speciesCoordsMap.get(sp)!.push({ lat: o.latitude!, lng: o.longitude! });
  }

  const result: Record<string, { points: { lat: number; lng: number }[]; species: string[]; totalPoints: number }> = {};
  let totalDiseases = 0;
  let totalPoints = 0;

  for (const [disease, speciesSet] of diseaseSpeciesMap) {
    const allPoints: { lat: number; lng: number }[] = [];
    const speciesList: string[] = [];
    for (const sp of speciesSet) {
      const coords = speciesCoordsMap.get(sp);
      if (coords && coords.length > 0) {
        allPoints.push(...coords);
        speciesList.push(sp);
      }
    }
    if (allPoints.length > 0) {
      const thinned = thinPoints(allPoints, MAX_POINTS_PER_DISEASE);
      result[disease] = { points: thinned, species: speciesList, totalPoints: allPoints.length };
      totalDiseases++;
      totalPoints += thinned.length;
    }
  }

  const outDir = join(process.cwd(), "public", "genbank");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "disease-coordinates.json");
  writeFileSync(outPath, JSON.stringify(result));

  const sizeMB = (Buffer.byteLength(JSON.stringify(result)) / (1024 * 1024)).toFixed(1);
  console.log(`Exported ${totalDiseases} diseases with ${totalPoints} thinned GPS points (${sizeMB} MB)`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
