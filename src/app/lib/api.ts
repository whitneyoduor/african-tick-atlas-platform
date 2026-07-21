const API_BASE = "/api";

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

export async function fetchTicks(params: QueryParams = {}): Promise<PaginatedResponse> {
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
  if (!res.ok) throw new Error("Failed to fetch tick records");
  return res.json();
}

export async function fetchTickById(id: number, signal?: AbortSignal): Promise<TickRecord> {
  const res = await fetch(`${API_BASE}/ticks/${id}`, { signal });
  if (!res.ok) throw new Error("Failed to fetch tick record");
  return res.json();
}

export async function fetchMetaCounts(signal?: AbortSignal): Promise<MetaCounts> {
  const res = await fetch(`${API_BASE}/ticks/meta/counts`, { signal });
  if (!res.ok) throw new Error("Failed to fetch metadata");
  return res.json();
}

export async function fetchYearlyData(signal?: AbortSignal): Promise<{ data: YearlyDataPoint[] }> {
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
