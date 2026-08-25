const API_BASE = import.meta.env.VITE_API_URL || "/api";
const USE_STATIC = !import.meta.env.VITE_API_URL && import.meta.env.PROD;

export interface Occurrence {
  id: number;
  gbifId: string | null;
  species: string | null;
  latitude: number | null;
  longitude: number | null;
  country: string | null;
  year: number | null;
  citation: string | null;
}

// A single decoded Africa-map point. Encoded compactly on disk as a tuple of
// indices into string dictionaries (see /map-points.json), decoded in
// fetchMapPoints so the map pages never have to download the full dataset.
export interface MapPoint {
  lng: number;
  lat: number;
  species: string;
  country: string;
  year: number | null;
  host: string | null;
  disease: string | null;
  method: string | null;
}

export interface MapPointsData {
  points: MapPoint[];
  species: { name: string; count: number }[];
  countries: { name: string; count: number }[];
  methods: string[];
  yearRange: { min: number; max: number };
}

export interface EpidemiologicalRecord {
  id: number;
  species: string | null;
  yearOfStudy: string | null;
  yearStart: number | null;
  yearEnd: number | null;
  country: string | null;
  title: string | null;
  links: string | null;
  epidemiologicalDisease: string | null;
  methodOfExtraction: string | null;
  relatedHosts: string | null;
  epidemiologicalIncidences: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface OccurrenceMeta {
  totalRecords: number;
  yearRange: { min: number | null; max: number | null };
  species: { name: string; count: number }[];
  countries: { name: string; count: number }[];
}

export interface EpidemiologicalMeta {
  totalRecords: number;
  yearRange: { min: number | null; max: number | null };
  incidence: { total: number; count: number; ratePer1k: number | null };
  species: { name: string; count: number }[];
  countries: { name: string; count: number }[];
  hosts: { name: string; count: number }[];
  diseases: { name: string; count: number }[];
}

export interface YearlyDataPoint {
  year: number;
  count: number;
}

export interface SpeciesAttributes {
  disease: string;
  host: string;
  method: string;
}

export type SpeciesDetailMap = Record<string, SpeciesAttributes>;

interface OccurrenceQuery {
  species?: string;
  country?: string;
  yearStart?: number;
  yearEnd?: number;
  search?: string;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}

interface EpidemiologicalQuery {
  species?: string;
  country?: string;
  host?: string;
  disease?: string;
  yearStart?: number;
  yearEnd?: number;
  search?: string;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}

let staticOccurrences: PaginatedResponse<Occurrence> | null = null;
let staticOccMeta: OccurrenceMeta | null = null;
let staticEpi: PaginatedResponse<EpidemiologicalRecord> | null = null;
let staticEpiMeta: EpidemiologicalMeta | null = null;
let mapPointsCache: MapPointsData | null = null;

async function loadStatic<T>(url: string, cache: { value: T | null }): Promise<T> {
  if (!cache.value) {
    const res = await fetch(url);
    cache.value = await res.json();
  }
  return cache.value;
}

/**
 * Loads the compact Africa map dataset (/map-points.json) and decodes the
 * dictionary-encoded tuples into MapPoint objects. This is the ~0.6MB payload
 * that powers the map pages; it replaces the previous ~42MB download of the
 * full occurrences.json (which was 95% non-African points the map never drew).
 */
export async function fetchMapPoints(): Promise<MapPointsData> {
  if (mapPointsCache) return mapPointsCache;
  const res = await fetch("/map-points.json");
  const raw = await res.json();
  const { species, country, host, disease, method } = raw;
  const none = (a: string[], i: number) => (i >= 0 && i < a.length ? a[i] : null);
  const points: MapPoint[] = raw.points.map(
    ([lng, lat, sp, co, yr, ho, di, me]: number[]) => ({
      lng,
      lat,
      species: none(species, sp) || "Unknown",
      country: none(country, co) || "Unknown",
      year: yr >= 0 ? yr : null,
      host: none(host, ho),
      disease: none(disease, di),
      method: none(method, me),
    })
  );

  const speciesCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const methodSet = new Set<string>();
  let minYear = Infinity;
  let maxYear = -Infinity;
  for (const p of points) {
    speciesCounts.set(p.species, (speciesCounts.get(p.species) || 0) + 1);
    countryCounts.set(p.country, (countryCounts.get(p.country) || 0) + 1);
    if (p.method) methodSet.add(p.method);
    if (p.year != null) {
      if (p.year < minYear) minYear = p.year;
      if (p.year > maxYear) maxYear = p.year;
    }
  }

  mapPointsCache = {
    points,
    species: Array.from(speciesCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    countries: Array.from(countryCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    methods: Array.from(methodSet).sort(),
    yearRange: { min: minYear === Infinity ? 0 : minYear, max: maxYear === -Infinity ? 0 : maxYear },
  };
  return mapPointsCache;
}

const exactFields: Record<string, string> = {
  species: "species",
  country: "country",
  host: "relatedHosts",
  disease: "epidemiologicalDisease",
};

function filterStatic<T extends Record<string, any>>(data: PaginatedResponse<T>, params: Record<string, any>): PaginatedResponse<T> {
  let rows = data.data;
  for (const [param, field] of Object.entries(exactFields)) {
    if (params[param]) rows = rows.filter((r) => r[field] === params[param]);
  }
  if (params.search) {
    const q = params.search.toLowerCase();
    const fields = ["species", "country", "relatedHosts", "epidemiologicalDisease", "title"];
    rows = rows.filter((r) => fields.some((f) => (r[f] || "").toLowerCase().includes(q)));
  }
  const limit = params.limit || 50;
  const page = params.page || 1;
  const start = (page - 1) * limit;
  return {
    data: rows.slice(start, start + limit),
    pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) },
  };
}

export async function fetchOccurrences(params: OccurrenceQuery = {}): Promise<PaginatedResponse<Occurrence>> {
  if (USE_STATIC) {
    const data = await loadStatic("/occurrences.json", { value: staticOccurrences } as any);
    staticOccurrences = data;
    return filterStatic(data, params);
  }

  try {
    const qs = new URLSearchParams();
    if (params.species) qs.set("species", params.species);
    if (params.country) qs.set("country", params.country);
    if (params.yearStart) qs.set("yearStart", String(params.yearStart));
    if (params.yearEnd) qs.set("yearEnd", String(params.yearEnd));
    if (params.search) qs.set("search", params.search);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const res = await fetch(`${API_BASE}/occurrences?${qs}`, { signal: params.signal });
    if (!res.ok) throw new Error("API error");
    return res.json();
  } catch {
    const data = await loadStatic("/occurrences.json", { value: staticOccurrences } as any);
    staticOccurrences = data;
    return filterStatic(data, params);
  }
}

export async function fetchOccurrenceMeta(signal?: AbortSignal): Promise<OccurrenceMeta> {
  if (USE_STATIC) {
    return loadStatic("/occurrences-meta.json", { value: staticOccMeta } as any);
  }

  try {
    const res = await fetch(`${API_BASE}/occurrences/meta/counts`, { signal });
    if (!res.ok) throw new Error("API error");
    return res.json();
  } catch {
    return loadStatic("/occurrences-meta.json", { value: staticOccMeta } as any);
  }
}

export async function fetchEpidemiological(params: EpidemiologicalQuery = {}): Promise<PaginatedResponse<EpidemiologicalRecord>> {
  if (USE_STATIC) {
    const data = await loadStatic("/epidemiological.json", { value: staticEpi } as any);
    staticEpi = data;
    return filterStatic(data, params);
  }

  try {
    const qs = new URLSearchParams();
    if (params.species) qs.set("species", params.species);
    if (params.country) qs.set("country", params.country);
    if (params.host) qs.set("host", params.host);
    if (params.disease) qs.set("disease", params.disease);
    if (params.yearStart) qs.set("yearStart", String(params.yearStart));
    if (params.yearEnd) qs.set("yearEnd", String(params.yearEnd));
    if (params.search) qs.set("search", params.search);
    if (params.page) qs.set("page", String(params.page));
    if (params.limit) qs.set("limit", String(params.limit));
    const res = await fetch(`${API_BASE}/epidemiological?${qs}`, { signal: params.signal });
    if (!res.ok) throw new Error("API error");
    return res.json();
  } catch {
    const data = await loadStatic("/epidemiological.json", { value: staticEpi } as any);
    staticEpi = data;
    return filterStatic(data, params);
  }
}

export async function fetchEpidemiologicalMeta(signal?: AbortSignal): Promise<EpidemiologicalMeta> {
  if (USE_STATIC) {
    return loadStatic("/epidemiological-meta.json", { value: staticEpiMeta } as any);
  }

  try {
    const res = await fetch(`${API_BASE}/epidemiological/meta/counts`, { signal });
    if (!res.ok) throw new Error("API error");
    return res.json();
  } catch {
    return loadStatic("/epidemiological-meta.json", { value: staticEpiMeta } as any);
  }
}

function isBlankValue(v: string | null): boolean {
  if (!v) return true;
  const t = v.trim().toLowerCase();
  return t === "" || t === "none" || t === "n/a" || t === "na" || t === "unknown";
}

export function buildSpeciesDetail(records: EpidemiologicalRecord[]): SpeciesDetailMap {
  const agg: Record<string, { disease: Record<string, number>; host: Record<string, number>; method: Record<string, number> }> = {};
  for (const r of records) {
    if (!r.species) continue;
    const key = r.species.trim().toLowerCase();
    if (!key) continue;
    const e = (agg[key] ||= { disease: {}, host: {}, method: {} });
    if (!isBlankValue(r.epidemiologicalDisease)) {
      const v = r.epidemiologicalDisease!.trim();
      e.disease[v] = (e.disease[v] || 0) + 1;
    }
    if (!isBlankValue(r.relatedHosts)) {
      const v = r.relatedHosts!.trim();
      e.host[v] = (e.host[v] || 0) + 1;
    }
    if (!isBlankValue(r.methodOfExtraction)) {
      const v = r.methodOfExtraction!.trim();
      e.method[v] = (e.method[v] || 0) + 1;
    }
  }
  const best = (m: Record<string, number>) => {
    let top = "";
    let topN = 0;
    for (const [k, n] of Object.entries(m)) {
      if (n > topN) {
        top = k;
        topN = n;
      }
    }
    return top;
  };
  const map: SpeciesDetailMap = {};
  for (const [key, e] of Object.entries(agg)) {
    map[key] = { disease: best(e.disease), host: best(e.host), method: best(e.method) };
  }
  return map;
}

export async function fetchEpidemiologicalSpeciesDetail(signal?: AbortSignal): Promise<SpeciesDetailMap> {
  if (USE_STATIC) {
    const all = await loadStatic("/epidemiological.json", { value: staticEpi } as any);
    staticEpi = all;
    return buildSpeciesDetail(all.data);
  }

  try {
    const res = await fetch(`${API_BASE}/epidemiological/meta/species-detail`, { signal });
    if (!res.ok) throw new Error("API error");
    const json = await res.json();
    return json.data;
  } catch {
    const all = await loadStatic("/epidemiological.json", { value: staticEpi } as any);
    staticEpi = all;
    return buildSpeciesDetail(all.data);
  }
}

export async function fetchEpidemiologicalYearly(signal?: AbortSignal): Promise<{ data: YearlyDataPoint[] }> {
  if (USE_STATIC) {
    const all = await loadStatic("/epidemiological.json", { value: staticEpi } as any);
    staticEpi = all;
    const yearlyCounts: Record<number, number> = {};
    for (const r of all.data) {
      if (r.yearStart === null || r.yearStart === undefined) continue;
      const start = r.yearStart;
      const end = r.yearEnd ?? start;
      for (let y = start; y <= end; y++) {
        yearlyCounts[y] = (yearlyCounts[y] || 0) + 1;
      }
    }
    return {
      data: Object.entries(yearlyCounts)
        .map(([year, count]) => ({ year: parseInt(year), count }))
        .sort((a, b) => a.year - b.year),
    };
  }
  const res = await fetch(`${API_BASE}/epidemiological/meta/yearly`, { signal });
  if (!res.ok) throw new Error("Failed to fetch yearly data");
  return res.json();
}

export function exportAsCSV(records: EpidemiologicalRecord[]): void {
  const headers = ["id", "species", "yearOfStudy", "yearStart", "yearEnd", "country", "title", "links", "epidemiologicalDisease", "methodOfExtraction", "relatedHosts", "epidemiologicalIncidences"];
  const csv = [
    headers.join(","),
    ...records.map((r) =>
      headers.map((h) => {
        const v = (r as any)[h];
        if (v === null || v === undefined) return "";
        const s = String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tick_epidemiological_records.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export interface DiseaseCoordinatePoint {
  lat: number;
  lng: number;
}

export interface DiseaseCoordinateEntry {
  points: DiseaseCoordinatePoint[];
  species: string[];
  totalPoints: number;
}

export type DiseaseCoordinatesMap = Record<string, DiseaseCoordinateEntry>;

let diseaseCoordsCache: DiseaseCoordinatesMap | null = null;

export async function fetchDiseaseCoordinates(signal?: AbortSignal): Promise<DiseaseCoordinatesMap> {
  if (diseaseCoordsCache) return diseaseCoordsCache;

  if (USE_STATIC) {
    try {
      const res = await fetch("/genbank/disease-coordinates.json");
      if (res.ok) {
        diseaseCoordsCache = await res.json();
        return diseaseCoordsCache!;
      }
    } catch {}
    diseaseCoordsCache = {};
    return diseaseCoordsCache;
  }

  try {
    const res = await fetch(`${API_BASE}/epidemiological/meta/disease-coordinates`, { signal });
    if (!res.ok) throw new Error("API error");
    const json = await res.json();
    diseaseCoordsCache = json.data;
    return diseaseCoordsCache!;
  } catch {
    diseaseCoordsCache = {};
    return diseaseCoordsCache;
  }
}

export interface GenBankRecord {
  id: number;
  accession: string;
  species: string | null;
  organism: string | null;
  gene: string | null;
  sequenceLength: number | null;
  definition: string | null;
  taxonomy: string | null;
  collectionDate: string | null;
  country: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  host: string | null;
}

export interface GenBankMatch {
  record: GenBankRecord;
  distanceKm: number | null;
}

export interface GenBankResponse {
  species: string;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  records: GenBankMatch[];
}

export interface GenBankStats {
  total: number;
  genes: { name: string; count: number }[];
  countries: { name: string; count: number }[];
  hosts: { name: string; count: number }[];
  sequenceLength: { min: number; max: number; mean: number } | null;
}

let genbankStaticCache: Record<string, GenBankResponse> = {};
let genbankStaticStatsCache: Record<string, GenBankStats> = {};
let genbankIndexCache: Record<string, string> | null = null;

function genbankSafeName(species: string): string {
  return species.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
}

export async function fetchGenBankIndex(): Promise<Record<string, string>> {
  if (genbankIndexCache) return genbankIndexCache;
  try {
    const res = await fetch("/genbank/_index.json");
    if (!res.ok) return {};
    genbankIndexCache = await res.json();
    return genbankIndexCache;
  } catch {
    return {};
  }
}

export async function fetchGenBankStatsBatch(
  speciesList: string[]
): Promise<Map<string, GenBankStats | null>> {
  const index = await fetchGenBankIndex();
  const validSpecies = speciesList.filter((sp) => index[sp] != null);
  const results = await Promise.all(
    validSpecies.map(async (sp) => {
      try {
        const stats = await fetchGenBankStats(sp);
        return [sp, stats] as const;
      } catch {
        return [sp, null] as const;
      }
    })
  );
  const map = new Map<string, GenBankStats | null>();
  for (const [sp, stats] of results) map.set(sp, stats);
  for (const sp of speciesList) {
    if (!map.has(sp)) map.set(sp, null);
  }
  return map;
}

export async function fetchGenBank(
  species: string,
  opts?: {
    gene?: string;
    search?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    page?: number;
    limit?: number;
    lat?: number;
    lng?: number;
    signal?: AbortSignal;
  }
): Promise<GenBankResponse | null> {
  try {
    if (USE_STATIC) {
      const safeName = genbankSafeName(species);
      if (!genbankStaticCache[safeName]) {
        const res = await fetch(`/genbank/${safeName}.json`, { signal: opts?.signal });
        if (!res.ok) {
          console.warn(`[GenBank static] No file for "${species}" (${safeName}.json): ${res.status}`);
          return null;
        }
        genbankStaticCache[safeName] = await res.json();
      }
      let data = genbankStaticCache[safeName];
      if (opts?.gene && opts.gene !== "all") {
        data = {
          ...data,
          records: data.records.filter((m) => m.record.gene === opts.gene),
        };
      }
      if (opts?.search) {
        const q = opts.search.toLowerCase();
        data = {
          ...data,
          records: data.records.filter(
            (m) =>
              m.record.accession.toLowerCase().includes(q) ||
              (m.record.definition && m.record.definition.toLowerCase().includes(q)) ||
              (m.record.host && m.record.host.toLowerCase().includes(q)) ||
              (m.record.location && m.record.location.toLowerCase().includes(q))
          ),
        };
      }
      const sortBy = opts?.sortBy || "accession";
      const sortDir = opts?.sortDir || "asc";
      data = {
        ...data,
        records: [...data.records].sort((a, b) => {
          const av = (a.record as any)[sortBy];
          const bv = (b.record as any)[sortBy];
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          if (typeof av === "number" && typeof bv === "number") {
            return sortDir === "desc" ? bv - av : av - bv;
          }
          const cmp = String(av).localeCompare(String(bv));
          return sortDir === "desc" ? -cmp : cmp;
        }),
      };
      const page = opts?.page || 1;
      const limit = opts?.limit || 20;
      const start = (page - 1) * limit;
      return {
        ...data,
        total: data.records.length,
        page,
        limit,
        totalPages: Math.ceil(data.records.length / limit),
        records: data.records.slice(start, start + limit),
      };
    }

    const qs = new URLSearchParams();
    if (opts?.gene) qs.set("gene", opts.gene);
    if (opts?.search) qs.set("search", opts.search);
    if (opts?.sortBy) qs.set("sortBy", opts.sortBy);
    if (opts?.sortDir) qs.set("sortDir", opts.sortDir);
    if (opts?.page) qs.set("page", String(opts.page));
    if (opts?.limit) qs.set("limit", String(opts.limit));
    if (opts?.lat != null) qs.set("lat", String(opts.lat));
    if (opts?.lng != null) qs.set("lng", String(opts.lng));
    const qsStr = qs.toString();
    const url = `${API_BASE}/genbank/${encodeURIComponent(species)}${qsStr ? "?" + qsStr : ""}`;
    const res = await fetch(url, { signal: opts?.signal });
    if (!res.ok) throw new Error("API error");
    return res.json();
  } catch (err) {
    console.error(`[GenBank] Failed to fetch for "${species}":`, err);
    return null;
  }
}

export async function fetchGenBankStats(species: string, signal?: AbortSignal): Promise<GenBankStats | null> {
  try {
    if (USE_STATIC) {
      const safeName = genbankSafeName(species);
      if (!genbankStaticStatsCache[safeName]) {
        const res = await fetch(`/genbank/${safeName}_stats.json`, { signal });
        if (!res.ok) {
          console.warn(`[GenBank stats static] No file for "${species}" (${safeName}_stats.json): ${res.status}`);
          return null;
        }
        genbankStaticStatsCache[safeName] = await res.json();
      }
      return genbankStaticStatsCache[safeName];
    }
    const res = await fetch(`${API_BASE}/genbank/stats/${encodeURIComponent(species)}`, { signal });
    if (!res.ok) throw new Error("API error");
    return res.json();
  } catch (err) {
    console.error(`[GenBank stats] Failed to fetch for "${species}":`, err);
    return null;
  }
}

export function exportAsGeoJSON(records: Occurrence[]): void {
  const geojson = {
    type: "FeatureCollection",
    features: records
      .filter((r) => r.latitude !== null && r.longitude !== null)
      .map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.longitude, r.latitude] },
        properties: {
          id: r.id,
          gbifId: r.gbifId,
          species: r.species,
          country: r.country,
          year: r.year,
        },
      })),
  };
  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tick_occurrences.geojson";
  a.click();
  URL.revokeObjectURL(url);
}
