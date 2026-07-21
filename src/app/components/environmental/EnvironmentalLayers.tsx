import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { fetchTicks, type TickRecord } from "../../lib/api";

interface LayerMeta {
  label: string;
  file: string;
  width: number;
  height: number;
  bounds: [number, number, number, number];
  vmin: number;
  vmax: number;
  unit: string;
}

const LAYERS: { key: string; label: string; period: string }[] = [
  { key: "T1", label: "T1", period: "Jan – Apr" },
  { key: "T2", label: "T2", period: "May – Aug" },
  { key: "T3", label: "T3", period: "Sep – Dec" },
];

const RASTER_CLASSES = [
  { min: 0, max: 0, color: "#E6E6E6", label: "No data" },
  { min: 0.01, max: 2, color: "#FFFFB2", label: "0 – 2" },
  { min: 2, max: 5, color: "#FED976", label: "2 – 5" },
  { min: 5, max: 8, color: "#FD8D3C", label: "5 – 8" },
  { min: 8, max: 12, color: "#F03B20", label: "8 – 12" },
  { min: 12, max: 15, color: "#BD0026", label: "12 – 15" },
  { min: 15, max: 25, color: "#800026", label: "15 – 20" },
];

const COLOR_STOPS = [
  { t: 0.00, r: 230, g: 230, b: 230 },
  { t: 0.10, r: 255, g: 255, b: 178 },
  { t: 0.25, r: 254, g: 217, b: 118 },
  { t: 0.40, r: 253, g: 160, b: 68 },
  { t: 0.60, r: 244, g: 109, b: 47 },
  { t: 0.75, r: 215, g: 48, b: 39 },
  { t: 1.00, r: 165, g: 0, b: 38 },
];

function colorToValue(r: number, g: number, b: number, vmin: number, vmax: number): number {
  let bestDist = Infinity;
  let bestT = 0;
  for (const s of COLOR_STOPS) {
    const d = (r - s.r) ** 2 + (g - s.g) ** 2 + (b - s.b) ** 2;
    if (d < bestDist) { bestDist = d; bestT = s.t; }
  }
  return vmin + bestT * (vmax - vmin);
}

function boundsToCoords(bounds: [number, number, number, number]): [number, number][] {
  return [
    [bounds[0], bounds[3]],
    [bounds[2], bounds[3]],
    [bounds[2], bounds[1]],
    [bounds[0], bounds[1]],
  ];
}

function safeRemove(m: maplibregl.Map, layerId?: string, sourceId?: string) {
  try {
    if (layerId && m.getLayer(layerId)) m.removeLayer(layerId);
    if (sourceId && m.getSource(sourceId)) m.removeSource(sourceId);
  } catch (_) {}
}

export function EnvironmentalLayers() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<maplibregl.Map | null>(null);
  const pixelData = useRef<ImageData | null>(null);

  const [loading, setLoading] = useState(true);
  const [activeLayer, setActiveLayer] = useState("T1");
  const [opacity, setOpacity] = useState(85);
  const [showTicks, setShowTicks] = useState(false);
  const [rSangOnly, setRSangOnly] = useState(true);
  const [layerMeta, setLayerMeta] = useState<Record<string, LayerMeta> | null>(null);
  const [records, setRecords] = useState<TickRecord[]>([]);
  const [cursorVal, setCursorVal] = useState<{ x: number; y: number; value: string } | null>(null);

  const metaRef = useRef<Record<string, LayerMeta> | null>(null);
  const layerRef = useRef("T1");
  metaRef.current = layerMeta;
  layerRef.current = activeLayer;

  useEffect(() => {
    Promise.all([
      fetch("/environmental/layers.json").then((r) => r.json()).catch(() => null),
      fetchTicks({ limit: 50000 }).catch(() => ({ data: [] })),
    ]).then(([meta, res]) => {
      setLayerMeta(meta);
      setRecords(res.data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (loading || !containerRef.current || mapObj.current) return;

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [18, 2],
      zoom: 3,
      minZoom: 2,
      maxZoom: 10,
    });

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    m.on("mousemove", (e) => {
      const imgData = pixelData.current;
      const meta = metaRef.current;
      if (!imgData || !meta) { setCursorVal(null); return; }
      const layer = meta[layerRef.current];
      if (!layer) { setCursorVal(null); return; }

      const { bounds, width: w, height: h, vmin, vmax } = layer;
      const col = Math.floor(((e.lngLat.lng - bounds[0]) / (bounds[2] - bounds[0])) * w);
      const row = Math.floor(((bounds[3] - e.lngLat.lat) / (bounds[3] - bounds[1])) * h);

      if (col >= 0 && col < w && row >= 0 && row < h) {
        const idx = (row * w + col) * 4;
        if (imgData.data[idx + 3] > 0) {
          const v = colorToValue(imgData.data[idx], imgData.data[idx + 1], imgData.data[idx + 2], vmin, vmax);
          const cls = RASTER_CLASSES.find((c) => v >= c.min && v < c.max);
          setCursorVal({ x: e.point.x, y: e.point.y, value: cls ? `${cls.label} ${layer.unit}` : `${v.toFixed(1)} ${layer.unit}` });
          return;
        }
      }
      setCursorVal(null);
    });

    m.on("mouseout", () => setCursorVal(null));
    mapObj.current = m;

    return () => {
      m.remove();
      mapObj.current = null;
      pixelData.current = null;
    };
  }, [loading]);

  useEffect(() => {
    const m = mapObj.current;
    if (!m || !layerMeta) return;
    const layer = layerMeta[activeLayer];
    if (!layer) return;

    function addRaster() {
      safeRemove(m, "raster-layer", "raster-layer");

      const url = `/environmental/${layer.file}`;
      const coords = boundsToCoords(layer.bounds);

      m.addSource("raster-layer", {
        type: "image",
        url,
        coordinates: coords,
      });

      m.addLayer({
        id: "raster-layer",
        type: "raster",
        source: "raster-layer",
        paint: {
          "raster-opacity": opacity / 100,
          "raster-fade-duration": 0,
          "raster-resampling": "nearest",
        },
      });

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = layer.width;
        canvas.height = layer.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          pixelData.current = ctx.getImageData(0, 0, layer.width, layer.height);
        }
      };
      img.src = url;
    }

    if (m.loaded()) {
      addRaster();
    } else {
      m.once("load", addRaster);
    }
  }, [layerMeta, activeLayer]);

  useEffect(() => {
    const m = mapObj.current;
    if (!m || !m.loaded()) return;
    if (m.getLayer("raster-layer")) {
      m.setPaintProperty("raster-layer", "raster-opacity", opacity / 100);
    }
  }, [opacity]);

  useEffect(() => {
    const m = mapObj.current;
    if (!m) return;

    let cleanup: (() => void) | undefined;

    function addTicks() {
      safeRemove(m, "tick-points", "tick-overlay");

      if (!showTicks || records.length === 0) return;

      const filtered = rSangOnly
        ? records.filter((r) => {
            const sp = (r.species || "").toLowerCase();
            return sp.includes("rhipicephalus") && sp.includes("sanguineus");
          })
        : records;

      const features: GeoJSON.Feature[] = filtered
        .filter((r) => r.latitude && r.longitude)
        .map((r) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [r.longitude!, r.latitude!] },
          properties: {
            sp: r.species || "Unknown",
            ho: r.relatedHosts || "Unknown",
            di: r.epidemiologicalDisease || "None",
            co: r.country || "Unknown",
          },
        }));

      m.addSource("tick-overlay", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });

      m.addLayer({
        id: "tick-points",
        type: "circle",
        source: "tick-overlay",
        paint: {
          "circle-radius": 4.5,
          "circle-color": rSangOnly ? "#DC2626" : "#4F46E5",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#fff",
          "circle-opacity": 0.85,
        },
      });

      const onClick = (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        if (!f?.properties) return;
        const p = f.properties;
        new maplibregl.Popup({ offset: 12, maxWidth: "260px" })
          .setLngLat(e.lngLat)
          .setHTML(`<div style="font-family:system-ui;font-size:11px;color:#1C1917;line-height:1.7">
            <div style="font-weight:600;color:#134E4A;margin-bottom:2px">${p.sp === "None" ? "—" : p.sp}</div>
            <div><span style="color:#78716C">Country:</span> ${p.co === "None" ? "—" : p.co}</div>
            <div><span style="color:#78716C">Host:</span> ${p.ho === "None" ? "—" : p.ho}</div>
            <div><span style="color:#78716C">Disease:</span> ${p.di === "None" ? "—" : p.di}</div>
          </div>`)
          .addTo(m);
      };
      const onEnter = () => { m.getCanvas().style.cursor = "pointer"; };
      const onLeave = () => { m.getCanvas().style.cursor = ""; };

      m.on("click", "tick-points", onClick);
      m.on("mouseenter", "tick-points", onEnter);
      m.on("mouseleave", "tick-points", onLeave);

      cleanup = () => {
        m.off("click", "tick-points", onClick);
        m.off("mouseenter", "tick-points", onEnter);
        m.off("mouseleave", "tick-points", onLeave);
      };
    }

    if (m.loaded()) {
      addTicks();
    } else {
      m.once("load", addTicks);
    }

    return () => {
      cleanup?.();
      safeRemove(m, "tick-points", "tick-overlay");
    };
  }, [showTicks, rSangOnly, records]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>Loading environmental layers…</span>
      </div>
    );
  }

  const activeMeta = layerMeta?.[activeLayer];
  const rSangCount = records.filter((r) => {
    const sp = (r.species || "").toLowerCase();
    return sp.includes("rhipicephalus") && sp.includes("sanguineus");
  }).length;

  return (
    <div className="flex flex-col h-[calc(100vh-44px)]" style={{ fontFamily: "var(--font-family)" }}>

      <div className="px-5 py-3 flex items-center justify-between shrink-0" style={{ background: "var(--card-bg)", borderBottom: "1px solid var(--border)" }}>
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Environmental Risk Layers</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Seasonal environmental suitability for <em>Rhipicephalus sanguineus</em> &middot; Africa
          </p>
        </div>
        <div className="flex items-center gap-1 px-2 py-1" style={{ background: "var(--surface-ground)", border: "1px solid var(--border)" }}>
          {LAYERS.map((l) => (
            <button
              key={l.key}
              onClick={() => { setActiveLayer(l.key); setCursorVal(null); }}
              className="px-3 py-1 text-xs font-medium transition-colors"
              style={{
                background: activeLayer === l.key ? "var(--accent-teal)" : "transparent",
                color: activeLayer === l.key ? "#FFFFFF" : "var(--text-secondary)",
                borderRadius: 2,
              }}
            >
              {l.label}
              <span className="ml-1 text-[10px]" style={{ color: activeLayer === l.key ? "rgba(255,255,255,0.7)" : "var(--text-muted)" }}>
                {l.period}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex-1">
        <div ref={containerRef} className="w-full h-full" />

        {cursorVal && (
          <div
            className="absolute z-20 pointer-events-none px-2.5 py-1.5 text-xs"
            style={{
              left: cursorVal.x + 16,
              top: cursorVal.y - 8,
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
              fontFamily: "monospace",
              borderRadius: 2,
            }}
          >
            <span style={{ color: "var(--text-primary)" }}>{cursorVal.value}</span>
          </div>
        )}

        <div
          className="absolute top-3 right-14 z-10 w-56"
          style={{ background: "rgba(255,255,255,0.97)", border: "1px solid var(--border)", borderRadius: 2 }}
        >
          <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--border-light)" }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Layers</div>
          </div>
          <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--border-light)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>Environmental suitability</span>
              <span className="text-[10px] px-1.5 py-0.5 font-medium" style={{ background: "var(--accent-teal-light)", color: "var(--accent-teal)", borderRadius: 2 }}>
                {LAYERS.find((l) => l.key === activeLayer)?.period}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px]" style={{ color: "var(--text-muted)", minWidth: 44 }}>Opacity</span>
              <input
                type="range"
                min={0}
                max={100}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="flex-1 h-1 accent-[#134E4A] cursor-pointer"
              />
              <span className="text-[10px] w-7 text-right" style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>
                {opacity}%
              </span>
            </div>
          </div>
          <div className="px-3 py-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={showTicks} onChange={(e) => setShowTicks(e.target.checked)} className="w-3.5 h-3.5 accent-[#134E4A]" />
              <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>Show tick occurrences</span>
            </label>
            {showTicks && (
              <div className="mt-2 ml-5 space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="radio" name="tick-filter" checked={rSangOnly} onChange={() => setRSangOnly(true)} className="w-3 h-3 accent-[#DC2626]" />
                  <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    <em>R. sanguineus</em>
                    <span className="ml-1 text-[10px]" style={{ color: "var(--text-muted)" }}>({rSangCount})</span>
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="radio" name="tick-filter" checked={!rSangOnly} onChange={() => setRSangOnly(false)} className="w-3 h-3 accent-[#4F46E5]" />
                  <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    All species
                    <span className="ml-1 text-[10px]" style={{ color: "var(--text-muted)" }}>({records.length})</span>
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>

        {activeMeta && (
          <div
            className="absolute bottom-4 left-4 z-10 px-4 py-3"
            style={{ background: "rgba(255,255,255,0.97)", border: "1px solid var(--border)", borderRadius: 2 }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
              {activeMeta.unit}
            </div>
            <div className="flex flex-col gap-0">
              {RASTER_CLASSES.map((cls, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    style={{
                      width: 28,
                      height: 8,
                      background: cls.color,
                      border: "0.5px solid rgba(0,0,0,0.1)",
                    }}
                  />
                  <span className="text-[9px]" style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>
                    {cls.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showTicks && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 px-3 py-2 flex items-center gap-4"
            style={{ background: "rgba(255,255,255,0.97)", border: "1px solid var(--border)", borderRadius: 2 }}
          >
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: rSangOnly ? "#DC2626" : "#4F46E5", border: "1.5px solid #fff", boxShadow: `0 0 0 1px ${rSangOnly ? "#DC2626" : "#4F46E5"}` }} />
              <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                {rSangOnly ? <em>R. sanguineus</em> : "All species"}
              </span>
            </div>
          </div>
        )}

        <div
          className="absolute bottom-4 right-4 z-10 px-3 py-2 max-w-[230px]"
          style={{ background: "rgba(255,255,255,0.97)", border: "1px solid var(--border)", borderRadius: 2 }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
            About this layer
          </div>
          <div className="text-[10px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Environmental suitability index for <em>R. sanguineus</em> based on bioclimatic
            variables (temperature, precipitation, humidity).
            Classified into {RASTER_CLASSES.length - 1} ranges (0–20 {activeMeta?.unit || ""}).
            {activeLayer === "T2" && " Peak transmission season (May–Aug)."}
            {activeLayer === "T3" && " Post-peak season (Sep–Dec)."}
            {activeLayer === "T1" && " Pre-transmission season (Jan–Apr)."}
          </div>
        </div>
      </div>
    </div>
  );
}
