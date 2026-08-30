import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { atlas } from "../common/Atlas";

export type MetricKey = "cattle" | "goat" | "sheep" | "population" | "mammal" | "malaria" | "facility" | "tick" | "tickvec" | "pathogen";

export type MetricKind = "density" | "rate" | "count";

export interface HealthMetric {
  key: MetricKey;
  label: string;
  unit: string;
  color: string;
  kind: MetricKind;
  noun: string;
  group: string;
  blurb: string;
}

export const METRICS: HealthMetric[] = [
  { key: "cattle", label: "Cattle density", unit: "heads/km²", color: "#D97706", kind: "density", noun: "heads", group: "Livestock & population", blurb: "Modeled cattle density" },
  { key: "goat", label: "Goat density", unit: "heads/km²", color: "#0F766E", kind: "density", noun: "heads", group: "Livestock & population", blurb: "Modeled goat density" },
  { key: "sheep", label: "Sheep density", unit: "heads/km²", color: "#BE123C", kind: "density", noun: "heads", group: "Livestock & population", blurb: "Modeled sheep density" },
  { key: "population", label: "Human population", unit: "people/km²", color: "#7C3AED", kind: "density", noun: "people", group: "Livestock & population", blurb: "Admin-2 population density" },
  { key: "mammal", label: "Mammal richness", unit: "species", color: "#4B5563", kind: "rate", noun: "species", group: "Hosts", blurb: "Mean wild-mammal species per district" },
  { key: "malaria", label: "Malaria incidence", unit: "cases/1000", color: "#B91C1C", kind: "rate", noun: "cases per 1000", group: "Hosts", blurb: "Admin-1 malaria incidence rate (2024)" },
  { key: "facility", label: "Health facilities", unit: "facilities", color: "#0EA5E9", kind: "count", noun: "facilities", group: "Records & access", blurb: "Mapped facilities per district" },
  { key: "tick", label: "Tick occurrence", unit: "records", color: "#65A30D", kind: "count", noun: "records", group: "Records & access", blurb: "Tick occurrence records per district" },
  { key: "tickvec", label: "Ticks with pathogens", unit: "records", color: "#166534", kind: "count", noun: "records", group: "Records & access", blurb: "Ticks of species known to carry tick-borne pathogens, per district" },
  { key: "pathogen", label: "Pathogen records", unit: "records", color: "#D946EF", kind: "count", noun: "records", group: "Records & access", blurb: "Disease / pathogen records per district" },
];

export const METRIC_GROUPS = ["Livestock & population", "Hosts", "Records & access"];

export const NO_DATA_FILL = "#E4E8ED";

interface LivestockCountryRow {
  gid: string;
  name: string;
  [k: string]: any;
}

interface LivestockMeta {
  unit: string;
  years: string;
  resolution: string;
  source: string;
  africa: Record<string, number>;
  countries: LivestockCountryRow[];
  regions: number;
  [k: string]: any;
}

export interface LivestockData {
  type: "FeatureCollection";
  meta: LivestockMeta;
  features: any[];
}

export interface LivestockCountryFeature {
  type: "Feature";
  properties: {
    G0: string;
    CN: string;
    centroid: [number, number];
    districts: number;
    [k: string]: any;
  };
  geometry: any;
}

export interface LivestockCountries {
  type: "FeatureCollection";
  features: LivestockCountryFeature[];
}

export const FAC_CLASSES = [
  { key: "Hospital", color: "#DC2626" },
  { key: "Clinic", color: "#F59E0B" },
  { key: "Health centre", color: "#2563EB" },
  { key: "Post / primary", color: "#10B981" },
  { key: "Other", color: "#9CA3AF" },
];

type AnyGeoJSON = any;

const RAMP = ["#EEF1F5", "#FEF3C7", "#FDE68A", "#FBBF24", "#F97316", "#DC2626", "#991B1B"];

let livestockCache: Promise<LivestockData> | null = null;
export function fetchLivestock(): Promise<LivestockData> {
  if (!livestockCache) {
    livestockCache = fetch("/health/livestock-choropleth.geojson").then((r) => r.json());
  }
  return livestockCache;
}

let countriesCache: Promise<LivestockCountries> | null = null;
export function fetchCountries(): Promise<LivestockCountries> {
  if (!countriesCache) {
    countriesCache = fetch("/health/livestock-countries.geojson").then((r) => r.json());
  }
  return countriesCache;
}

let facCache: Promise<AnyGeoJSON> | null = null;
export function fetchFacilities(): Promise<AnyGeoJSON> {
  if (!facCache) facCache = fetch("/health/facilities.geojson").then((r) => r.json());
  return facCache;
}

// Fisher-Jenks-style natural breaks (fall back to quantiles for simplicity);
// returns break thresholds + counts per class for the legend.
function classBreaks(values: number[], n = 5): { breaks: number[]; counts: number[] } {
  const nz = values.filter((v) => v > 0).sort((a, b) => a - b);
  const all = values.slice().sort((a, b) => a - b);
  if (nz.length === 0) return { breaks: [0], counts: [values.length] };
  const max = nz[nz.length - 1];
  const q = (p: number) => nz[Math.min(nz.length - 1, Math.floor((nz.length - 1) * p))];
  const qs = Array.from(new Set([0, q(0.25), q(0.5), q(0.75), q(0.9), max])).sort((a, b) => a - b);
  const breaks = qs;
  // assign each nonzero value to a class
  const counts = new Array(breaks.length).fill(0);
  for (const v of nz) {
    let ci = breaks.findIndex((b) => v <= b);
    if (ci < 0) ci = breaks.length - 1;
    counts[ci]++;
  }
  void all;
  return { breaks, counts };
}

function fmtBreak(m: HealthMetric, v: number): string {
  if (m.kind === "count") return Math.round(v).toLocaleString();
  if (v < 1) return v.toFixed(2);
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function fmtHeads(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toLocaleString();
}

/** Resolve the property key the map should colour by.
 *  When a facility class facet is active (e.g. "Hospital"), the colour metric
 *  is that class's per-district count (facility_Hospital) rather than the total. */
function layerKey(metric: MetricKey, facFacet: string | null): string {
  return facFacet && metric === "facility" ? "facility_" + facFacet.replace(/[ /\-]/g, "_") : metric;
}

/** Human label for a facility-class facet, inverting the property-key encoding. */
export function facFacetLabel(key: string): string {
  return key.replace(/_/g, " ").trim();
}

export function HealthMap({
  data,
  countries,
  metric,
  focus,
  facFacet,
  onHover,
  onSelect,
}: {
  data: LivestockData | null;
  countries: LivestockCountries | null;
  metric: MetricKey;
  focus: LivestockCountryFeature | null;
  facFacet?: string | null;
  onHover?: (feature: any | null) => void;
  onSelect?: (feature: any | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const metricRef = useRef(metric);
  metricRef.current = metric;
  const facFacetRef = useRef(facFacet ?? null);
  facFacetRef.current = facFacet ?? null;

  const countryByCN = useMemo(() => {
    const m: Record<string, LivestockCountryFeature> = {};
    if (countries) {
      for (const f of countries.features) m[f.properties.CN] = f;
    }
    return m;
  }, [countries]);

  const activeMetric = METRICS.find((m) => m.key === metric) || METRICS[0];

  const breaks = useMemo(() => {
    if (!data) return { breaks: [0], counts: [0] };
    const lk = layerKey(metricRef.current, facFacetRef.current);
    return classBreaks(data.features.map((f) => f.properties[lk]));
  }, [data, metric, facFacet]);

  const paintExpr = useMemo<AnyGeoJSON>(() => {
    const lk = layerKey(metricRef.current, facFacetRef.current);
    const colorRamps = breaks.breaks.map((b, i) => RAMP[Math.min(RAMP.length - 1, i)]);
    const interp: AnyGeoJSON = ["interpolate", ["linear"], ["to-number", ["get", lk]]];
    for (let i = 0; i < breaks.breaks.length; i++) {
      interp.push(breaks.breaks[i], colorRamps[i]);
    }
    // missing data -> distinct neutral grey (never treated as zero)
    return ["case", ["has", lk], interp, NO_DATA_FILL];
  }, [breaks, metric, facFacet]);

  const paintExprRef = useRef(paintExpr);
  paintExprRef.current = paintExpr;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      bounds: [[-20, -35], [55, 37]],
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("rgn", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("hl", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("cty", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addSource("sel", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "rgn-fill",
        type: "fill",
        source: "rgn",
        paint: { "fill-color": paintExprRef.current, "fill-opacity": 0.92 },
      });
      map.addLayer({
        id: "rgn-line",
        type: "line",
        source: "rgn",
        paint: { "line-color": "#FFFFFF", "line-width": 0.4, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "cty-line",
        type: "line",
        source: "cty",
        paint: { "line-color": "#0F172A", "line-width": 1, "line-opacity": 0.55 },
      });
      map.addLayer({
        id: "sel-fill",
        type: "fill",
        source: "sel",
        paint: { "fill-color": "rgba(13, 148, 136, 0.12)" },
      });
      map.addLayer({
        id: "sel-line",
        type: "line",
        source: "sel",
        paint: { "line-color": "#0F766E", "line-width": 2.4, "line-opacity": 0.95 },
      });
      map.addLayer({
        id: "hl-line",
        type: "line",
        source: "hl",
        paint: { "line-color": "#0F766E", "line-width": 2, "line-opacity": 0.95 },
      });
      setMapReady(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !data) return;
    const src = mapRef.current?.getSource("rgn") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data as AnyGeoJSON);
  }, [mapReady, data]);

  useEffect(() => {
    if (!mapReady || !countries) return;
    const src = mapRef.current?.getSource("cty") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(countries);
  }, [mapReady, countries]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (mapRef.current.getLayer("rgn-fill")) {
      mapRef.current.setPaintProperty("rgn-fill", "fill-color", paintExpr);
    }
  }, [mapReady, paintExpr]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    const selSrc = map.getSource("sel") as maplibregl.GeoJSONSource;
    if (!selSrc) return;
    if (focus) {
      selSrc.setData({ type: "FeatureCollection", features: [focus] });
      const [x, y] = focus.properties.centroid;
      map.flyTo({ center: [x, y], zoom: Math.max(map.getZoom(), 5), speed: 0.8 });
    } else {
      selSrc.setData({ type: "FeatureCollection", features: [] });
    }
  }, [mapReady, focus]);

  useEffect(() => {
    if (!mapReady || !data) return;
    const map = mapRef.current;
    if (!map) return;
    const popup = new maplibregl.Popup({ closeButton: false, maxWidth: "300px" });
    const hlSrc = map.getSource("hl") as maplibregl.GeoJSONSource;

    const metricRow = (m: HealthMetric, cty: LivestockCountryFeature | null, p: any, fk: string) => {
      const tot = (cty ? cty.properties[fk + "_tot"] : p[fk + "_tot"]) ?? (cty ? cty.properties[fk] : p[fk]) ?? 0;
      const val = cty ? cty.properties[fk] : p[fk];
      const has = val != null;
      let value = "no data";
      if (has) {
        if (m.kind === "count") value = `${fmtHeads(tot || 0)} ${m.noun}`;
        else if (m.kind === "rate") value = `${fmtHeads(tot || 0)} ${m.noun} · ${fmtBreak(m, val)} mean`;
        else value = `${fmtHeads(tot || 0)} ${m.noun} · ${fmtBreak(m, val)} ${m.unit}`;
      }
      return `<div style="display:flex;align-items:center;gap:6px;margin-top:2px">
        <span style="width:8px;height:8px;border-radius:50%;background:${m.color};display:inline-block"></span>
        <span style="flex:1">${m.label}</span>
        <span style="font-weight:600;font-family:monospace">${value}</span>
      </div>`;
    };

    const onMove = (e: any) => {
      const f = e.features && e.features[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      if (hlSrc) hlSrc.setData({ type: "FeatureCollection", features: [f] });
      const p = f.properties || {};
      const cty = countryByCN[p.CN];
      onHover?.(f);
      const fk = facFacetRef.current && activeMetric.key === "facility"
        ? "facility_" + facFacetRef.current.replace(/[ /\-]/g, "_")
        : activeMetric.key;
      const rows = METRICS.map((m) => metricRow(m, cty, p, m.key === "facility" ? fk : m.key)).join("");
      popup.setHTML(`
        <div style="font-family:system-ui;font-size:12px;line-height:1.5">
          <div style="font-weight:700">${p.N2 || p.N1 || "District"}${cty ? ` · ${cty.properties.CN}` : ""}</div>
          <div style="margin-top:4px;border-top:1px solid #E5E9EF;padding-top:4px">${rows}</div>
        </div>`).setLngLat(e.lngLat).addTo(map);
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      if (hlSrc) hlSrc.setData({ type: "FeatureCollection", features: [] });
      popup.remove();
      onHover?.(null);
    };
    const onPick = (e: any) => {
      const f = e.features && e.features[0];
      if (f) onSelect?.(f);
    };

    map.on("mousemove", "rgn-fill", onMove);
    map.on("mouseleave", "rgn-fill", onLeave);
    map.on("click", "rgn-fill", onPick);

    return () => {
      map.off("mousemove", "rgn-fill", onMove);
      map.off("mouseleave", "rgn-fill", onLeave);
      map.off("click", "rgn-fill", onPick);
      popup.remove();
    };
  }, [mapReady, data, countryByCN, onHover, onSelect, metric]);

  const legendBreaks = breaks.breaks;
  const legendSteps: { from: number; to: number; i: number }[] = [];
  for (let i = 0; i < legendBreaks.length; i++) {
    const from = legendBreaks[i];
    const to = i + 1 < legendBreaks.length ? legendBreaks[i + 1] : legendBreaks[i];
    legendSteps.push({ from, to, i });
  }

  return (
    <div className="relative w-full" style={{ height: 460 }}>
      <div ref={containerRef} className="w-full h-full" />
      {!data && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "#F8FAFC" }}>
          <span className="text-sm" style={{ color: atlas.textMuted }}>Loading map…</span>
        </div>
      )}
      {data && (
        <div
          className="absolute left-3 bottom-3 rounded-md px-3 py-2 w-[230px]"
          style={{ background: "rgba(255,255,255,0.96)", border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: atlas.textMuted }}>
            {facFacet && metric === "facility" ? `${facFacet} facilities · count` : `${activeMetric.label} · ${activeMetric.unit}`}
          </div>
          <div className="h-2 rounded" style={{ background: `linear-gradient(90deg, ${legendSteps.map((s) => RAMP[Math.min(RAMP.length - 1, s.i)]).join(",")})` }} />
          <div className="flex justify-between text-[10px] mt-1 tabular-nums" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>
            <span>{fmtBreak(activeMetric, legendBreaks[0])}</span>
            <span>{fmtBreak(activeMetric, legendBreaks[Math.floor(legendBreaks.length / 2)])}</span>
            <span>{fmtBreak(activeMetric, legendBreaks[legendBreaks.length - 1])}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-2 pt-1.5" style={{ borderTop: `1px solid ${atlas.grid}`, color: atlas.textMuted, fontSize: 10 }}>
            <span className="w-3 h-2 rounded-sm shrink-0" style={{ background: NO_DATA_FILL }} />
            <span>No data for this district</span>
          </div>
        </div>
      )}
    </div>
  );
}