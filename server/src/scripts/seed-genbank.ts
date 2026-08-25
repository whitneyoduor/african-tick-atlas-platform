import { PrismaClient } from "@prisma/client";
import { fetchAndStoreGenBank, normalizeSpecies } from "../lib/genbank.js";

const p = new PrismaClient();
const DELAY = 350;

async function main() {
  const speciesRows = await p.occurrence.findMany({
    select: { species: true },
    distinct: ["species"],
    where: { species: { not: null } },
  });

  const allSpecies = speciesRows
    .map((r) => r.species)
    .filter((s): s is string => !!s && s.trim().length > 0)
    .map((s) => normalizeSpecies(s));

  console.log(`[GenBank] ${allSpecies.length} species total`);

  const existingGroups = await p.genBankRecord.groupBy({
    by: ["species"],
    _count: true,
    where: { species: { not: null } },
  });
  const existingMap = new Map(existingGroups.map((g) => [g.species, g._count]));
  console.log(`[GenBank] ${existingMap.size} species already seeded`);

  const toSeed = allSpecies.filter((s) => {
    const count = existingMap.get(s) || 0;
    return count < 5;
  });

  console.log(`[GenBank] ${toSeed.length} species need seeding (${allSpecies.length - toSeed.length} already done)`);

  let ok = 0, fail = 0;
  for (let i = 0; i < toSeed.length; i++) {
    const sp = toSeed[i];
    process.stdout.write(`[${i + 1}/${toSeed.length}] ${sp}...`);
    try {
      const records = await fetchAndStoreGenBank(sp);
      console.log(` ${records.length} records`);
      ok++;
    } catch (err) {
      console.log(` FAILED: ${err instanceof Error ? err.message : err}`);
      fail++;
    }
    if (i < toSeed.length - 1) await new Promise((r) => setTimeout(r, DELAY));
  }

  console.log(`\n[GenBank] Done: ${ok} ok, ${fail} failed`);
  const total = await p.genBankRecord.count();
  console.log(`[GenBank] Total records in DB: ${total}`);
  await p.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
