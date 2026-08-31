import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { atlas } from "../common/Atlas";
import { FEBRILE_GENERA } from "../../lib/febrile";

type CaptureFn = () => HTMLCanvasElement;

export interface ChoroplethMeta {
  total: number;
  mapped: number;
  byGenus: Record<string, number>;
  unmappedCountries: Record<string, number>;
}

export interface ChoroplethData {
  type: "FeatureCollection";
  features: GeoJSON.Feature[];
  meta: ChoroplethMeta;
}

type AnyGeoJSON = any;

const RAMP = ["#EEF1F5", "#FEF3C7", "#FDE68A", "#FBBF24", "#F97316", "#DC2626", "#991B1B"];

function breaksFor(values: number[]): number[] {
  const nz = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (nz.length === 0) return [0];
  const max = nz[nz.length - 1];
  const q = (p: number) => nz[Math.min(nz.length - 1, Math.floor((nz.length - 1) * p))];
  const set = Array.from(new Set([0, q(0.25), q(0.5), q(0.75), q(0.9), max])).sort((a, b) => a - b);
  return set.length > 1 ? set : [0, max];
}

function featureValue(f: AnyGeoJSON, keys: string[], isTotal: boolean): number {
  const p = f.properties;
  if (isTotal) return p.d_total || 0;
  return keys.reduce((s, k) => s + (p[`d_${k}`] || 0), 0);
}

function fmt(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k` : v.toLocaleString();
}

let choroCache: Promise<ChoroplethData> | null = null;
export function fetchChoroplethData(): Promise<ChoroplethData> {
  if (!choroCache) {
    choroCache = fetch("/febrile-choropleth.geojson").then((r) => r.json());
  }
  return choroCache;
}

export function ChoroplethMap({
  data,
  keys,
  height = 420,
  registerCapture,
}: {
  data: ChoroplethData | null;
  keys: string[];
  height?: number;
  registerCapture?: (fn: CaptureFn) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const keysRef = useRef(keys);
  keysRef.current = keys;

  useEffect(() => {
    if (!registerCapture) return;
    registerCapture(() => (mapRef.current ? mapRef.current.getCanvas() : undefined as unknown as HTMLCanvasElement));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCapture]);

  const isTotal = keys.length >= FEBRILE_GENERA.length;
  const selectedKeys = isTotal ? [] : keys;

  const valueExpr = useMemo<AnyGeoJSON>(() => {
    if (isTotal) return ["get", "d_total"];
    return ["+", ...selectedKeys.map((k) => ["get", `d_${k}`])];
  }, [isTotal, selectedKeys]);

  const stops = useMemo(() => {
    if (!data) return [{ v: 0, c: RAMP[0] }, { v: 1, c: RAMP[RAMP.length - 1] }];
    const breaks = breaksFor(data.features.map((f) => featureValue(f, keys, isTotal)));
    const colors = breaks.map((_, i) => RAMP[Math.min(RAMP.length - 1, i)]);
    return breaks.map((v, i) => ({ v, c: colors[Math.min(i, colors.length - 1)] }));
  }, [data, keys, isTotal]);

  const paintExpr = useMemo<AnyGeoJSON>(() => {
    const expr: AnyGeoJSON = ["interpolate", ["linear"], ["number", valueExpr]];
    for (const s of stops) expr.push(s.v, s.c);
    return expr;
  }, [stops, valueExpr]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapReady || !data) return;
    const src = mapRef.current?.getSource("rgn") as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data as AnyGeoJSON);
  }, [mapReady, data]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (mapRef.current.getLayer("rgn-fill")) {
      mapRef.current.setPaintProperty("rgn-fill", "fill-color", paintExpr);
    }
  }, [mapReady, paintExpr]);

  useEffect(() => {
    if (!mapReady || !data) return;
    const map = mapRef.current;
    if (!map) return;
    const popup = new maplibregl.Popup({ closeButton: false, maxWidth: "280px" });
    const hlSrc = map.getSource("hl") as maplibregl.GeoJSONSource;

    map.on("mousemove", "rgn-fill", (e) => {
      const f = e.features && e.features[0];
      if (!f) return;
      map.getCanvas().style.cursor = "pointer";
      if (hlSrc) hlSrc.setData({ type: "FeatureCollection", features: [f] });
      const p = f.properties;
      const value = featureValue(f, keysRef.current, keysRef.current.length >= FEBRILE_GENERA.length);
      const rows = FEBRILE_GENERA.filter((g) => (p[`d_${g.key}`] || 0) > 0)
        .map((g) => `<div style="display:flex;align-items:center;gap:6px;margin-top:2px">
          <span style="width:8px;height:8px;border-radius:50%;background:${g.color};display:inline-block"></span>
          <span style="flex:1">${g.label}</span>
          <span style="font-weight:600;font-family:monospace">${p[`d_${g.key}`]}</span>
        </div>`).join("");
      popup.setHTML(`
        <div style="font-family:system-ui;font-size:12px;line-height:1.5">
          <div style="font-weight:700">${p.N1 || p.CN || "Region"}</div>
          <div style="color:#64748B;font-size:11px">${p.CN || ""}</div>
          <div style="margin-top:4px">
            <span style="font-weight:700;font-family:monospace">${value.toLocaleString()}</span> occurrence point${value === 1 ? "" : "s"}
          </div>
          ${rows ? `<div style="margin-top:4px;border-top:1px solid #E5E9EF;padding-top:4px">${rows}</div>` : ""}
        </div>`).setLngLat(e.lngLat).addTo(map);
    });
    map.on("mouseleave", "rgn-fill", () => {
      map.getCanvas().style.cursor = "";
      if (hlSrc) hlSrc.setData({ type: "FeatureCollection", features: [] });
      popup.remove();
    });
    return () => {
      map.off("mousemove", "rgn-fill");
      map.off("mouseleave", "rgn-fill");
      popup.remove();
    };
  }, [mapReady, data]);

  const legendMax = stops[stops.length - 1]?.v || 0;
  const legendMid = stops[Math.floor(stops.length / 2)]?.v || 0;

  return (
    <div className="relative w-full" style={{ height }}>
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
            Points per region
          </div>
          <div className="h-2 rounded" style={{ background: `linear-gradient(90deg, ${stops.map((s) => s.c).join(",")})` }} />
          <div className="flex justify-between text-[10px] mt-1 tabular-nums" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>
            <span>0</span>
            <span>{fmt(legendMid)}</span>
            <span>{fmt(legendMax)}</span>
          </div>
        </div>
      )}
    </div>
  );
}