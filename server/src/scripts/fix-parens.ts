import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function fixUnbalancedParens(name: string): string {
  let open = 0;
  for (const ch of name) {
    if (ch === "(") open++;
    if (ch === ")") open--;
  }
  if (open < 0) {
    name = name.replace(/\)$/, "");
  }
  if (open > 0) {
    name = name + ")";
  }
  return name;
}

async function main() {
  const records = await prisma.epidemiologicalRecord.findMany({
    where: { epidemiologicalDisease: { not: null } },
    select: { id: true, epidemiologicalDisease: true },
  });

  let updated = 0;
  for (const r of records) {
    const raw = r.epidemiologicalDisease!;
    const fixed = fixUnbalancedParens(raw);
    if (fixed !== raw) {
      await prisma.epidemiologicalRecord.update({
        where: { id: r.id },
        data: { epidemiologicalDisease: fixed },
      });
      updated++;
      console.log(`  "${raw}" → "${fixed}"`);
    }
  }

  console.log(`\nFixed ${updated} records with unbalanced parens.`);

  const final = await prisma.epidemiologicalRecord.groupBy({
    by: ["epidemiologicalDisease"],
    _count: true,
    orderBy: { _count: { epidemiologicalDisease: "desc" } },
    where: { epidemiologicalDisease: { not: null } },
  });

  console.log(`\n=== FINAL: ${final.length} unique diseases ===`);
  for (const d of final) {
    console.log(`  ${d._count}\t${d.epidemiologicalDisease}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
