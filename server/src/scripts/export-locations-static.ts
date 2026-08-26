import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const p = new PrismaClient();
const OUT_DIR = path.resolve(import.meta.dirname, "../../../public/locations");

const AFRICAN_COUNTRIES = new Set([
  "Algeria", "Angola", "Benin", "Botswana", "Burkina Faso", "Burundi",
  "Cabo Verde", "Cameroon", "Central African Republic", "Chad", "Comoros",
  "Congo", "Congo, Democratic Republic of the", "Côte d'Ivoire",
  "Djibouti", "Egypt", "Equatorial Guinea", "Eritrea", "Eswatini",
  "Ethiopia", "Gabon", "Gambia", "Ghana", "Guinea", "Guinea-Bissau",
  "Kenya", "Lesotho", "Liberia", "Libya", "Madagascar", "Malawi",
  "Mali", "Mauritania", "Mauritius", "Mayotte", "Morocco", "Mozambique",
  "Namibia", "Niger", "Nigeria", "Réunion", "Rwanda",
  "Sao Tome and Principe", "Senegal", "Seychelles", "Sierra Leone",
  "Somalia", "South Africa", "South Sudan", "Sudan",
  "Tanzania, United Republic of", "Togo", "Tunisia", "Uganda",
  "Western Sahara", "Zambia", "Zimbabwe",
]);

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const [occRows, epiRows] = await Promise.all([
    p.occurrence.findMany({
      where: { country: { not: null }, species: { not: null } },
      select: { species: true, country: true },
    }),
    p.epidemiologicalRecord.findMany({
      where: { country: { not: null }, species: { not: null } },
      select: { species: true, country: true },
    }),
  ]);

  const occFiltered = occRows.filter(r => AFRICAN_COUNTRIES.has(r.country!.trim()));
  const epiFiltered = epiRows.filter(r => AFRICAN_COUNTRIES.has(r.country!.trim()));
  console.log(`[Locations] ${occFiltered.length}/${occRows.length} African occurrences, ${epiFiltered.length}/${epiRows.length} African epi records`);

  const countryMap: Record<string, Record<string, { occurrences: number; epiRecords: number }>> = {};

  for (const r of occFiltered) {
    const country = r.country!.trim();
    const species = r.species!.trim();
    if (!countryMap[country]) countryMap[country] = {};
    if (!countryMap[country][species]) countryMap[country][species] = { occurrences: 0, epiRecords: 0 };
    countryMap[country][species].occurrences++;
  }

  for (const r of epiFiltered) {
    const country = r.country!.trim();
    const species = r.species!.trim();
    if (!countryMap[country]) countryMap[country] = {};
    if (!countryMap[country][species]) countryMap[country][species] = { occurrences: 0, epiRecords: 0 };
    countryMap[country][species].epiRecords++;
  }

  const result: Record<string, { species: string; occurrences: number; epiRecords: number; totalRecords: number }[]> = {};
  const allCountries: string[] = [];

  for (const [country, speciesMap] of Object.entries(countryMap).sort((a, b) => a[0].localeCompare(b[0]))) {
    allCountries.push(country);
    result[country] = Object.entries(speciesMap)
      .map(([species, counts]) => ({
        species,
        occurrences: counts.occurrences,
        epiRecords: counts.epiRecords,
        totalRecords: counts.occurrences + counts.epiRecords,
      }))
      .sort((a, b) => b.totalRecords - a.totalRecords);
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "species-by-country.json"),
    JSON.stringify({ countries: result, allCountries })
  );

  console.log(`[Locations] Done! ${allCountries.length} African countries exported to ${OUT_DIR}`);
  await p.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
