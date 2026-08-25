import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function cleanDiseaseName(raw: string): string {
  let name = raw.trim();

  name = name.replace(/^\(/, "").replace(/\)$/, "");
  name = name.replace(/\)+$/, "");
  name = name.replace(/\(/g, " (");
  name = name.replace(/\s+/g, " ").trim();

  const aliases: Record<string, string> = {
    "Cchfv": "Crimean-Congo hemorrhagic fever virus",
    "Cchfv)": "Crimean-Congo hemorrhagic fever virus",
    "cchfv": "Crimean-Congo hemorrhagic fever virus",
    "Rickettsia Spp.": "Rickettsia spp.",
    "Rickettsia": "Rickettsia spp.",
    "Rickettsiae": "Rickettsia spp.",
    "Sfg Rickettsia Spp.": "Spotted fever group Rickettsia spp.",
    "Anaplasma Spp.": "Anaplasma spp.",
    "Anaplasma": "Anaplasma spp.",
    "Ehrlichia Spp.": "Ehrlichia spp.",
    "Coxiella Spp.": "Coxiella spp.",
    "Coxiella-Like Endosymbionts": "Coxiella-like endosymbionts",
    "Q Fever": "Q fever",
    "East Coast Fever": "East coast fever",
    "Swine Fever": "African swine fever",
    "Anaemia": "Tick-borne anaemia",
    "Lyme Disease": "Lyme disease",
    "Lyme Disease Spirochete": "Lyme disease",
    "African Tick-Bite Fever": "African tick-bite fever",
    "Tick-Borne Relapsing Fever": "Tick-borne relapsing fever",
    "Relapsing Fever Borreliosis": "Tick-borne relapsing fever",
    "Rickettsial Diseases": "Rickettsia spp.",
    "Diverse Arboviruses": "Arboviruses (diverse)",
    "Neoehrlichia Spp.": "Neoehrlichia spp.",
    "Rickettsia Spp, Bartonella Spp. ,Anaplasma Phagocytophilum": "Rickettsia spp., Bartonella spp., Anaplasma phagocytophilum",
  };

  if (aliases[name]) return aliases[name];

  if (name.endsWith(" Spp.")) {
    name = name.replace(/ Spp\.$/, " spp.");
  }
  if (name.endsWith(" Spp")) {
    name = name.replace(/ Spp$/, " spp.");
  }

  return name;
}

async function main() {
  const records = await prisma.epidemiologicalRecord.findMany({
    where: { epidemiologicalDisease: { not: null } },
    select: { id: true, epidemiologicalDisease: true },
  });

  const changes: { old: string; new: string; count: number }[] = [];
  const changeMap = new Map<string, string>();

  for (const r of records) {
    const raw = r.epidemiologicalDisease!;
    const cleaned = cleanDiseaseName(raw);
    if (cleaned !== raw) {
      changeMap.set(raw, cleaned);
    }
  }

  for (const [old, new_] of changeMap) {
    const count = records.filter(r => r.epidemiologicalDisease === old).length;
    changes.push({ old, new: new_, count });
  }

  changes.sort((a, b) => b.count - a.count);

  console.log(`Found ${changes.length} disease names to normalize across ${records.length} total records:\n`);
  for (const c of changes) {
    console.log(`  "${c.old}" → "${c.new}" (${c.count} records)`);
  }

  let updated = 0;
  for (const c of changes) {
    const result = await prisma.epidemiologicalRecord.updateMany({
      where: { epidemiologicalDisease: c.old },
      data: { epidemiologicalDisease: c.new },
    });
    updated += result.count;
  }

  console.log(`\nUpdated ${updated} records.`);

  const remaining = await prisma.epidemiologicalRecord.groupBy({
    by: ["epidemiologicalDisease"],
    _count: true,
    orderBy: { _count: { epidemiologicalDisease: "desc" } },
    where: { epidemiologicalDisease: { not: null } },
  });

  console.log(`\n=== FINAL DISEASE NAMES (${remaining.length} unique) ===`);
  for (const d of remaining) {
    console.log(`  ${d._count}\t${d.epidemiologicalDisease}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
