import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { atlas } from "../common/Atlas";

export interface HealthLayerStats {
  cells: number;
  median_min: number;
  within_60_pct: number;
  within_120_pct: number;
  within_240_pct: number;
}

export interface HealthLayer {
  id: string;
  title: string;
  detail: string;
  units: string;
  tiles: number;
  stats: HealthLayerStats;
}

export interface HealthFacilitiesMeta {
  total: number;
  mapped: number;
  dropped: number;
  countries: number;
  classes: Record<string, number>;
  ownership: Record<string, number>;
}

export interface HealthMeta {
  breaks: number[];
  colors: number[][];
  layers: HealthLayer[];
  facilities: HealthFacilitiesMeta;
}

type AnyGeoJSON = any;

export const FAC_CLASSES = [
  { key: "Hospital", color: "#DC2626" },
  { key: "Clinic", color: "#F59E0B" },
  { key: "Health centre", color: "#2563EB" },
  { key: "Post / primary", color: "#10B981" },
  { key: "Other", color: "#9CA3AF" },
];

const CLUSTER_COLORS = ["#D1FAE5", "#5EEAD4", "#2DD4BF", "#0F766E", "#134E4A"];
const TILE_PATTERN = (id: string) => `/health/traveltime/${id}/{z}/{x}/{y}.png`;

let metaCache: Promise<HealthMeta> | null = null;
export function fetchHealthMeta(): Promise<HealthMeta> {
  if (!metaCache) metaCache = fetch("/health/meta.json").then((r) => r.json());
  return metaCache;
}

let facCache: Promise<AnyGeoJSON> | null = null;
export function fetchFacilities(): Promise<AnyGeoJSON> {
  if (!facCache) facCache = fetch("/health/facilities.geojson").then((r) => r.json());
  return facCache;
}

export function HealthMap({
  layers,
  activeId,
  showFacilities,
}: {
  layers: HealthLayer[];
  activeId: string;
  showFacilities: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;
  const showFacRef = useRef(showFacilities);
  showFacRef.current = showFacilities;

  const activeLayer = useMemo(() => layers.find((l) => l.id === activeId) || layers[0], [layers, activeId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      bounds: [[-26, -36], [55, 38]],
      attributionControl: false,
      maxZoom: 7,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      for (const l of layers) {
        map.addSource("tt-" + l.id, {
          type: "raster",
          tiles: [TILE_PATTERN(l.id)],
          tileSize: 256,
          minzoom: 3,
          maxzoom: 6,
        });
        map.addLayer({
          id: "tt-layer-" + l.id,
          type: "raster",
          source: "tt-" + l.id,
          layout: { visibility: l.id === activeRef.current ? "visible" : "none" },
          paint: { "raster-opacity": 0.85, "raster-fade-duration": 0 },
        });
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    for (const l of layers) {
      map.setLayoutProperty("tt-layer-" + l.id, "visibility", l.id === activeRef.current ? "visible" : "none");
    }
  }, [mapReady, layers, activeId]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.setLayoutProperty("fac-point", "visibility", showFacRef.current ? "visible" : "none");
    mapRef.current.setLayoutProperty("fac-cluster", "visibility", showFacRef.current ? "visible" : "none");
    mapRef.current.setLayoutProperty("fac-cluster-label", "visibility", showFacRef.current ? "visible" : "none");
  }, [mapReady, showFacilities]);

  useEffect(() => {
    if (!mapReady) return;
    let active = true;
    fetchFacilities().then((gj) => {
      if (!active || !mapRef.current) return;
      const src = mapRef.current.getSource("fac") as maplibregl.GeoJSONSource;
      if (src) src.setData(gj);
    });
    return () => { active = false; };
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    const popup = new maplibregl.Popup({ closeButton: false, maxWidth: "260px" });
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
      map.off("mouseenter", "fac-point");
      map.off("mouseleave", "fac-point");
      map.off("click", "fac-cluster");
      map.off("click", "fac-point");
      popup.remove();
    };
  }, [mapReady]);

  const legendColors = COLORS.map((c) => `rgb(${c[0]},${c[1]},${c[2]})`);

  return (
    <div className="relative w-full" style={{ height: 520 }}>
      <div ref={containerRef} className="w-full h-full" />
      {!mapReady && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: "#F8FAFC" }}>
          <span className="text-sm" style={{ color: atlas.textMuted }}>Loading map…</span>
        </div>
      )}
      <div
        className="absolute left-3 bottom-3 rounded-md px-3 py-2"
        style={{ background: "rgba(255,255,255,0.94)", border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow, maxWidth: 230 }}
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: atlas.textMuted }}>
          Travel time · {activeLayer?.title || "—"}
        </div>
        <div
          className="h-2 rounded"
          style={{ background: `linear-gradient(90deg, ${legendColors.join(",")})` }}
        />
        <div className="flex justify-between text-[10px] mt-1 tabular-nums" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>
          <span>0</span>
          <span>1h</span>
          <span>4h</span>
          <span>24h+</span>
        </div>
        <div className="text-[9px] mt-1" style={{ color: atlas.textMuted }}>0 = cell containing a facility · minutes</div>
      </div>
      <div
        className="absolute right-3 top-3 rounded-md px-3 py-2"
        style={{ background: "rgba(255,255,255,0.94)", border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: atlas.textMuted }}>
          Facilities by type
        </div>
        <div className="space-y-1">
          {FAC_CLASSES.map((c) => (
            <div key={c.key} className="flex items-center gap-2 text-[11px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
              <span style={{ color: atlas.textSub }}>{c.key}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const BREAKS = [0, 30, 60, 120, 240, 480, 720, 1440];
const COLORS = [
  [22, 163, 74], [132, 204, 22], [250, 204, 21], [251, 146, 60], [249, 115, 22], [239, 68, 68], [185, 28, 28], [127, 29, 29],
];