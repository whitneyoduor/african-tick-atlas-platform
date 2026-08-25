import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router";
import {
  fetchEpidemiological,
  fetchGenBank,
  fetchGenBankStats,
  type EpidemiologicalRecord,
  type GenBankMatch,
  type GenBankStats,
} from "../../lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import maplibregl from "maplibre-gl";

const NCBI_BASE = "https://www.ncbi.nlm.nih.gov/nuccore/";

const SORT_COLUMNS = [
  { key: "accession", label: "Accession" },
  { key: "species", label: "Species" },
  { key: "gene", label: "Gene" },
  { key: "sequenceLength", label: "Length" },
  { key: "location", label: "Location" },
  { key: "host", label: "Host" },
  { key: "collectionDate", label: "Date" },
] as const;

function DiseaseGenBankMap({
  records,
  centerLat,
  centerLng,
}: {
  records: GenBankMatch[];
  centerLat: number | null;
  centerLng: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const geoPoints = records
      .filter((m) => m.record.latitude !== null && m.record.longitude !== null)
      .map((m) => ({
        lng: m.record.longitude!,
        lat: m.record.latitude!,
        accession: m.record.accession,
        location: m.record.location,
        gene: m.record.gene,
        host: m.record.host,
        species: m.record.species,
      }));

    if (geoPoints.length === 0 && (centerLat == null || centerLng == null || !isFinite(centerLat) || !isFinite(centerLng))) return;

    const bounds = new maplibregl.LngLatBounds();
    geoPoints.forEach((p) => bounds.extend([p.lng, p.lat]));
    if (centerLat != null && centerLng != null && isFinite(centerLat) && isFinite(centerLng)) {
      bounds.extend([centerLng, centerLat]);
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      bounds,
      padding: 40,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      if (geoPoints.length > 0) {
        const features: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: geoPoints.map((p) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [p.lng, p.lat] },
            properties: {
              accession: p.accession,
              location: p.location,
              gene: p.gene,
              host: p.host,
              species: p.species,
            },
          })),
        };

        map.addSource("genbank-points", {
          type: "geojson",
          data: features,
          cluster: true,
          clusterMaxZoom: 14,
          clusterRadius: 50,
        });

        map.addLayer({
          id: "genbank-clusters",
          type: "circle",
          source: "genbank-points",
          filter: ["has", "point_count"],
          paint: {
            "circle-radius": ["step", ["get", "point_count"], 15, 5, 20, 15, 28],
            "circle-color": "#0F766E",
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": 2,
            "circle-opacity": 0.85,
          },
        });

        map.addLayer({
          id: "genbank-cluster-count",
          type: "symbol",
          source: "genbank-points",
          filter: ["has", "point_count"],
          layout: {
            "text-field": "{point_count_abbreviated}",
            "text-size": 11,
            "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          },
          paint: { "text-color": "#FFFFFF" },
        });

        map.addLayer({
          id: "genbank-unclustered",
          type: "circle",
          source: "genbank-points",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": 6,
            "circle-color": "#DC2626",
            "circle-stroke-color": "#FFFFFF",
            "circle-stroke-width": 2,
            "circle-opacity": 0.85,
          },
        });

        const popup = new maplibregl.Popup({ closeButton: false, maxWidth: "220px" });

        map.on("mouseenter", "genbank-unclustered", (e) => {
          map.getCanvas().style.cursor = "pointer";
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties;
          popup
            .setHTML(
              `<div style="font-family:system-ui;font-size:12px;line-height:1.5">
                <div style="font-weight:600;font-family:monospace">${p.accession}</div>
                ${p.species ? `<div style="color:#DC2626;font-size:11px">${p.species}</div>` : ""}
                ${p.location ? `<div style="color:#57534E">${p.location}</div>` : ""}
                ${p.gene ? `<div style="color:#0F766E">Gene: ${p.gene}</div>` : ""}
                ${p.host ? `<div style="color:#57534E">Host: ${p.host}</div>` : ""}
              </div>`
            )
            .setLngLat(e.lngLat)
            .addTo(map);
        });
        map.on("mouseleave", "genbank-unclustered", () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });

        map.on("click", "genbank-clusters", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const clusterId = f.properties?.cluster_id;
          const source = map.getSource("genbank-points") as maplibregl.GeoJSONSource;
          if (source && clusterId != null) {
            source.getClusterExpansionZoom(clusterId as number, (err, zoom) => {
              if (err || zoom == null) return;
              const center = (f.geometry as any).coordinates;
              map.easeTo({ center, zoom, duration: 400 });
            });
          }
        });

        map.on("mouseenter", "genbank-clusters", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "genbank-clusters", () => { map.getCanvas().style.cursor = ""; });
      }

      if (centerLat != null && centerLng != null && isFinite(centerLat) && isFinite(centerLng)) {
        const el = document.createElement("div");
        el.style.cssText = "width:12px;height:12px;background:#DC2626;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3)";
        new maplibregl.Marker({ element: el })
          .setLngLat([centerLng, centerLat])
          .setPopup(new maplibregl.Popup({ closeButton: false }).setHTML('<div style="font-family:system-ui;font-size:12px;font-weight:600">Disease centroid</div>'))
          .addTo(map);
      }
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [records, centerLat, centerLng]);

  return <div ref={containerRef} className="w-full h-full min-h-[380px]" />;
}

function GeneBadge({ gene }: { gene: string | null }) {
  if (!gene) return <span style={{ color: "#A8A29E" }}>&mdash;</span>;
  const upper = gene.toUpperCase();
  const isCOI = upper.includes("COI") || upper.includes("COX1") || upper === "COI-COII";
  const is16S = upper.includes("16S");
  return (
    <span
      className="inline-block text-[11px] font-medium rounded-full px-2 py-0.5"
      style={{
        background: isCOI ? "#ECF6F4" : is16S ? "#EEF2FF" : "#FEF3E2",
        color: isCOI ? "#0F766E" : is16S ? "#3730A3" : "#B45309",
        border: `1px solid ${isCOI ? "#CFE3E0" : is16S ? "#C7D2FE" : "#F5D9AC"}`,
      }}
    >
      {gene}
    </span>
  );
}

function SortHeader({
  column, label, sortBy, sortDir, onSort,
}: {
  column: string; label: string; sortBy: string; sortDir: "asc" | "desc"; onSort: (col: string) => void;
}) {
  const active = sortBy === column;
  return (
    <th
      className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider sticky top-0 cursor-pointer select-none hover:text-stone-700 transition-colors"
      style={{ color: active ? "#134E4A" : "#A8A29E", background: "#FFFFFF", borderBottom: "1px solid #E2E5DE" }}
      onClick={() => onSort(column)}
    >
      {label}{active && <span className="ml-1">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>}
    </th>
  );
}

function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }
  return (
    <div className="flex items-center justify-center gap-1 py-3">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="px-2 py-1 text-[11px] rounded disabled:opacity-30 hover:bg-stone-100" style={{ color: "#134E4A" }}>&lsaquo; Prev</button>
      {pages.map((p, i) => p === "..." ? (
        <span key={`e${i}`} className="px-1 text-[11px]" style={{ color: "#A8A29E" }}>...</span>
      ) : (
        <button key={p} onClick={() => onPage(p as number)} className="px-2 py-1 text-[11px] rounded font-medium" style={{ background: p === page ? "#134E4A" : "transparent", color: p === page ? "#FFFFFF" : "#1C1917" }}>{p}</button>
      ))}
      <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} className="px-2 py-1 text-[11px] rounded disabled:opacity-30 hover:bg-stone-100" style={{ color: "#134E4A" }}>Next &rsaquo;</button>
    </div>
  );
}

interface AggregatedGenBankStats {
  totalSequences: number;
  speciesWithGenBank: number;
  genes: { name: string; count: number }[];
  countries: { name: string; count: number }[];
  hosts: { name: string; count: number }[];
  speciesBreakdown: { species: string; count: number }[];
}

function aggregateGenBankStats(statsMap: Map<string, GenBankStats | null>): AggregatedGenBankStats {
  const totalSequences = Array.from(statsMap.values()).reduce((s, st) => s + (st?.total || 0), 0);
  const speciesWithGenBank = Array.from(statsMap.values()).filter((st) => st && st.total > 0).length;

  const geneCounts: Record<string, number> = {};
  const countryCounts: Record<string, number> = {};
  const hostCounts: Record<string, number> = {};
  const speciesBreakdown: { species: string; count: number }[] = [];

  for (const [sp, st] of statsMap) {
    if (!st || st.total === 0) continue;
    speciesBreakdown.push({ species: sp, count: st.total });
    for (const g of st.genes) geneCounts[g.name] = (geneCounts[g.name] || 0) + g.count;
    for (const c of st.countries) countryCounts[c.name] = (countryCounts[c.name] || 0) + c.count;
    for (const h of st.hosts) hostCounts[h.name] = (hostCounts[h.name] || 0) + h.count;
  }

  return {
    totalSequences,
    speciesWithGenBank,
    genes: Object.entries(geneCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => ({ name, count })),
    countries: Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => ({ name, count })),
    hosts: Object.entries(hostCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, count]) => ({ name, count })),
    speciesBreakdown: speciesBreakdown.sort((a, b) => b.count - a.count),
  };
}

export function DiseasePage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const disease = name || "";
  const [records, setRecords] = useState<EpidemiologicalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [genbankStatsMap, setGenbankStatsMap] = useState<Map<string, GenBankStats | null>>(new Map());
  const [genbankLoading, setGenbankLoading] = useState(false);
  const [genbankAllRecords, setGenbankAllRecords] = useState<GenBankMatch[]>([]);
  const [genbankTotal, setGenbankTotal] = useState(0);
  const [genbankPage, setGenbankPage] = useState(1);
  const [genbankTotalPages, setGenbankTotalPages] = useState(1);
  const [genbankSortBy, setGenbankSortBy] = useState("accession");
  const [genbankSortDir, setGenbankSortDir] = useState<"asc" | "desc">("asc");
  const [geneFilter, setGeneFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVectorSpecies, setSelectedVectorSpecies] = useState("all");

  useEffect(() => {
    if (!disease) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setRecords([]);
    fetchEpidemiological({ disease, limit: 50000 })
      .then((res) => { if (active) { setRecords(res.data); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [disease]);

  const vectorSpecies = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => { if (r.species) counts[r.species] = (counts[r.species] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  }, [records]);

  useEffect(() => {
    if (vectorSpecies.length === 0) return;
    let active = true;
    setGenbankLoading(true);
    setGenbankStatsMap(new Map());

    const speciesList = vectorSpecies.map((s) => s.name);
    Promise.all(
      speciesList.map(async (sp) => {
        try {
          const stats = await fetchGenBankStats(sp);
          return [sp, stats] as const;
        } catch {
          return [sp, null] as const;
        }
      })
    ).then((results) => {
      if (!active) return;
      const map = new Map<string, GenBankStats | null>();
      for (const [sp, stats] of results) map.set(sp, stats);
      setGenbankStatsMap(map);
      setGenbankLoading(false);
    }).catch(() => { if (active) setGenbankLoading(false); });

    return () => { active = false; };
  }, [vectorSpecies]);

  const aggregatedStats = useMemo(() => aggregateGenBankStats(genbankStatsMap), [genbankStatsMap]);

  const loadGenBankRecords = useCallback(
    (page: number, sortBy: string, sortDir: "asc" | "desc", gene: string, search: string, spFilter: string) => {
      if (vectorSpecies.length === 0) return;
      let active = true;
      setGenbankLoading(true);

      const speciesList = spFilter === "all"
        ? vectorSpecies.map((s) => s.name)
        : [spFilter];

      Promise.all(
        speciesList.map(async (sp) => {
          try {
            const res = await fetchGenBank(sp, { limit: 1000 });
            return res?.records || [];
          } catch {
            return [];
          }
        })
      ).then((results) => {
        if (!active) return;
        let all = results.flat();

        if (gene && gene !== "all") {
          all = all.filter((m) => m.record.gene === gene);
        }
        if (search) {
          const q = search.toLowerCase();
          all = all.filter((m) =>
            m.record.accession.toLowerCase().includes(q) ||
            (m.record.definition && m.record.definition.toLowerCase().includes(q)) ||
            (m.record.host && m.record.host.toLowerCase().includes(q)) ||
            (m.record.location && m.record.location.toLowerCase().includes(q)) ||
            (m.record.species && m.record.species.toLowerCase().includes(q))
          );
        }

        all.sort((a, b) => {
          const av = (a.record as any)[sortBy];
          const bv = (b.record as any)[sortBy];
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          if (typeof av === "number" && typeof bv === "number") {
            return sortDir === "desc" ? bv - av : av - bv;
          }
          return sortDir === "desc" ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
        });

        const total = all.length;
        const totalPages = Math.ceil(total / 20) || 1;
        const start = (page - 1) * 20;

        setGenbankAllRecords(all);
        setGenbankTotal(total);
        setGenbankTotalPages(totalPages);
        setGenbankLoading(false);
      }).catch(() => { if (active) setGenbankLoading(false); });

      return () => { active = false; };
    },
    [vectorSpecies]
  );

  useEffect(() => {
    return loadGenBankRecords(genbankPage, genbankSortBy, genbankSortDir, geneFilter, searchQuery, selectedVectorSpecies);
  }, [vectorSpecies, genbankPage, genbankSortBy, genbankSortDir, geneFilter, searchQuery, selectedVectorSpecies, loadGenBankRecords]);

  const handleSort = useCallback((col: string) => {
    setGenbankPage(1);
    if (col === genbankSortBy) {
      setGenbankSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setGenbankSortBy(col);
      setGenbankSortDir("asc");
    }
  }, [genbankSortBy]);

  const handleGeneFilter = useCallback((gene: string) => { setGeneFilter(gene); setGenbankPage(1); }, []);
  const handleSearch = useCallback((val: string) => { setSearchQuery(val); setGenbankPage(1); }, []);
  const handleVectorFilter = useCallback((sp: string) => { setSelectedVectorSpecies(sp); setGenbankPage(1); }, []);

  const data = useMemo(() => {
    const hosts: Record<string, number> = {};
    const countries: Record<string, number> = {};
    records.forEach((r) => {
      if (r.relatedHosts) hosts[r.relatedHosts] = (hosts[r.relatedHosts] || 0) + 1;
      if (r.country) countries[r.country] = (countries[r.country] || 0) + 1;
    });
    return {
      hosts: Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      hostCount: Object.keys(hosts).length,
      countryCount: Object.keys(countries).length,
    };
  }, [records]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <span className="text-sm" style={{ color: "#A8A29E" }}>Loading...</span>
    </div>
  );

  if (!disease) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <button onClick={() => navigate("/diseases")} className="text-sm mb-4 hover:underline" style={{ color: "#134E4A" }}>&larr; Back to Diseases</button>
        <h1 className="text-2xl font-semibold" style={{ color: "#1C1917" }}>Disease</h1>
      </div>
    );
  }

  const hasEpi = records.length > 0;
  const hasGenBank = aggregatedStats.totalSequences > 0;

  return (
    <div className="max-w-7xl mx-auto px-6 py-6" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="mb-6">
        <button onClick={() => navigate("/diseases")} className="text-sm mb-1 hover:underline" style={{ color: "#134E4A" }}>&larr; Back to Diseases</button>
        <h1 className="text-2xl font-semibold" style={{ color: "#1C1917" }}>{disease}</h1>
        <p className="text-sm mt-1" style={{ color: "#57534E" }}>
          {hasEpi && <>{records.length.toLocaleString()} epi records &middot; {vectorSpecies.length} tick vectors &middot; {data.countryCount} countries</>}
          {!hasEpi && !hasGenBank && "No records found for this disease."}
          {!hasEpi && hasGenBank && <>{aggregatedStats.totalSequences.toLocaleString()} GenBank sequences across {aggregatedStats.speciesWithGenBank} species</>}
        </p>
      </div>

      {hasEpi && (
        <div className="grid grid-cols-4 gap-px mb-6" style={{ background: "#E2E5DE" }}>
          {[
            { label: "Epi Records", value: records.length },
            { label: "Tick Vectors", value: vectorSpecies.length },
            { label: "Countries", value: data.countryCount },
            { label: "Hosts", value: data.hostCount },
          ].map((m) => (
            <div key={m.label} className="px-5 py-4" style={{ background: "#FFFFFF" }}>
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>{m.label}</div>
              <div className="text-3xl font-semibold mt-1" style={{ color: "#1C1917", fontFamily: "monospace" }}>{m.value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {/* GenBank Molecular Data Section */}
      {(hasGenBank || genbankLoading) && (
        <div className="mb-6" style={{ background: "#E2E5DE" }}>
          <div className="px-5 py-3" style={{ background: "#FFFFFF", borderBottom: "1px solid #E2E5DE" }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>
                Molecular Data &mdash; GenBank
              </h3>
              {aggregatedStats.totalSequences > 0 && (
                <span className="text-xs" style={{ color: "#A8A29E", fontFamily: "monospace" }}>
                  {aggregatedStats.totalSequences.toLocaleString()} sequences across {aggregatedStats.speciesWithGenBank} vectors
                </span>
              )}
            </div>
          </div>

          {genbankLoading && aggregatedStats.totalSequences === 0 ? (
            <div className="px-5 py-10 text-center" style={{ background: "#FFFFFF" }}>
              <span className="text-xs" style={{ color: "#A8A29E" }}>Loading GenBank records for tick vectors...</span>
            </div>
          ) : aggregatedStats.totalSequences === 0 ? (
            <div className="px-5 py-10 text-center" style={{ background: "#FFFFFF" }}>
              <span className="text-xs" style={{ color: "#A8A29E" }}>No GenBank nucleotide records found for vectors of this disease.</span>
            </div>
          ) : (
            <>
              {/* Stats row */}
              <div className="grid grid-cols-4 gap-px" style={{ background: "#FFFFFF" }}>
                <div className="px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>Total Sequences</div>
                  <div className="text-xl font-semibold mt-0.5" style={{ color: "#1C1917", fontFamily: "monospace" }}>
                    {aggregatedStats.totalSequences.toLocaleString()}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>Unique Genes</div>
                  <div className="text-xl font-semibold mt-0.5" style={{ color: "#1C1917", fontFamily: "monospace" }}>
                    {aggregatedStats.genes.length}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>Countries</div>
                  <div className="text-xl font-semibold mt-0.5" style={{ color: "#1C1917", fontFamily: "monospace" }}>
                    {aggregatedStats.countries.length}
                  </div>
                </div>
                <div className="px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>Vectors with Data</div>
                  <div className="text-xl font-semibold mt-0.5" style={{ color: "#1C1917", fontFamily: "monospace" }}>
                    {aggregatedStats.speciesWithGenBank} / {vectorSpecies.length}
                  </div>
                </div>
              </div>

              {/* Vector GenBank breakdown + Gene chart */}
              <div className="grid grid-cols-2 gap-px" style={{ background: "#FFFFFF" }}>
                <div style={{ borderRight: "1px solid #E2E5DE" }}>
                  <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
                    <h4 className="text-[11px] font-semibold" style={{ color: "#1C1917" }}>GenBank Sequences per Vector</h4>
                  </div>
                  <div className="p-3 overflow-hidden" style={{ height: Math.max(200, aggregatedStats.speciesBreakdown.length * 36) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={aggregatedStats.speciesBreakdown.slice(0, 12)} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                        <YAxis type="category" dataKey="species" tick={{ fontSize: 10, fill: "#1C1917" }} tickLine={false} axisLine={false} width={160} />
                        <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                        <Bar dataKey="count" fill="#DC2626" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
                    <h4 className="text-[11px] font-semibold" style={{ color: "#1C1917" }}>Gene Distribution</h4>
                  </div>
                  <div className="p-3 overflow-hidden" style={{ height: 200 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={aggregatedStats.genes.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1C1917" }} tickLine={false} axisLine={false} width={100} />
                        <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                        <Bar dataKey="count" fill="#0F766E" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Map + Table */}
              <div style={{ background: "#FFFFFF", borderTop: "1px solid #E2E5DE" }}>
                {/* Filters row */}
                <div className="px-3 py-2 flex items-center gap-3" style={{ borderBottom: "1px solid #F0F0F0" }}>
                  <select
                    value={selectedVectorSpecies}
                    onChange={(e) => handleVectorFilter(e.target.value)}
                    className="text-[12px] px-2 py-1 rounded cursor-pointer bg-white"
                    style={{ border: "1px solid #E2E5DE", color: "#1C1917", fontFamily: "system-ui" }}
                  >
                    <option value="all">All vectors ({aggregatedStats.speciesBreakdown.length})</option>
                    {aggregatedStats.speciesBreakdown.map((s) => (
                      <option key={s.species} value={s.species}>{s.species} ({s.count})</option>
                    ))}
                  </select>
                  {aggregatedStats.genes.length > 0 && (
                    <select
                      value={geneFilter}
                      onChange={(e) => handleGeneFilter(e.target.value)}
                      className="text-[12px] px-2 py-1 rounded cursor-pointer bg-white"
                      style={{ border: "1px solid #E2E5DE", color: "#1C1917", fontFamily: "system-ui" }}
                    >
                      <option value="all">All genes</option>
                      {aggregatedStats.genes.map((g) => (
                        <option key={g.name} value={g.name}>{g.name} ({g.count})</option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    placeholder="Search accession, host, location..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="flex-1 text-[12px] px-2 py-1 rounded"
                    style={{ border: "1px solid #E2E5DE", color: "#1C1917", fontFamily: "system-ui", outline: "none" }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-px" style={{ background: "#E2E5DE" }}>
                  <div style={{ background: "#FFFFFF", minHeight: 400 }}>
                    <DiseaseGenBankMap
                      records={genbankAllRecords.slice((genbankPage - 1) * 20, genbankPage * 20)}
                      centerLat={null}
                      centerLng={null}
                    />
                  </div>
                  <div style={{ background: "#FFFFFF" }}>
                    <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
                      <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            {SORT_COLUMNS.map((col) => (
                              <SortHeader key={col.key} column={col.key} label={col.label} sortBy={genbankSortBy} sortDir={genbankSortDir} onSort={handleSort} />
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {genbankAllRecords.slice((genbankPage - 1) * 20, genbankPage * 20).map((m, i) => (
                            <tr key={m.record.accession + i} style={{ borderBottom: "1px solid #F0F0F0" }} className="hover:bg-gray-50 transition-colors">
                              <td className="px-3 py-2">
                                <a href={`${NCBI_BASE}${m.record.accession}`} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium hover:underline" style={{ color: "#2563EB", fontFamily: "monospace" }}>{m.record.accession}</a>
                              </td>
                              <td className="px-3 py-2 text-[11px]" style={{ color: "#DC2626" }}>
                                {m.record.species || "\u2014"}
                              </td>
                              <td className="px-3 py-2"><GeneBadge gene={m.record.gene} /></td>
                              <td className="px-3 py-2 text-[12px]" style={{ color: "#1C1917", fontFamily: "monospace" }}>
                                {m.record.sequenceLength?.toLocaleString() || "\u2014"}
                                {m.record.sequenceLength && <span style={{ color: "#A8A29E" }}> bp</span>}
                              </td>
                              <td className="px-3 py-2 text-[12px]" style={{ color: "#57534E" }}>{m.record.location || "\u2014"}</td>
                              <td className="px-3 py-2 text-[12px]" style={{ color: "#57534E" }}>{m.record.host || "\u2014"}</td>
                              <td className="px-3 py-2 text-[12px]" style={{ color: "#57534E", fontFamily: "monospace" }}>{m.record.collectionDate || "\u2014"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination page={genbankPage} totalPages={genbankTotalPages} onPage={setGenbankPage} />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Epidemiological Charts */}
      {hasEpi && (
        <>
          <div className="grid grid-cols-2 gap-px mb-6" style={{ background: "#E2E5DE" }}>
            <div style={{ background: "#FFFFFF" }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
                <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Tick Vectors</h3>
              </div>
              <div className="p-3">
                <ResponsiveContainer width="100%" height={Math.max(200, vectorSpecies.length * 36)}>
                  <BarChart data={vectorSpecies} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#1C1917" }} tickLine={false} axisLine={false} width={200} />
                    <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                    <Bar dataKey="count" fill="#DC2626" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{ background: "#FFFFFF" }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
                <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Countries</h3>
              </div>
              <div className="p-3">
                <ResponsiveContainer width="100%" height={Math.max(200, data.countries.length * 36)}>
                  <BarChart data={data.countries} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#1C1917" }} tickLine={false} axisLine={false} width={120} />
                    <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                    <Bar dataKey="count" fill="#134E4A" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div style={{ background: "#FFFFFF", border: "1px solid #E2E5DE" }}>
            <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
              <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Animal Hosts</h3>
            </div>
            <div className="p-3">
              <ResponsiveContainer width="100%" height={Math.max(200, data.hosts.length * 36)}>
                <BarChart data={data.hosts} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#1C1917" }} tickLine={false} axisLine={false} width={200} />
                  <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                  <Bar dataKey="count" fill="#D97706" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
