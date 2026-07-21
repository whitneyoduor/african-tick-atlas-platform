const API_BASE = import.meta.env.VITE_API_URL || "/api";
const USE_STATIC = !import.meta.env.VITE_API_URL && import.meta.env.PROD;

export interface TickRecord {
  id: number;
  latitude: number | null;
  longitude: number | null;
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
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse {
  data: TickRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface MetaCounts {
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

interface QueryParams {
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

let staticData: PaginatedResponse | null = null;
let staticMeta: MetaCounts | null = null;

async function loadStaticData(): Promise<PaginatedResponse> {
  if (!staticData) {
    const res = await fetch("/tick-data.json");
    staticData = await res.json();
  }
  return staticData;
}

async function loadStaticMeta(): Promise<MetaCounts> {
  if (!staticMeta) {
    const res = await fetch("/tick-meta.json");
    staticMeta = await res.json();
  }
  return staticMeta;
}

function filterStatic(data: PaginatedResponse, params: QueryParams): PaginatedResponse {
  let rows = data.data;
  if (params.species) rows = rows.filter((r) => r.species === params.species);
  if (params.country) rows = rows.filter((r) => r.country === params.country);
  if (params.host) rows = rows.filter((r) => r.relatedHosts === params.host);
  if (params.disease) rows = rows.filter((r) => r.epidemiologicalDisease === params.disease);
  if (params.yearStart) rows = rows.filter((r) => r.yearStart !== null && r.yearStart >= params.yearStart!);
  if (params.yearEnd) rows = rows.filter((r) => r.yearEnd !== null && r.yearEnd <= params.yearEnd!);
  if (params.search) {
    const q = params.search.toLowerCase();
    rows = rows.filter((r) =>
      (r.species || "").toLowerCase().includes(q) ||
      (r.country || "").toLowerCase().includes(q) ||
      (r.relatedHosts || "").toLowerCase().includes(q) ||
      (r.epidemiologicalDisease || "").toLowerCase().includes(q) ||
      (r.title || "").toLowerCase().includes(q)
    );
  }
  const limit = params.limit || 50;
  const page = params.page || 1;
  const start = (page - 1) * limit;
  return {
    data: rows.slice(start, start + limit),
    pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) },
  };
}

export async function fetchTicks(params: QueryParams = {}): Promise<PaginatedResponse> {
  if (USE_STATIC) {
    const data = await loadStaticData();
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
    const res = await fetch(`${API_BASE}/ticks?${qs}`, { signal: params.signal });
    if (!res.ok) throw new Error("API error");
    return res.json();
  } catch {
    const data = await loadStaticData();
    return filterStatic(data, params);
  }
}

export async function fetchTickById(id: number, signal?: AbortSignal): Promise<TickRecord> {
  if (USE_STATIC) {
    const data = await loadStaticData();
    const record = data.data.find((r) => r.id === id);
    if (!record) throw new Error("Record not found");
    return record;
  }
  const res = await fetch(`${API_BASE}/ticks/${id}`, { signal });
  if (!res.ok) throw new Error("Failed to fetch tick record");
  return res.json();
}

export async function fetchMetaCounts(signal?: AbortSignal): Promise<MetaCounts> {
  if (USE_STATIC) return loadStaticMeta();

  try {
    const res = await fetch(`${API_BASE}/ticks/meta/counts`, { signal });
    if (!res.ok) throw new Error("API error");
    return res.json();
  } catch {
    return loadStaticMeta();
  }
}

export async function fetchYearlyData(signal?: AbortSignal): Promise<{ data: YearlyDataPoint[] }> {
  if (USE_STATIC) {
    const all = await loadStaticData();
    const yearlyCounts: Record<number, number> = {};
    for (const r of all.data) {
      if (r.yearStart === null) continue;
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
  const res = await fetch(`${API_BASE}/ticks/meta/yearly`, { signal });
  if (!res.ok) throw new Error("Failed to fetch yearly data");
  return res.json();
}

export function exportAsCSV(records: TickRecord[]): void {
  const headers = ["id", "species", "latitude", "longitude", "country", "yearStart", "yearEnd", "relatedHosts", "epidemiologicalDisease", "methodOfExtraction", "title", "links"];
  const csv = [
    headers.join(","),
    ...records.map((r) =>
      headers.map((h) => {
        const v = (r as any)[h];
        if (v === null || v === undefined) return "";
        const s = String(v);
        return s.includes(",") ? `"${s}"` : s;
      }).join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tick_records.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAsGeoJSON(records: TickRecord[]): void {
  const geojson = {
    type: "FeatureCollection",
    features: records
      .filter((r) => r.latitude !== null && r.longitude !== null)
      .map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.longitude, r.latitude] },
        properties: {
          id: r.id,
          species: r.species,
          country: r.country,
          yearStart: r.yearStart,
          yearEnd: r.yearEnd,
          host: r.relatedHosts,
          disease: r.epidemiologicalDisease,
        },
      })),
  };
  const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tick_records.geojson";
  a.click();
  URL.revokeObjectURL(url);
}
