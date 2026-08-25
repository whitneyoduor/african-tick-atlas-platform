import { PrismaClient } from "@prisma/client";
import { normalizeSpecies } from "../lib/genbank.js";
import fs from "fs";
import path from "path";

const p = new PrismaClient();
const OUT_DIR = path.resolve("../../public/genbank");

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const speciesRows = await p.genBankRecord.groupBy({
    by: ["species"],
    _count: true,
    where: { species: { not: null } },
    orderBy: { species: "asc" },
  });

  console.log(`[Export] ${speciesRows.length} species to export`);

  let exported = 0;
  for (const row of speciesRows) {
    if (!row.species) continue;
    const safeName = row.species.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();

    const records = await p.genBankRecord.findMany({
      where: { species: row.species },
      orderBy: { accession: "asc" },
    });

    const recordsOut = records.map((r) => ({
      id: r.id,
      accession: r.accession,
      species: r.species,
      organism: r.organism,
      gene: r.gene,
      sequenceLength: r.sequenceLength,
      definition: r.definition,
      taxonomy: r.taxonomy,
      collectionDate: r.collectionDate,
      country: r.country,
      location: r.location,
      latitude: r.latitude,
      longitude: r.longitude,
      host: r.host,
    }));

    const geneCounts: Record<string, number> = {};
    const countryCounts: Record<string, number> = {};
    const hostCounts: Record<string, number> = {};
    const lengths: number[] = [];
    const geneLengthSums: Record<string, { total: number; count: number }> = {};

    for (const r of records) {
      if (r.gene) geneCounts[r.gene] = (geneCounts[r.gene] || 0) + 1;
      if (r.country) countryCounts[r.country] = (countryCounts[r.country] || 0) + 1;
      if (r.host) hostCounts[r.host] = (hostCounts[r.host] || 0) + 1;
      if (r.sequenceLength) {
        lengths.push(r.sequenceLength);
        const g = r.gene || "Unknown";
        if (!geneLengthSums[g]) geneLengthSums[g] = { total: 0, count: 0 };
        geneLengthSums[g].total += r.sequenceLength;
        geneLengthSums[g].count++;
      }
    }

    const stats = {
      total: records.length,
      genes: Object.entries(geneCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
      countries: Object.entries(countryCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
      hosts: Object.entries(hostCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
      geneAvgLength: Object.entries(geneLengthSums)
        .filter(([_, v]) => v.count > 0)
        .map(([gene, v]) => ({ gene, avgBp: Math.round(v.total / v.count), count: v.count }))
        .sort((a, b) => b.count - a.count),
      sequenceLength:
        lengths.length > 0
          ? {
              min: Math.min(...lengths),
              max: Math.max(...lengths),
              mean: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
            }
          : null,
    };

    const response = {
      species: row.species,
      total: records.length,
      page: 1,
      limit: 200,
      totalPages: 1,
      records: recordsOut.map((r) => ({ record: r, distanceKm: null })),
    };

    fs.writeFileSync(
      path.join(OUT_DIR, `${safeName}.json`),
      JSON.stringify(response)
    );
    fs.writeFileSync(
      path.join(OUT_DIR, `${safeName}_stats.json`),
      JSON.stringify(stats)
    );

    exported++;
    if (exported % 20 === 0) {
      console.log(`[Export] ${exported}/${speciesRows.length} done`);
    }
  }

  const indexMap: Record<string, string> = {};
  for (const row of speciesRows) {
    if (!row.species) continue;
    const safeName = row.species.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    indexMap[row.species] = safeName;
  }
  fs.writeFileSync(
    path.join(OUT_DIR, "_index.json"),
    JSON.stringify(indexMap)
  );

  console.log(`[Export] Done! ${exported} species exported to ${OUT_DIR}`);
  await p.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
