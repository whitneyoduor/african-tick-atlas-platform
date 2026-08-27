import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = path.resolve(
  __dirname,
  "../../../../African_Tick_Atlas_ADM2_Monthly_Rc_AllSpecies.csv"
);
const OUT_DIR = path.resolve(__dirname, "../../../public/rc-data");

const SPECIES_NAMES: Record<string, string> = {
  Avariegatum: "Amblyomma variegatum",
  Hmarginatum: "Hyalomma marginatum",
  Rappendiculatus: "Rhipicephalus appendiculatus",
  Rmicroplus: "Rhipicephalus microplus",
};

interface SpeciesData {
  monthly: number[];
  annual_mean: number;
  annual_max: number;
  seasonal_min: number;
  seasonal_max: number;
  peak_month: string;
  peak_month_n: number;
  persistence_months: number;
  persistence_fraction: number;
  seasonal_index: number;
}

interface Adm2Entry {
  gid_1: string;
  name_1: string;
  gid_2: string;
  name_2: string;
  data: Record<string, SpeciesData>;
}

interface CountryData {
  gid: string;
  country: string;
  species_list: string[];
  adm2: Adm2Entry[];
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function main() {
  console.log("Reading CSV:", CSV_PATH);
  const content = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  const header = parseCsvLine(lines[0]);
  console.log("Header columns:", header.length, header);

  const colIdx: Record<string, number> = {};
  header.forEach((h, i) => (colIdx[h.replace(/"/g, "").trim()] = i));

  const countries = new Map<string, CountryData>();
  let rowCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    if (parts.length < 14) continue;

    const clean = (s: string) => s.replace(/^"|"$/g, "").trim();

    const gid0 = clean(parts[colIdx["GID_0"]]);
    const country = clean(parts[colIdx["COUNTRY"]]);
    const gid1 = clean(parts[colIdx["GID_1"]]);
    const name1 = clean(parts[colIdx["NAME_1"]]);
    const gid2 = clean(parts[colIdx["GID_2"]]);
    const name2 = clean(parts[colIdx["NAME_2"]]);
    const species = clean(parts[colIdx["species"]]);
    const monthAbbr = clean(parts[colIdx["month_abbr"]]);
    const meanRc = parseFloat(parts[colIdx["mean_Rc"]]) || 0;
    const monthNum = parseInt(parts[colIdx["month_number"]]) || 0;
    const monthFull = clean(parts[colIdx["month"]]);
    const annualMean = parseFloat(parts[colIdx["annual_mean_Rc"]]) || 0;
    const annualMax = parseFloat(parts[colIdx["annual_max_Rc"]]) || 0;
    const seasonalMin = parseFloat(parts[colIdx["seasonal_min_Rc"]]) || 0;
    const seasonalMax = parseFloat(parts[colIdx["seasonal_max_Rc"]]) || 0;
    const peakMonthNum = parseInt(parts[colIdx["peak_month_number"]]) || 0;
    const peakMonth = clean(parts[colIdx["peak_month"]]);
    const persistenceMonths = parseInt(parts[colIdx["persistence_months"]]) || 0;
    const persistenceFrac = parseFloat(parts[colIdx["persistence_fraction"]]) || 0;
    const seasonalIdx = parseFloat(parts[colIdx["seasonal_index"]]) || 0;

    void monthFull;

    if (!countries.has(gid0)) {
      countries.set(gid0, {
        gid: gid0,
        country,
        species_list: [],
        adm2: [],
      });
    }
    const ctry = countries.get(gid0)!;

    let adm2 = ctry.adm2.find((a) => a.gid_2 === gid2);
    if (!adm2) {
      adm2 = { gid_1: gid1, name_1: name1, gid_2: gid2, name_2: name2, data: {} };
      ctry.adm2.push(adm2);
    }

    if (!adm2.data[species]) {
      adm2.data[species] = {
        monthly: [],
        annual_mean: annualMean,
        annual_max: annualMax,
        seasonal_min: seasonalMin,
        seasonal_max: seasonalMax,
        peak_month: peakMonth,
        peak_month_n: peakMonthNum,
        persistence_months: persistenceMonths,
        persistence_fraction: persistenceFrac,
        seasonal_index: seasonalIdx,
      };
    }

    adm2.data[species].monthly.push(Math.round(meanRc * 1000) / 1000);

    if (!ctry.species_list.includes(species)) {
      ctry.species_list.push(species);
    }

    rowCount++;
    if (rowCount % 50000 === 0) console.log(`  ...${rowCount} rows processed`);
  }

  console.log(`Total rows: ${rowCount}`);
  console.log(`Countries: ${countries.size}`);

  fs.mkdirSync(path.join(OUT_DIR, "countries"), { recursive: true });

  const indexCountries: { gid: string; name: string; adm2_count: number; species: string[] }[] = [];

  for (const [gid, ctry] of countries) {
    ctry.species_list.sort();
    for (const adm2 of ctry.adm2) {
      for (const sp of ctry.species_list) {
        if (adm2.data[sp]) {
          adm2.data[sp].monthly = Array.from(
            { length: 12 },
            (_, k) =>
              (adm2.data[sp]!.monthly as unknown as number[])[k] ?? 0
          );
        }
      }
    }

    const outPath = path.join(OUT_DIR, "countries", `${gid}.json`);
    fs.writeFileSync(outPath, JSON.stringify(ctry));
    console.log(`  Written: ${gid}.json (${ctry.adm2.length} ADM2, ${ctry.species_list.length} species)`);

    indexCountries.push({
      gid,
      name: ctry.country,
      adm2_count: ctry.adm2.length,
      species: ctry.species_list,
    });
  }

  indexCountries.sort((a, b) => a.name.localeCompare(b.name));

  const index = {
    countries: indexCountries,
    species: SPECIES_NAMES,
  };

  fs.writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify(index, null, 2));
  console.log(`\nIndex written: ${OUT_DIR}/index.json`);
  console.log("Done!");
}

main();
