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
    description: "Mimic malaria — a documented cause of diagnostic confusion.",
  },
  {
    key: "other",
    label: "Other neglected febrile",
    description: "Undifferentiated fevers that routine tests overlook.",
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
 * Classifies a plain disease/pathogen label (e.g. "Spotted fever group
 * Rickettsia spp.") into the same genus keys used for records.
 */
export function febrileGeneraOfLabel(label: string): string[] {
  return extractFebrileGenera(label);
}