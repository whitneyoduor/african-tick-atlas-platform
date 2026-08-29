import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const ROOT = path.resolve(import.meta.dirname, "../../..");
const HEALTH_DIR = path.join(ROOT, "public", "health");

const CCHF_CSV =
  process.env.CCHF_CSV ??
  "C:\\Users\\HP\\Downloads\\Cremean congo HF data 22-07-2025 updated .csv";

const REVIEW_TITLE =
  "Unraveling the epidemiological relationship between ticks and rickettsial infection in Africa";
const REVIEW_DOI = "10.3389/fitd.2022.952024";
const DOGS_TITLE =
  "Sub-clinical infection of dogs from the Ivory Coast and Gabon with Ehrlichia, Anaplasma, Mycoplasma and Rickettsia species";
const DOGS_DOI = "10.1111/j.1469-0691.2008.02237.x";
const SUDAN_TITLE =
  "Multiple Crimean-Congo Hemorrhagic Fever Virus Strains Are Associated with Disease Outbreaks in Sudan, 2008–2009";
const SUDAN_DOI = "10.1371/journal.pntd.0001159";

interface EpiRow {
  species: string;
  country: string;
  disease: string;
  yearOfStudy?: string;
  yearStart?: number;
  yearEnd?: number;
  hosts?: string;
  incidence?: string;
  method: string;
  title: string;
  links?: string;
}

async function epiExists(title: string, country: string, species: string, disease: string) {
  const hit = await prisma.epidemiologicalRecord.findFirst({
    where: { title, country, species, epidemiologicalDisease: disease },
    select: { id: true },
  });
  return !!hit;
}

async function addEpi(rows: EpiRow[]) {
  let added = 0;
  let dup = 0;
  for (const r of rows) {
    if (await epiExists(r.title, r.country, r.species, r.disease)) {
      dup++;
      continue;
    }
    await prisma.epidemiologicalRecord.create({
      data: {
        species: r.species,
        country: r.country,
        yearOfStudy: r.yearOfStudy ?? null,
        yearStart: r.yearStart ?? null,
        yearEnd: r.yearEnd ?? null,
        epidemiologicalDisease: r.disease,
        relatedHosts: r.hosts ?? null,
        epidemiologicalIncidences: r.incidence ?? null,
        methodOfExtraction: r.method,
        title: r.title,
        links: r.links ?? null,
      },
    });
    added++;
  }
  console.log(`    ${added} added, ${dup} already present`);
  return added;
}

function parseCchfCsv(): { points: any[]; byCountry: Map<string, number> } {
  const points: any[] = [];
  const byCountry = new Map<string, number>();
  const header = ["ID FROM EXTRACTER", "incidences", "occurrence", "Lon", "Lat", "Country", "Ectraction method", "DOI"];
  const lines = fs.readFileSync(CCHF_CSV, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  for (const line of lines.slice(1)) {
    const cols: string[] = [];
    for (const cell of line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) cols.push(cell.replace(/^"|"$/g, ""));
    if (cols.length < 8) continue;
    const id = cols[0].trim();
    const incidence = Number(cols[1].trim()) || 0;
    const occurrence = Number(cols[2].trim()) || 0;
    const lng = Number(cols[3].trim());
    const lat = Number(cols[4].trim());
    const country = cols[5].trim();
    const method = cols[6].trim();
    const doi = cols[7].trim();
    if (!isFinite(lat) || !isFinite(lng)) continue;
    points.push({
      source_id: id,
      incidences: incidence,
      occurrence,
      lat,
      lng,
      country,
      method: method || null,
      doi: doi || null,
    });
    byCountry.set(country, (byCountry.get(country) ?? 0) + incidence);
  }
  return { points, byCountry };
}

async function ingestCchf() {
  console.log("[CCHF CSV] parsing", CCHF_CSV);
  const { points, byCountry } = parseCchfCsv();
  console.log(`    ${points.length} case points, ${byCountry.size} countries`);

  fs.mkdirSync(HEALTH_DIR, { recursive: true });
  const geojson = {
    type: "FeatureCollection",
    meta: {
      source: "Crimean-Congo hemorrhagic fever human case occurrence data (digitised)",
      generatedAt: new Date().toISOString(),
      totalPoints: points.length,
      totalsByCountry: Object.fromEntries(byCountry),
    },
    features: points.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        src_id: p.source_id,
        incidences: p.incidences,
        occurrence: p.occurrence,
        country: p.country,
        method: p.method,
        doi: p.doi,
      },
    })),
  };
  const outPath = path.join(HEALTH_DIR, "cchf-cases.geojson");
  fs.writeFileSync(outPath, JSON.stringify(geojson));
  console.log(`    wrote ${path.relative(ROOT, outPath)} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);

  const rows: EpiRow[] = [];
  const CCFH_DISEASE = "Crimean-Congo hemorrhagic fever virus";
  for (const [country, incidences] of byCountry) {
    const epiCountry = country === "Abyei (Sudan/South Sudan border region)" ? "Sudan" : country;
    const title = `Crimean-Congo hemorrhagic fever human cases in ${epiCountry} (digitised case occurrence data)`;
    rows.push({
      species: "Hyalomma rufipes",
      country: epiCountry,
      disease: CCFH_DISEASE,
      yearStart: 2008,
      yearEnd: 2009,
      hosts: "Humans",
      incidence: `${incidences} case${incidences === 1 ? "" : "s"}`,
      method: "Digitized",
      title,
      links: country === "Abyei (Sudan/South Sudan border region)" ? `https://doi.org/${SUDAN_DOI}` : undefined,
    });
  }
  console.log("  [CCHF CSV] epidemiological rows:");
  await addEpi(rows);
}

async function ingestDogStudy() {
  console.log("[PDF1] Ivory Coast & Gabon dog study (2003)");
  const method = "PCR and DNA sequencing";
  const links = `https://doi.org/${DOGS_DOI}`;
  const rows: EpiRow[] = [
    { species: "Rhipicephalus sanguineus", country: "Ivory Coast", disease: "Ehrlichia Canis", yearOfStudy: "2003", hosts: "Dogs", incidence: "10/137 dogs PCR-positive (7.3%)", method, title: DOGS_TITLE, links },
    { species: "Rhipicephalus sanguineus", country: "Ivory Coast", disease: "Anaplasma Platys", yearOfStudy: "2003", hosts: "Dogs", incidence: "2/137 dogs PCR-positive (1.5%)", method, title: DOGS_TITLE, links },
    { species: "Rhipicephalus sanguineus", country: "Gabon", disease: "Anaplasma Platys", yearOfStudy: "2003", hosts: "Dogs", incidence: "3/255 dogs PCR-positive (1.2%)", method, title: DOGS_TITLE, links },
    { species: "Rhipicephalus sanguineus", country: "Gabon", disease: "Mycoplasma haemocanis", yearOfStudy: "2003", hosts: "Dogs", incidence: "114/255 dogs PCR-positive (44.7%)", method, title: DOGS_TITLE, links },
  ];
  await addEpi(rows);
}

async function ingestSudanCchf() {
  console.log("[PDF3] Sudan CCHF outbreaks 2008–2009");
  const links = `https://doi.org/${SUDAN_DOI}`;
  const rows: EpiRow[] = [
    {
      species: "Hyalomma rufipes",
      country: "Sudan",
      disease: "Crimean-Congo hemorrhagic fever virus",
      yearStart: 2008,
      yearEnd: 2008,
      hosts: "Humans",
      method: "RT-PCR; nosocomial outbreak surveillance (Al-fulah District, Western Kordufan)",
      title: SUDAN_TITLE,
      links,
    },
    {
      species: "Hyalomma rufipes",
      country: "Sudan",
      disease: "Crimean-Congo hemorrhagic fever virus",
      yearStart: 2009,
      yearEnd: 2009,
      hosts: "Humans",
      incidence: "7 cases (2 RT-PCR-confirmed, 4 fatal); Group III lineage",
      method: "RT-PCR; complete S, M and L segment sequencing",
      title: SUDAN_TITLE,
      links,
    },
  ];
  await addEpi(rows);
}

async function ingestReview() {
  console.log("[PDF2] Onyiche et al. review — tick–Rickettsia associations");
  const method = "Literature review";
  const links = `https://doi.org/${REVIEW_DOI}`;
  const RA = "Rickettsia Africae";
  const RAE = "Rickettsia Aeschlimannii";
  const RM = "Rickettsia Massiliae";
  const RS = "Rickettsia Spp.";
  const RSB = "Rickettsia Sibirica Mongolotimonae";
  const rows: EpiRow[] = [
    /* Ivory Coast */
    { species: "Amblyomma variegatum", country: "Ivory Coast", disease: RA, hosts: "Cattle, sheep, goats", incidence: ">50% of Amblyomma variegatum ticks PCR-positive", method, title: REVIEW_TITLE, links },
    { species: "Hyalomma impeltatum", country: "Ivory Coast", disease: RA, hosts: "Cattle, camel", method, title: REVIEW_TITLE, links },
    { species: "Hyalomma impeltatum", country: "Ivory Coast", disease: RAE, hosts: "Cattle, camel", method, title: REVIEW_TITLE, links },
    { species: "Hyalomma impressum", country: "Ivory Coast", disease: RA, hosts: "Cattle", method, title: REVIEW_TITLE, links },
    { species: "Hyalomma marginatum", country: "Ivory Coast", disease: RA, hosts: "Cattle, sheep", method, title: REVIEW_TITLE, links },
    { species: "Hyalomma marginatum", country: "Ivory Coast", disease: RAE, hosts: "Cattle, sheep", method, title: REVIEW_TITLE, links },
    { species: "Hyalomma truncatum", country: "Ivory Coast", disease: RA, hosts: "Cattle, camel, sheep", method, title: REVIEW_TITLE, links },
    { species: "Hyalomma truncatum", country: "Ivory Coast", disease: RAE, hosts: "Cattle, camel, sheep", method, title: REVIEW_TITLE, links },
    { species: "Rhipicephalus microplus", country: "Ivory Coast", disease: RA, hosts: "Cattle", method, title: REVIEW_TITLE, links },
    { species: "Rhipicephalus decoloratus", country: "Ivory Coast", disease: RA, hosts: "Cattle, sheep", method, title: REVIEW_TITLE, links },
    { species: "Rhipicephalus geigyi", country: "Ivory Coast", disease: RA, hosts: "Cattle", method, title: REVIEW_TITLE, links },
    { species: "Rhipicephalus sanguineus", country: "Ivory Coast", disease: RA, hosts: "Cattle, dogs", method, title: REVIEW_TITLE, links },
    { species: "Rhipicephalus senegalensis", country: "Ivory Coast", disease: RM, hosts: "Cattle, goats, dogs", method, title: REVIEW_TITLE, links },
    { species: "Rhipicephalus senegalensis", country: "Ivory Coast", disease: RS, hosts: "Cattle, goats, dogs", method, title: REVIEW_TITLE, links },
    { species: "Rhipicephalus sanguineus", country: "Ivory Coast", disease: RM, hosts: "Dogs, sheep", method, title: REVIEW_TITLE, links },
    /* Kenya */
    { species: "Amblyomma gemma", country: "Kenya", disease: RA, hosts: "Cattle, dromedaries", method, title: REVIEW_TITLE, links },
    { species: "Amblyomma lepidum", country: "Kenya", disease: RA, hosts: "Cattle", method, title: REVIEW_TITLE, links },
    { species: "Amblyomma variegatum", country: "Kenya", disease: RA, hosts: "Cattle, sheep, goats", method, title: REVIEW_TITLE, links },
    { species: "Amblyomma hebraeum", country: "Kenya", disease: RA, hosts: "Cattle, goats, dogs", method, title: REVIEW_TITLE, links },
    { species: "Hyalomma rufipes", country: "Kenya", disease: RAE, hosts: "Cattle, camel, horses", method, title: REVIEW_TITLE, links },
    { species: "Hyalomma truncatum", country: "Kenya", disease: RAE, hosts: "Cattle, camel", method, title: REVIEW_TITLE, links },
    { species: "Rhipicephalus pulchellus", country: "Kenya", disease: RAE, hosts: "Cattle, sheep, goats", method, title: REVIEW_TITLE, links },
    { species: "Rhipicephalus evertsi", country: "Kenya", disease: RA, hosts: "Cattle, horses, sheep", method, title: REVIEW_TITLE, links },
    { species: "Rhipicephalus appendiculatus", country: "Kenya", disease: RA, hosts: "Cattle", method, title: REVIEW_TITLE, links },
    { species: "Amblyomma gemma", country: "Kenya", disease: RSB, hosts: "Cattle, dromedaries", method, title: REVIEW_TITLE, links },
    /* Uganda */
    { species: "Amblyomma gemma", country: "Uganda", disease: RA, hosts: "Cattle, dromedaries", method, title: REVIEW_TITLE, links },
    { species: "Amblyomma variegatum", country: "Uganda", disease: RA, hosts: "Cattle", incidence: ">50% of Amblyomma variegatum ticks PCR-positive", method, title: REVIEW_TITLE, links },
    { species: "Amblyomma spp.", country: "Uganda", disease: RA, hosts: "Cattle", method, title: REVIEW_TITLE, links },
    { species: "Haemaphysalis leachi", country: "Uganda", disease: RM, hosts: "Dogs", method, title: REVIEW_TITLE, links },
    { species: "Haemaphysalis leachi", country: "Uganda", disease: RS, hosts: "Dogs", method, title: REVIEW_TITLE, links },
    { species: "Rhipicephalus decoloratus", country: "Uganda", disease: RA, hosts: "Cattle", method, title: REVIEW_TITLE, links },
    { species: "Rhipicephalus appendiculatus", country: "Uganda", disease: RA, hosts: "Cattle", method, title: REVIEW_TITLE, links },
    { species: "Rhipicephalus evertsi", country: "Uganda", disease: RA, hosts: "Cattle", method, title: REVIEW_TITLE, links },
    /* Benin */
    { species: "Amblyomma variegatum", country: "Benin", disease: RA, hosts: "Cattle, sheep, goats", method, title: REVIEW_TITLE, links },
    { species: "Hyalomma rufipes", country: "Benin", disease: RA, hosts: "Cattle", method, title: REVIEW_TITLE, links },
    { species: "Hyalomma truncatum", country: "Benin", disease: RA, hosts: "Cattle", method, title: REVIEW_TITLE, links },
    { species: "Rhipicephalus microplus", country: "Benin", disease: RA, hosts: "Cattle", method, title: REVIEW_TITLE, links },
    { species: "Rhipicephalus evertsi", country: "Benin", disease: RA, hosts: "Cattle", method, title: REVIEW_TITLE, links },
    /* Togo (West Africa / ECOWAS coverage) */
    { species: "Amblyomma variegatum", country: "Togo", disease: RA, hosts: "Cattle, sheep, goats", method, title: REVIEW_TITLE, links },
  ];
  await addEpi(rows);
}

async function ingestGenBankStrains() {
  console.log("[GenBank] Sudanese CCHF strains");
  const species = "Crimean-Congo hemorrhagic fever virus";
  const taxonomy = "Viruses; Riboviria; Orthornavirae; Negarnaviricota; Polyploviricotina; Ellioviricetes; Hareavirales; Nairoviridae; Orthonairovirus";
  const records: any[] = [
    { accession: "GQ862371", gene: "S", def: "Crimean-Congo hemorrhagic fever virus strain Al-fulah 3, S segment, complete sequence", date: "Oct-2008", loc: "Sudan: Al-fulah, Western Kordufan" },
    { accession: "GQ862372", gene: "S", def: "Crimean-Congo hemorrhagic fever virus strain Al-fulah 4, S segment, complete sequence", date: "Oct-2008", loc: "Sudan: Al-fulah, Western Kordufan" },
    { accession: "HQ378184", gene: "M", def: "Crimean-Congo hemorrhagic fever virus strain Al-fulah 3, M segment, complete sequence", date: "Oct-2008", loc: "Sudan: Al-fulah, Western Kordufan" },
    { accession: "HQ378185", gene: "M", def: "Crimean-Congo hemorrhagic fever virus strain Al-fulah 9, M segment, complete sequence", date: "Oct-2008", loc: "Sudan: Al-fulah, Western Kordufan" },
    { accession: "HQ378186", gene: "M", def: "Crimean-Congo hemorrhagic fever virus strain Al-fulah 4, M segment, partial sequence", date: "Oct-2008", loc: "Sudan: Al-fulah, Western Kordufan" },
    { accession: "HQ378180", gene: "L", def: "Crimean-Congo hemorrhagic fever virus strain Al-fulah 3, L segment, complete sequence", date: "Oct-2008", loc: "Sudan: Al-fulah, Western Kordufan" },
    { accession: "HQ378181", gene: "L", def: "Crimean-Congo hemorrhagic fever virus strain Al-fulah 4, L segment, complete sequence", date: "Oct-2008", loc: "Sudan: Al-fulah, Western Kordufan" },
    { accession: "HQ378182", gene: "L", def: "Crimean-Congo hemorrhagic fever virus strain Al-fulah 9, L segment, complete sequence", date: "Oct-2008", loc: "Sudan: Al-fulah, Western Kordufan" },
    { accession: "HQ378179", gene: "S", def: "Crimean-Congo hemorrhagic fever virus strain Abyei 1, S segment, complete sequence", date: "Jun-2009", loc: "Sudan: Dunkop village, Abyei District" },
    { accession: "HQ378187", gene: "M", def: "Crimean-Congo hemorrhagic fever virus strain Abyei 1, M segment, complete sequence", date: "Jun-2009", loc: "Sudan: Dunkop village, Abyei District" },
    { accession: "HQ378183", gene: "L", def: "Crimean-Congo hemorrhagic fever virus strain Abyei 1, L segment, complete sequence", date: "Jun-2009", loc: "Sudan: Dunkop village, Abyei District" },
  ];
  const existing = await prisma.genBankRecord.findMany({
    where: { accession: { in: records.map((r) => r.accession) } },
    select: { accession: true },
  });
  const have = new Set(existing.map((r) => r.accession));
  let added = 0;
  for (const r of records) {
    if (have.has(r.accession)) continue;
    await prisma.genBankRecord.create({
      data: {
        accession: r.accession,
        species,
        organism: species,
        gene: r.gene,
        sequenceLength: null,
        definition: r.def,
        taxonomy,
        collectionDate: r.date,
        country: "Sudan",
        location: r.loc,
        host: "Homo sapiens",
      },
    });
    added++;
  }
  console.log(`    ${added} added, ${records.length - added} already present`);
}

async function main() {
  await ingestCchf();
  await ingestDogStudy();
  await ingestSudanCchf();
  await ingestReview();
  await ingestGenBankStrains();

  const occ = await prisma.epidemiologicalRecord.count();
  const gb = await prisma.genBankRecord.count();
  console.log(`Done. epidemiological_records=${occ}, genbank_records=${gb}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());