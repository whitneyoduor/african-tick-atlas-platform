import type { DiseaseCoordinateEntry, DiseaseCoordinatesMap, DiseaseCoordinatePoint } from "./api";

export type FebrileCategoryKey = "core" | "other";

export interface FebrileCategory {
  key: FebrileCategoryKey;
  label: string;
  description: string;
}

export interface FebrileGenus {
  key: string;
  label: string;
  category: FebrileCategoryKey;
  color: string;
  match: RegExp;
}

export const FEBRILE_CATEGORIES: FebrileCategory[] = [
  {
    key: "core",
    label: "Core malaria-differential",
    description:
      "Tick-borne pathogens that can present with malaria-like febrile illness and are documented causes of diagnostic confusion with malaria.",
  },
  {
    key: "other",
    label: "Other neglected febrile pathogens",
    description:
      "Important causes of undifferentiated febrile illness that may be overlooked where routine diagnosis concentrates on malaria and other common infections.",
  },
];

export const FEBRILE_GENERA: FebrileGenus[] = [
  {
    key: "rickettsia",
    label: "Rickettsia",
    category: "core",
    color: "#DC2626",
    match: /rickettsia|spotted\s*fever|tick[-\s]?bite\s*fever|tick\s*typhus/i,
  },
  {
    key: "borrelia",
    label: "Borrelia",
    category: "core",
    color: "#BE185D",
    match: /borrelia|lyme|relapsing\s*fever/i,
  },
  {
    key: "babesia",
    label: "Babesia",
    category: "core",
    color: "#D97706",
    match: /babesia/i,
  },
  {
    key: "coxiella",
    label: "Coxiella",
    category: "other",
    color: "#7C3AED",
    match: /coxiella|q\s?fever|query\s*fever/i,
  },
  {
    key: "anaplasma",
    label: "Anaplasma",
    category: "other",
    color: "#0891B2",
    match: /anaplasma/i,
  },
  {
    key: "ehrlichia",
    label: "Ehrlichia",
    category: "other",
    color: "#2563EB",
    match: /ehrlichia/i,
  },
];

export const FEBRILE_GENERA_MAP: Record<string, FebrileGenus> = Object.fromEntries(
  FEBRILE_GENERA.map((g) => [g.key, g])
);

export function extractFebrileGenera(text: string | null | undefined): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const g of FEBRILE_GENERA) {
    if (g.match.test(text)) found.push(g.key);
  }
  return found;
}

/**
 * Classifies a record by scanning species and disease fields for the six
 * target genera (using genus names and common-name aliases such as
 * "spotted fever", "Lyme" or "Q fever"). Combined entries such as
 * "Babesia, Theileria, Borrelia" return every matched genus so
 * multi-pathogen cards are captured, not missed.
 */
export function febrileGeneraOfRecord(r: {
  species?: string | null;
  epidemiologicalDisease?: string | null;
}): string[] {
  const found = new Set<string>();
  [r.species, r.epidemiologicalDisease].forEach((t) => {
    if (!t) return;
    for (const g of extractFebrileGenera(t)) found.add(g);
  });
  return [...found];
}

/**
 * Classifies a plain disease/pathogen label (e.g. "Spotted fever group
 * Rickettsia spp.") into the same genus keys used for records.
 */
export function febrileGeneraOfLabel(label: string): string[] {
  return extractFebrileGenera(label);
}

export interface FebrilePoint extends DiseaseCoordinatePoint {
  genus: string;
}

/**
 * Merges per-disease coordinate points and rolls each point up under the tick
 * pathogen genus of its species name, so the map is colour-coded by genus.
 */
export function buildFebrileEntry(
  diseaseCoords: DiseaseCoordinatesMap,
  genusKeys: string[]
): DiseaseCoordinateEntry {
  const target = new Set(genusKeys);
  const points: FebrilePoint[] = [];
  const seen = new Set<string>();
  for (const entry of Object.values(diseaseCoords)) {
    if (!entry || !entry.points) continue;
    for (const p of entry.points) {
      if (!p.species) continue;
      const genus = FEBRILE_GENERA.find((g) => g.match.test(p.species));
      if (!genus || !target.has(genus.key)) continue;
      const dedupeKey = `${genus.key}|${p.lat.toFixed(2)}|${p.lng.toFixed(2)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      points.push({
        lat: p.lat,
        lng: p.lng,
        species: genus.label,
        country: p.country,
        year: p.year,
        genus: genus.key,
      });
    }
  }
  return {
    points,
    species: genusKeys.map((k) => FEBRILE_GENERA_MAP[k]?.label).filter(Boolean) as string[],
    totalPoints: points.length,
  };
}