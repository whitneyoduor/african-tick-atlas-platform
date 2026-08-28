import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { atlas } from "../common/Atlas";

export type MetricKey = "cattle" | "goat" | "sheep";

export const METRICS: { key: MetricKey; label: string; unit: string; color: string }[] = [
  { key: "cattle", label: "Cattle", unit: "heads/km²", color: "#D97706" },
  { key: "goat", label: "Goat", unit: "heads/km²", color: "#0F766E" },
  { key: "sheep", label: "Sheep", unit: "heads/km²", color: "#BE123C" },
];

export interface LivestockCountryRow {
  gid: string;
  name: string;
  cattle: number;
  goat: number;
  sheep: number;
  cattle_tot: number;
  goat_tot: number;
  sheep_tot: number;
}

export interface LivestockMeta {
  unit: string;
  years: string;
  resolution: string;
  source: string;
  africa: { cattle: number; goat: number; sheep: number };
  countries: LivestockCountryRow[];
  regions: number;
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
    cattle: number;
    goat: number;
    sheep: number;
    cattle_tot: number;
    goat_tot: number;
    sheep_tot: number;
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
const CLUSTER_COLORS = ["#D1FAE5", "#5EEAD4", "#2DD4BF", "#0F766E", "#134E4A"];

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

function breaksFor(values: number[]): number[] {
  const nz = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (nz.length === 0) return [0];
  const max = nz[nz.length - 1];
  const q = (p: number) => nz[Math.min(nz.length - 1, Math.floor((nz.length - 1) * p))];
  const set = Array.from(new Set([0, q(0.25), q(0.5), q(0.75), q(0.9), max])).sort((a, b) => a - b);
  return set.length > 1 ? set : [0, max];
}

function fmtDensity(v: number): string {
  if (v < 1) return v.toFixed(2);
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function fmtHeads(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toLocaleString();
}

export function HealthMap({
  data,
  countries,
  facilities,
  metric,
  showFacilities,
  focus,
}: {
  data: LivestockData | null;
  countries: LivestockCountries | null;
  facilities: AnyGeoJSON | null;
  metric: MetricKey;
  showFacilities: boolean;
  focus: LivestockCountryFeature | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const metricRef = useRef(metric);
  metricRef.current = metric;
  const showFacRef = useRef(showFacilities);
  showFacRef.current = showFacilities;

  const countryByCN = useMemo(() => {
    const m: Record<string, LivestockCountryFeature> = {};
    if (countries) {
      for (const f of countries.features) m[f.properties.CN] = f;
    }
    return m;
  }, [countries]);

  const activeMetric = METRICS.find((m) => m.key === metric) || METRICS[0];

  const stops = useMemo(() => {
    if (!data) return [{ v: 0, c: RAMP[0] }, { v: 1, c: RAMP[RAMP.length - 1] }];
    const values = data.features.map((f) => f.properties[metricRef.current] || 0);
    const breaks = breaksFor(values);
    const colors = breaks.map((_, i) => RAMP[Math.min(RAMP.length - 1, i)]);
    return breaks.map((v, i) => ({ v, c: colors[Math.min(i, colors.length - 1)] }));
  }, [data, metric]);

  const paintExpr = useMemo<AnyGeoJSON>(() => {
    const expr: AnyGeoJSON = ["interpolate", ["linear"], ["number", ["get", metricRef.current]]];
    for (const s of stops) expr.push(s.v, s.c);
    return expr;
  }, [stops, metric]);

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
        paint: { "line-color": "#0F172A", "line-width": 1, "line-opacity": 0.6 },
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
      map.addSource("fac", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterRadius: 45,
        clusterMaxZoom: 5,
      });
      map.addLayer({
        id: "fac-cluster",
        type: "circle",
        source: "fac",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "interpolate",
            ["linear"],
            ["get", "point_count"],
            2, CLUSTER_COLORS[0],
            20, CLUSTER_COLORS[2],
            100, CLUSTER_COLORS[3],
            1000, CLUSTER_COLORS[4],
          ],
          "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 9, 100, 20, 1000, 30],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#FFFFFF",
          "circle-opacity": 0.9,
        },
      });
      map.addLayer({
        id: "fac-cluster-label",
        type: "symbol",
        source: "fac",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10,
        },
        paint: { "text-color": "#0F172A", "text-halo-color": "#FFFFFF", "text-halo-width": 1 },
      });
      map.addLayer({
        id: "fac-point",
        type: "circle",
        source: "fac",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 2.4,
          "circle-color": [
            "match",
            ["get", "cl"],
            "Hospital", "#DC2626",
            "Clinic", "#F59E0B",
            "Health centre", "#2563EB",
            "Post / primary", "#10B981",
            "#9CA3AF",
          ],
          "circle-stroke-width": 0.5,
          "circle-stroke-color": "#FFFFFF",
          "circle-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.9],
        },
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
    if (!mapReady || !facilities) return;
    const src = mapRef.current?.getSource("fac") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(facilities);
  }, [mapReady, facilities]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (mapRef.current.getLayer("rgn-fill")) {
      mapRef.current.setPaintProperty("rgn-fill", "fill-color", paintExpr);
    }
  }, [mapReady, paintExpr]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    for (const id of ["fac-point", "fac-cluster", "fac-cluster-label"]) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", showFacRef.current ? "visible" : "none");
      }
    }
  }, [mapReady, showFacilities]);

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

    map.on("mousemove", "rgn-fill", (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      if (hlSrc) hlSrc.setData({ type: "FeatureCollection", features: [f] });
      const p = f.properties || {};
      const k = metricRef.current;
      const cty = countryByCN[p.CN];
      const rows = METRICS.map((x) => {
        const tot = cty ? cty.properties[x.key + "_tot"] : p[x.key + "_tot"];
        const d = cty ? cty.properties[x.key] : p[x.key];
        return `<div style="display:flex;align-items:center;gap:6px;margin-top:2px">
          <span style="width:8px;height:8px;border-radius:50%;background:${x.color};display:inline-block"></span>
          <span style="flex:1">${x.label}</span>
          <span style="font-weight:600;font-family:monospace">${fmtHeads(tot || 0)} heads · ${fmtDensity(d || 0)} ${x.unit}</span>
        </div>`;
      }).join("");
      if (cty) {
        popup.setHTML(`
          <div style="font-family:system-ui;font-size:12px;line-height:1.5">
            <div style="font-weight:700">${cty.properties.CN}</div>
            <div style="color:#64748B;font-size:11px">${p.N2 || ""}${p.N1 ? ` · ${p.N1}` : ""}</div>
            <div style="margin-top:4px">
              <span style="font-weight:700;font-family:monospace">${fmtHeads(cty.properties[k + "_tot"] || 0)}</span> head${cty.properties[k + "_tot"] === 1 ? "" : "s"} total
              <span style="color:#64748B">· ${fmtDensity(cty.properties[k] || 0)} ${activeMetric.unit} mean</span>
            </div>
            <div style="margin-top:4px;border-top:1px solid #E5E9EF;padding-top:4px">${rows}</div>
          </div>`).setLngLat(e.lngLat).addTo(map);
      } else {
        popup.setHTML(`
          <div style="font-family:system-ui;font-size:12px;line-height:1.5">
            <div style="font-weight:700">${p.N2 || p.N1 || "District"}</div>
            <div style="color:#64748B;font-size:11px">${p.N1 || ""}${p.CN ? ` · ${p.CN}` : ""}</div>
            <div style="margin-top:4px">
              <span style="font-weight:700;font-family:monospace">${fmtDensity(p[k] || 0)}</span> ${activeMetric.unit} mean ${activeMetric.label.toLowerCase()} density
            </div>
            <div style="margin-top:4px;border-top:1px solid #E5E9EF;padding-top:4px">${rows}</div>
          </div>`).setLngLat(e.lngLat).addTo(map);
      }
    });
    map.on("mouseleave", "rgn-fill", () => {
      map.getCanvas().style.cursor = "";
      if (hlSrc) hlSrc.setData({ type: "FeatureCollection", features: [] });
      popup.remove();
    });

    map.on("mouseenter", "fac-point", (e) => {
      map.getCanvas().style.cursor = "pointer";
      const f = e.features && e.features[0];
      if (!f) return;
      const p = f.properties || {};
      const clsColor = FAC_CLASSES.find((c) => c.key === p.cl)?.color || "#9CA3AF";
      popup.setLngLat(e.lngLat).setHTML(`
        <div style="font-family:system-ui;font-size:12px;line-height:1.5;max-width:240px">
          <div style="font-weight:700">${p.nm || "Unnamed facility"}</div>
          <div style="color:#64748B;font-size:11px;margin-top:1px">${[p.a1, p.co].filter(Boolean).join(" · ") || ""}</div>
          <div style="margin-top:5px;display:flex;align-items:center;gap:6px">
            <span style="width:9px;height:9px;border-radius:50%;display:inline-block;background:${clsColor}"></span>
            <span style="flex:1;color:${atlas.text}">${p.ft || "Health facility"}</span>
          </div>
          <div style="margin-top:3px;color:#64748B;font-size:11px">Ownership: <b style="color:${atlas.text}">${p.ow || "—"}</b></div>
        </div>`).addTo(map);
    });
    map.on("mouseleave", "fac-point", () => {
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("click", "fac-cluster", (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      const props = f.properties || {};
      const clusterId = props.cluster_id;
      const src = map.getSource("fac") as maplibregl.GeoJSONSource;
      src.getClusterExpansionZoom(clusterId).then((zoom) => {
        map.easeTo({ center: (f as AnyGeoJSON).geometry.coordinates, zoom });
      }).catch(() => {});
    });
    map.on("click", "fac-point", (e) => {
      const f = e.features && e.features[0];
      if (f && f.geometry) map.easeTo({ center: (f as AnyGeoJSON).geometry.coordinates, zoom: Math.max(map.getZoom(), 7) });
    });
    return () => {
      map.off("mousemove", "rgn-fill");
      map.off("mouseleave", "rgn-fill");
      map.off("mouseenter", "fac-point");
      map.off("mouseleave", "fac-point");
      map.off("click", "fac-cluster");
      map.off("click", "fac-point");
      popup.remove();
    };
  }, [mapReady, data, activeMetric, countryByCN]);

  const legendMax = stops[stops.length - 1]?.v || 0;
  const legendMid = stops[Math.floor(stops.length / 2)]?.v || 0;

  return (
    <div className="relative w-full" style={{ height: 420 }}>
      <div ref={containerRef} className="w-full h-full" />
      {!data && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "#F8FAFC" }}>
          <span className="text-sm" style={{ color: atlas.textMuted }}>Loading map…</span>
        </div>
      )}
      {data && (
        <div
          className="absolute left-3 bottom-3 rounded-md px-3 py-2"
          style={{ background: "rgba(255,255,255,0.94)", border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow, maxWidth: 220 }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: atlas.textMuted }}>
            {activeMetric.label} · {activeMetric.unit}
          </div>
          <div className="h-2 rounded" style={{ background: `linear-gradient(90deg, ${stops.map((s) => s.c).join(",")})` }} />
          <div className="flex justify-between text-[10px] mt-1 tabular-nums" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>
            <span>0</span>
            <span>{fmtDensity(legendMid)}</span>
            <span>{fmtDensity(legendMax)}</span>
          </div>
        </div>
      )}
    </div>
  );
}