import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
export const locationsRouter = Router();

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

locationsRouter.get("/species-by-country", async (_req, res) => {
  try {
    const [occRows, epiRows] = await Promise.all([
      prisma.occurrence.findMany({
        where: { country: { not: null }, species: { not: null } },
        select: { species: true, country: true },
      }),
      prisma.epidemiologicalRecord.findMany({
        where: { country: { not: null }, species: { not: null } },
        select: { species: true, country: true },
      }),
    ]);

    const occFiltered = occRows.filter(r => AFRICAN_COUNTRIES.has(r.country!.trim()));
    const epiFiltered = epiRows.filter(r => AFRICAN_COUNTRIES.has(r.country!.trim()));

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

    res.json({ countries: result, allCountries });
  } catch (error) {
    console.error("Error building species-by-country:", error);
    res.status(500).json({ error: "Failed to build species-by-country" });
  }
});
