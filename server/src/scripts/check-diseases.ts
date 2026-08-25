import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const diseases = await p.epidemiologicalRecord.groupBy({
  by: ["epidemiologicalDisease"],
  _count: true,
  orderBy: { _count: { epidemiologicalDisease: "desc" } },
  where: { epidemiologicalDisease: { not: null } },
});

console.log("=== ALL DISEASE NAMES + COUNTS ===");
for (const d of diseases) {
  console.log(`${d._count}\t${d.epidemiologicalDisease}`);
}

console.log("\n=== COUNTRY SAMPLE FOR EACH DISEASE ===");
const diseaseNames = diseases.map(d => d.epidemiologicalDisease!);
for (const disease of diseaseNames) {
  const countries = await p.epidemiologicalRecord.groupBy({
    by: ["country"],
    _count: true,
    where: { epidemiologicalDisease: disease },
    orderBy: { _count: { country: "desc" } },
  });
  const countryList = countries.filter(c => c.country).map(c => `${c.country}(${c._count})`).join(", ");
  console.log(`${disease}: ${countryList}`);
}

console.log("\n=== CCHFV VARIANTS (case insensitive) ===");
const cchfv = await p.epidemiologicalRecord.findMany({
  where: {
    OR: [
      { epidemiologicalDisease: { contains: "CCHF" } },
      { epidemiologicalDisease: { contains: "cchf" } },
      { epidemiologicalDisease: { contains: "Crimean" } },
      { epidemiologicalDisease: { contains: "crimean" } },
      { epidemiologicalDisease: { contains: "Congo" } },
    ],
  },
  select: { epidemiologicalDisease: true, country: true, species: true },
  take: 50,
});
for (const r of cchfv) {
  console.log(`Disease: "${r.epidemiologicalDisease}" | Country: "${r.country}" | Species: "${r.species}"`);
}

console.log("\n=== FIELDS WITH COORDS? ===");
const withLat = await p.epidemiologicalRecord.count({ where: { country: { not: null } } });
const total = await p.epidemiologicalRecord.count();
console.log(`Total records: ${total}, Records with country: ${withLat}`);

await p.$disconnect();
