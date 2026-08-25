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
  { key: "gene", label: "Gene" },
  { key: "sequenceLength", label: "Length" },
  { key: "location", label: "Location" },
  { key: "host", label: "Host" },
  { key: "collectionDate", label: "Date" },
] as const;

function GenBankMap({
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
          paint: {
            "text-color": "#FFFFFF",
          },
        });

        map.addLayer({
          id: "genbank-unclustered",
          type: "circle",
          source: "genbank-points",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-radius": 6,
            "circle-color": "#2563EB",
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
          const pointCount = f.properties?.point_count;
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

        map.on("mouseenter", "genbank-clusters", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "genbank-clusters", () => {
          map.getCanvas().style.cursor = "";
        });
      }

      if (centerLat != null && centerLng != null && isFinite(centerLat) && isFinite(centerLng)) {
        const el = document.createElement("div");
        el.style.cssText =
          "width:12px;height:12px;background:#DC2626;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3)";
        new maplibregl.Marker({ element: el })
          .setLngLat([centerLng, centerLat])
          .setPopup(
            new maplibregl.Popup({ closeButton: false }).setHTML(
              '<div style="font-family:system-ui;font-size:12px;font-weight:600">Occurrence centroid</div>'
            )
          )
          .addTo(map);
      }
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [records, centerLat, centerLng]);

  return <div ref={containerRef} className="w-full h-full min-h-[340px]" />;
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
  column,
  label,
  sortBy,
  sortDir,
  onSort,
}: {
  column: string;
  label: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (col: string) => void;
}) {
  const active = sortBy === column;
  return (
    <th
      className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider sticky top-0 cursor-pointer select-none hover:text-stone-700 transition-colors"
      style={{
        color: active ? "#134E4A" : "#A8A29E",
        background: "#FFFFFF",
        borderBottom: "1px solid #E2E5DE",
      }}
      onClick={() => onSort(column)}
    >
      {label}
      {active && (
        <span className="ml-1">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>
      )}
    </th>
  );
}

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-1 py-3">
      <button
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="px-2 py-1 text-[11px] rounded disabled:opacity-30 hover:bg-stone-100"
        style={{ color: "#134E4A" }}
      >
        &lsaquo; Prev
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`e${i}`} className="px-1 text-[11px]" style={{ color: "#A8A29E" }}>
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPage(p as number)}
            className="px-2 py-1 text-[11px] rounded font-medium"
            style={{
              background: p === page ? "#134E4A" : "transparent",
              color: p === page ? "#FFFFFF" : "#1C1917",
            }}
          >
            {p}
          </button>
        )
      )}
      <button
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        className="px-2 py-1 text-[11px] rounded disabled:opacity-30 hover:bg-stone-100"
        style={{ color: "#134E4A" }}
      >
        Next &rsaquo;
      </button>
    </div>
  );
}

const CHART_HEIGHT = 240;

export function SpeciesPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const species = name || "";
  const [records, setRecords] = useState<EpidemiologicalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [genbankRecords, setGenbankRecords] = useState<GenBankMatch[]>([]);
  const [genbankLoading, setGenbankLoading] = useState(false);
  const [genbankTotal, setGenbankTotal] = useState(0);
  const [genbankPage, setGenbankPage] = useState(1);
  const [genbankTotalPages, setGenbankTotalPages] = useState(1);
  const [genbankSortBy, setGenbankSortBy] = useState("accession");
  const [genbankSortDir, setGenbankSortDir] = useState<"asc" | "desc">("asc");
  const [geneFilter, setGeneFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [genbankStats, setGenbankStats] = useState<GenBankStats | null>(null);

  useEffect(() => {
    if (!species) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    setRecords([]);
    fetchEpidemiological({ species, limit: 50000 })
      .then((res) => { if (active) { setRecords(res.data); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [species]);

  const loadGenBank = useCallback(
    (page: number, sortBy: string, sortDir: "asc" | "desc", gene: string, search: string) => {
      if (!species) return;
      let active = true;
      setGenbankLoading(true);
      fetchGenBank(species, { page, limit: 20, sortBy, sortDir, gene: gene === "all" ? undefined : gene, search: search || undefined })
        .then((res) => {
          if (!active) return;
          setGenbankRecords(res?.records || []);
          setGenbankTotal(res?.total || 0);
          setGenbankTotalPages(res?.totalPages || 1);
          setGenbankLoading(false);
        })
        .catch(() => { if (active) setGenbankLoading(false); });
      return () => { active = false; };
    },
    [species]
  );

  useEffect(() => {
    setGenbankPage(1);
    setGenbankSortBy("accession");
    setGenbankSortDir("asc");
    setGeneFilter("all");
    setSearchQuery("");
    setGenbankStats(null);

    if (species) {
      fetchGenBankStats(species).then(setGenbankStats).catch(() => setGenbankStats(null));
    }
  }, [species]);

  useEffect(() => {
    return loadGenBank(genbankPage, genbankSortBy, genbankSortDir, geneFilter, searchQuery);
  }, [species, genbankPage, genbankSortBy, genbankSortDir, geneFilter, searchQuery, loadGenBank]);

  const handleSort = useCallback((col: string) => {
    setGenbankPage(1);
    if (col === genbankSortBy) {
      setGenbankSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setGenbankSortBy(col);
      setGenbankSortDir("asc");
    }
  }, [genbankSortBy]);

  const handleGeneFilter = useCallback((gene: string) => {
    setGeneFilter(gene);
    setGenbankPage(1);
  }, []);

  const handleSearch = useCallback((val: string) => {
    setSearchQuery(val);
    setGenbankPage(1);
  }, []);

  const countryData = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => { if (r.country) counts[r.country] = (counts[r.country] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => ({ name: n, count: c }));
  }, [records]);

  const hostData = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => { if (r.relatedHosts) counts[r.relatedHosts] = (counts[r.relatedHosts] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => ({ name: n, count: c }));
  }, [records]);

  const diseaseData = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => { if (r.epidemiologicalDisease) counts[r.epidemiologicalDisease] = (counts[r.epidemiologicalDisease] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => ({
      name: n.length > 25 ? n.slice(0, 25) + "..." : n,
      count: c,
    }));
  }, [records]);

  const yearlyData = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => {
      const y = r.yearStart;
      if (y === null || y === undefined) return;
      counts[y] = (counts[y] || 0) + 1;
    });
    return Object.entries(counts).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([y, c]) => ({ year: y, count: c }));
  }, [records]);

  const occurrenceLatLng = useMemo(() => {
    const withCoords = records.filter(
      (r) => typeof r.latitude === "number" && typeof r.longitude === "number"
    );
    if (withCoords.length === 0) return { lat: null, lng: null };
    const lat = withCoords.reduce((s, r) => s + r.latitude!, 0) / withCoords.length;
    const lng = withCoords.reduce((s, r) => s + r.longitude!, 0) / withCoords.length;
    return { lat, lng };
  }, [records]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <span className="text-sm" style={{ color: "#A8A29E" }}>Loading...</span>
    </div>
  );

  if (!species || records.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <button onClick={() => navigate("/species")} className="text-sm mb-4 hover:underline" style={{ color: "#134E4A" }}>&larr; Back to Species</button>
        <h1 className="text-2xl font-semibold" style={{ color: "#1C1917" }}>{species || "Species"}</h1>
        <div className="mt-4 px-5 py-8 text-center" style={{ background: "#FFFFFF", border: "1px solid #E2E5DE" }}>
          <p className="text-sm" style={{ color: "#57534E" }}>
            No records found for this species. Try the search box in the header.
          </p>
        </div>
      </div>
    );
  }

  const hostCount = new Set(records.map(r => r.relatedHosts).filter(Boolean)).size;
  const diseaseCount = new Set(records.map(r => r.epidemiologicalDisease).filter(Boolean)).size;
  const countryCount = new Set(records.map(r => r.country).filter(Boolean)).size;

  return (
    <div className="max-w-7xl mx-auto px-6 py-6" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="mb-6">
        <button onClick={() => navigate("/species")} className="text-sm mb-1 hover:underline" style={{ color: "#134E4A" }}>&larr; Back to Species</button>
        <h1 className="text-2xl font-semibold" style={{ color: "#1C1917" }}>{species}</h1>
        <p className="text-sm mt-1" style={{ color: "#57534E" }}>
          {records.length.toLocaleString()} records &middot; {countryCount} countries &middot; {hostCount} hosts &middot; {diseaseCount} diseases
        </p>
      </div>

      <div className="grid grid-cols-4 gap-px mb-6" style={{ background: "#E2E5DE" }}>
        {[
          { label: "Epi Records", value: records.length },
          { label: "Countries", value: countryCount },
          { label: "Hosts", value: hostCount },
          { label: "Diseases", value: diseaseCount },
        ].map((m) => (
          <div key={m.label} className="px-5 py-4" style={{ background: "#FFFFFF" }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>{m.label}</div>
            <div className="text-3xl font-semibold mt-1" style={{ color: "#1C1917", fontFamily: "monospace" }}>{m.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* GenBank Section */}
      <div className="mb-6" style={{ background: "#E2E5DE" }}>
        <div className="px-5 py-3" style={{ background: "#FFFFFF", borderBottom: "1px solid #E2E5DE" }}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>
              Molecular Data &mdash; GenBank
            </h3>
            {genbankTotal > 0 && (
              <span className="text-xs" style={{ color: "#A8A29E", fontFamily: "monospace" }}>
                {genbankTotal.toLocaleString()} sequences
              </span>
            )}
          </div>

          {genbankStats && genbankStats.genes.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>Gene</span>
              <select
                value={geneFilter}
                onChange={(e) => handleGeneFilter(e.target.value)}
                className="text-[12px] px-2 py-1 rounded cursor-pointer bg-white"
                style={{ border: "1px solid #E2E5DE", color: "#1C1917", fontFamily: "system-ui" }}
              >
                <option value="all">All genes ({genbankStats.total})</option>
                {genbankStats.genes.map((g) => (
                  <option key={g.name} value={g.name}>{g.name} ({g.count})</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ background: "#FFFFFF" }}>
          {genbankLoading && genbankRecords.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <span className="text-xs" style={{ color: "#A8A29E" }}>Loading GenBank records...</span>
            </div>
          ) : genbankTotal === 0 && !genbankLoading ? (
            <div className="px-5 py-10 text-center">
              <span className="text-xs" style={{ color: "#A8A29E" }}>
                No GenBank nucleotide records found for this species.
              </span>
            </div>
          ) : (
            <>
              {/* Stats row */}
              {genbankStats && (
                <div className="grid grid-cols-4 gap-px" style={{ borderBottom: "1px solid #E2E5DE" }}>
                  <div className="px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>Total Sequences</div>
                    <div className="text-xl font-semibold mt-0.5" style={{ color: "#1C1917", fontFamily: "monospace" }}>
                      {genbankStats.total.toLocaleString()}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>Unique Genes</div>
                    <div className="text-xl font-semibold mt-0.5" style={{ color: "#1C1917", fontFamily: "monospace" }}>
                      {genbankStats.genes.length}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>Countries</div>
                    <div className="text-xl font-semibold mt-0.5" style={{ color: "#1C1917", fontFamily: "monospace" }}>
                      {genbankStats.countries.length}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>Avg Length</div>
                    <div className="text-xl font-semibold mt-0.5" style={{ color: "#1C1917", fontFamily: "monospace" }}>
                      {genbankStats.sequenceLength ? `${genbankStats.sequenceLength.mean.toLocaleString()} bp` : "\u2014"}
                    </div>
                  </div>
                </div>
              )}

              {/* Map + Table */}
              <div className="grid grid-cols-2 gap-px" style={{ background: "#E2E5DE" }}>
                <div style={{ background: "#FFFFFF", minHeight: 380 }}>
                  {occurrenceLatLng.lat !== null || genbankRecords.some((m) => m.record.latitude !== null) ? (
                    <GenBankMap
                      records={genbankRecords}
                      centerLat={occurrenceLatLng.lat}
                      centerLng={occurrenceLatLng.lng}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full min-h-[340px] px-6">
                      <p className="text-xs text-center" style={{ color: "#A8A29E" }}>
                        Geographic coordinates not available for these records.
                      </p>
                    </div>
                  )}
                </div>
                <div style={{ background: "#FFFFFF" }}>
                  {/* Search bar */}
                  <div className="px-3 py-2" style={{ borderBottom: "1px solid #F0F0F0" }}>
                    <input
                      type="text"
                      placeholder="Search accession, host, location..."
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      className="w-full text-[12px] px-2 py-1 rounded"
                      style={{ border: "1px solid #E2E5DE", color: "#1C1917", fontFamily: "system-ui", outline: "none" }}
                    />
                  </div>
                  <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
                    <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          {SORT_COLUMNS.map((col) => (
                            <SortHeader
                              key={col.key}
                              column={col.key}
                              label={col.label}
                              sortBy={genbankSortBy}
                              sortDir={genbankSortDir}
                              onSort={handleSort}
                            />
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {genbankRecords.map((m, i) => (
                          <tr
                            key={m.record.accession + i}
                            style={{ borderBottom: "1px solid #F0F0F0" }}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="px-3 py-2">
                              <a
                                href={`${NCBI_BASE}${m.record.accession}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[12px] font-medium hover:underline"
                                style={{ color: "#2563EB", fontFamily: "monospace" }}
                              >
                                {m.record.accession}
                              </a>
                            </td>
                            <td className="px-3 py-2">
                              <GeneBadge gene={m.record.gene} />
                            </td>
                            <td className="px-3 py-2 text-[12px]" style={{ color: "#1C1917", fontFamily: "monospace" }}>
                              {m.record.sequenceLength?.toLocaleString() || "\u2014"}
                              {m.record.sequenceLength && <span style={{ color: "#A8A29E" }}> bp</span>}
                            </td>
                            <td className="px-3 py-2 text-[12px]" style={{ color: "#57534E" }}>
                              {m.record.location || "\u2014"}
                              {m.distanceKm !== null && (
                                <span className="text-[10px] ml-1" style={{ color: "#A8A29E" }}>
                                  ({Math.round(m.distanceKm)} km)
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-[12px]" style={{ color: "#57534E" }}>
                              {m.record.host || "\u2014"}
                            </td>
                            <td className="px-3 py-2 text-[12px]" style={{ color: "#57534E", fontFamily: "monospace" }}>
                              {m.record.collectionDate || "\u2014"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination page={genbankPage} totalPages={genbankTotalPages} onPage={setGenbankPage} />
                </div>
              </div>

              {/* Gene breakdown chart */}
              {genbankStats && genbankStats.genes.length > 0 && (
                <div className="grid grid-cols-2 gap-px" style={{ background: "#E2E5DE", borderTop: "1px solid #E2E5DE" }}>
                  <div style={{ background: "#FFFFFF" }}>
                    <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
                      <h4 className="text-[11px] font-semibold" style={{ color: "#1C1917" }}>Gene Distribution</h4>
                    </div>
                    <div className="p-3 overflow-hidden" style={{ height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={genbankStats.genes.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1C1917" }} tickLine={false} axisLine={false} width={100} />
                          <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                          <Bar dataKey="count" fill="#0F766E" radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div style={{ background: "#FFFFFF" }}>
                    <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
                      <h4 className="text-[11px] font-semibold" style={{ color: "#1C1917" }}>GenBank Hosts</h4>
                    </div>
                    <div className="p-3 overflow-hidden" style={{ height: 200 }}>
                      {genbankStats.hosts.length === 0 ? (
                        <p className="text-xs py-4 text-center" style={{ color: "#A8A29E" }}>No host data available</p>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={genbankStats.hosts.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 11, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#1C1917" }} tickLine={false} axisLine={false} width={120} />
                            <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                            <Bar dataKey="count" fill="#D97706" radius={[0, 3, 3, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Epidemiological Charts */}
      <div className="grid grid-cols-2 gap-px mb-6" style={{ background: "#E2E5DE" }}>
        <div style={{ background: "#FFFFFF" }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
            <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Records by Country</h3>
          </div>
          <div className="p-3 overflow-hidden" style={{ height: CHART_HEIGHT }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={countryData} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1C1917" }} tickLine={false} axisLine={false} width={100} />
                <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                <Bar dataKey="count" fill="#134E4A" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={{ background: "#FFFFFF" }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
            <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Animal Hosts</h3>
          </div>
          <div className="p-3 overflow-hidden" style={{ height: CHART_HEIGHT }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hostData} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1C1917" }} tickLine={false} axisLine={false} width={100} />
                <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                <Bar dataKey="count" fill="#D97706" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div style={{ background: "#FFFFFF" }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
            <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Associated Diseases</h3>
          </div>
          <div className="p-3 overflow-hidden" style={{ height: CHART_HEIGHT }}>
            {diseaseData.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "#A8A29E" }}>No disease data recorded for this species</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={diseaseData} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#1C1917" }} tickLine={false} axisLine={false} width={140} />
                  <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                  <Bar dataKey="count" fill="#DC2626" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div style={{ background: "#FFFFFF" }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
            <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Records Over Time</h3>
          </div>
          <div className="p-3 overflow-hidden" style={{ height: CHART_HEIGHT }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yearlyData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" vertical={false} />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 10, fill: "#A8A29E", fontFamily: "monospace" }}
                  tickLine={false}
                  axisLine={{ stroke: "#E2E5DE" }}
                  interval={yearlyData.length > 15 ? Math.floor(yearlyData.length / 8) : 0}
                  angle={yearlyData.length > 20 ? -45 : 0}
                  textAnchor={yearlyData.length > 20 ? "end" : "middle"}
                  height={yearlyData.length > 20 ? 40 : 25}
                />
                <YAxis tick={{ fontSize: 11, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                <Bar dataKey="count" fill="#134E4A" radius={[3, 3, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
