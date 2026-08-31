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
    label: "Febrile illnesses Pathogens",
    description: "Human febrile illnesses pathogens — mimic malaria, a documented cause of diagnostic confusion.",
  },
  {
    key: "other",
    label: "Other neglected febrile illnesses pathogens",
    description: "Neglected febrile illnesses pathogens that routine tests overlook.",
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

export function singleFebrileGenusOfRecord(r: {
  species?: string | null;
  epidemiologicalDisease?: string | null;
}): string | null {
  for (const t of [r.epidemiologicalDisease, r.species]) {
    if (!t) continue;
    let best: string | null = null;
    let bestIndex = Infinity;
    for (const g of FEBRILE_GENERA) {
      const m = g.match.exec(t);
      if (m && m.index < bestIndex) {
        best = g.key;
        bestIndex = m.index;
      }
    }
    if (best) return best;
  }
  return null;
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
  genusLabel: string;
}

/**
 * Merges per-disease coordinate points and rolls them up under the pathogen
 * genus of each disease card, so the map is colour-coded by genus. A disease
 * entry such as "Anaplasma, Ehrlichia, Rickettsia, Theileria, Babesia, Coxiella"
 * contributes its points to every matched genus.
 */
export function buildFebrileEntry(
  diseaseCoords: DiseaseCoordinatesMap,
  genusKeys: string[]
): DiseaseCoordinateEntry {
  const target = new Set(genusKeys);
  const points: FebrilePoint[] = [];
  const seen = new Set<string>();
  for (const [diseaseName, entry] of Object.entries(diseaseCoords)) {
    if (!entry || !entry.points) continue;
    const genera = febrileGeneraOfLabel(diseaseName).filter((k) => target.has(k));
    if (genera.length === 0) continue;
    for (const gk of genera) {
      const genus = FEBRILE_GENERA_MAP[gk];
      for (const p of entry.points) {
        const dedupeKey = `${gk}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        points.push({
          lat: p.lat,
          lng: p.lng,
          species: p.species,
          country: p.country,
          year: p.year,
          genus: gk,
          genusLabel: genus.label,
        });
      }
    }
  }
  return {
    points,
    species: genusKeys.map((k) => FEBRILE_GENERA_MAP[k]?.label).filter(Boolean) as string[],
    totalPoints: points.length,
  };
}