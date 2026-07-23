import { useEffect, useRef, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { type TickRecord } from "../../lib/api";

const AFRICA_BBOX = [-25, -40, 55, 40];

type Layer = "occurrence" | "richness" | "hosts" | "disease" | "prevalence" | "density";

interface TickMapProps {
  activeLayer: Layer;
  records: TickRecord[];
}

export function TickMap({ activeLayer, records }: TickMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapObj = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const recordsRef = useRef<TickRecord[]>(records);
  const layerRef = useRef<Layer>(activeLayer);

  recordsRef.current = records;
  layerRef.current = activeLayer;

  const geojsonData = useMemo(() => buildGeoJSON(records), [records]);

  useEffect(() => {
    if (!container.current || mapObj.current) return;

    const m = new maplibregl.Map({
      container: container.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [25, 0],
      zoom: 3.5,
      maxBounds: AFRICA_BBOX as [number, number, number, number],
    });

    m.addControl(new maplibregl.NavigationControl(), "top-right");

    m.on("load", () => {
      ready.current = true;
      const data = buildGeoJSON(recordsRef.current);
      m.addSource("ticks", { type: "geojson", data });

      m.addLayer({
        id: "heatmap",
        type: "heatmap",
        source: "ticks",
        layout: { visibility: "none" },
        paint: {
          "heatmap-weight": 1,
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 10, 3],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.2, "#fef3c7",
            0.4, "#f59e0b",
            0.6, "#dc2626",
            0.8, "#7f1d1d",
            1, "#450a0a",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 4, 10, 25],
          "heatmap-opacity": 0.75,
        },
      });

      m.addLayer({
        id: "points",
        type: "circle",
        source: "ticks",
        paint: {
          "circle-radius": 5,
          "circle-color": "#134E4A",
          "circle-opacity": 0.9,
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#fff",
        },
      });

      m.on("click", "points", (e) => {
        const p = e.features?.[0]?.properties;
        if (p) {
          new maplibregl.Popup({ offset: 10 })
            .setLngLat(e.lngLat)
            .setHTML(`<div style="font-family:system-ui;font-size:12px;color:#1C1917;line-height:1.6">
              <b style="color:#134E4A">${p.sp === "None" ? "—" : p.sp}</b><br>
              <span style="color:#78716C">Host:</span> ${p.ho === "None" ? "—" : p.ho}<br>
              <span style="color:#78716C">Disease:</span> ${p.di === "None" ? "—" : p.di}
            </div>`)
            .addTo(m);
        }
      });

      m.on("mouseenter", "points", () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "points", () => { m.getCanvas().style.cursor = ""; });

      applyStyle(m, layerRef.current);
    });

    mapObj.current = m;
    return () => { m.remove(); mapObj.current = null; ready.current = false; };
  }, []);

  useEffect(() => {
    const m = mapObj.current;
    if (!m || !ready.current) return;
    const src = m.getSource("ticks") as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(geojsonData);
      applyStyle(m, activeLayer);
    }
  }, [geojsonData, activeLayer]);

  return <div ref={container} className="w-full h-full" />;
}

function buildGeoJSON(records: TickRecord[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: records
      .filter((r) => r.latitude && r.longitude)
      .map((r) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [r.longitude!, r.latitude!] },
        properties: {
          sp: r.species || "Unknown",
          ho: r.relatedHosts || "Unknown",
          di: r.epidemiologicalDisease || "None",
        },
      })),
  };
}

function applyStyle(m: maplibregl.Map, layer: Layer) {
  const isDensity = layer === "density";
  m.setLayoutProperty("points", "visibility", isDensity ? "none" : "visible");
  m.setLayoutProperty("heatmap", "visibility", isDensity ? "visible" : "none");

  if (isDensity) return;

  const p = "points";

  switch (layer) {
    case "occurrence":
      m.setPaintProperty(p, "circle-radius", 4);
      m.setPaintProperty(p, "circle-color", "#134E4A");
      m.setPaintProperty(p, "circle-stroke-width", 1.5);
      m.setPaintProperty(p, "circle-stroke-color", "#fff");
      m.setPaintProperty(p, "circle-opacity", 0.85);
      break;

    case "richness":
      m.setPaintProperty(p, "circle-radius", 5);
      m.setPaintProperty(p, "circle-color", "#4338CA");
      m.setPaintProperty(p, "circle-stroke-width", 2);
      m.setPaintProperty(p, "circle-stroke-color", "#fff");
      m.setPaintProperty(p, "circle-opacity", 0.9);
      break;

    case "hosts":
      m.setPaintProperty(p, "circle-radius", 5);
      m.setPaintProperty(p, "circle-color", "#D97706");
      m.setPaintProperty(p, "circle-stroke-width", 2);
      m.setPaintProperty(p, "circle-stroke-color", "#fff");
      m.setPaintProperty(p, "circle-opacity", 0.9);
      break;

    case "disease":
      m.setPaintProperty(p, "circle-radius", [
        "case", ["all", ["!=", ["get", "di"], "None"], ["!=", ["get", "di"], ""]], 7, 3
      ]);
      m.setPaintProperty(p, "circle-color", "#DC2626");
      m.setPaintProperty(p, "circle-stroke-width", [
        "case", ["all", ["!=", ["get", "di"], "None"], ["!=", ["get", "di"], ""]], 2.5, 1
      ]);
      m.setPaintProperty(p, "circle-stroke-color", "#fff");
      m.setPaintProperty(p, "circle-opacity", [
        "case", ["all", ["!=", ["get", "di"], "None"], ["!=", ["get", "di"], ""]], 0.95, 0.2
      ]);
      break;

    case "prevalence":
      m.setPaintProperty(p, "circle-radius", [
        "case", ["all", ["!=", ["get", "di"], "None"], ["!=", ["get", "di"], ""]], 7, 2
      ]);
      m.setPaintProperty(p, "circle-color", "#7C3AED");
      m.setPaintProperty(p, "circle-stroke-width", [
        "case", ["all", ["!=", ["get", "di"], "None"], ["!=", ["get", "di"], ""]], 2, 0.5
      ]);
      m.setPaintProperty(p, "circle-stroke-color", "#fff");
      m.setPaintProperty(p, "circle-opacity", [
        "case", ["all", ["!=", ["get", "di"], "None"], ["!=", ["get", "di"], ""]], 0.9, 0.15
      ]);
      break;
  }
}
