import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import { atlas } from "./Atlas";
import type { DiseaseCoordinateEntry } from "../../lib/api";

const SPECIES_COLORS = [
  "#0F766E", "#7C3AED", "#D97706", "#2563EB", "#DC2626",
  "#DB2777", "#059669", "#4F46E5", "#0891B2", "#B45309",
  "#14B8A6", "#BE185D", "#6D28D9", "#EA580C", "#9333EA",
];

function countBySpecies(entry: DiseaseCoordinateEntry): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of entry.points) {
    const sp = p.species || "Unknown";
    counts.set(sp, (counts.get(sp) || 0) + 1);
  }
  return counts;
}

export function EvidenceMap({
  entry,
  diseaseName,
}: {
  entry: DiseaseCoordinateEntry | undefined;
  diseaseName: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const speciesColors = useMemo(() => {
    const m = new Map<string, string>();
    if (!entry) return m;
    const counts = countBySpecies(entry);
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([sp], i) => m.set(sp, SPECIES_COLORS[i % SPECIES_COLORS.length]));
    return m;
  }, [entry]);

  const legend = useMemo(() => {
    if (!entry) return [];
    const counts = countBySpecies(entry);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([sp, count]) => ({ name: sp, count, color: speciesColors.get(sp) || "#94A3B8" }));
  }, [entry, speciesColors]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!entry || entry.points.length === 0) return;

    const features: GeoJSON.Feature[] = entry.points.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        species: p.species || "Unknown",
        country: p.country || null,
        year: p.year ?? null,
      },
    }));

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      bounds: [
        [-20, -35],
        [55, 37],
      ],
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right"
    );

    map.on("load", () => {
      map.addSource("pts-src", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
        cluster: true,
        clusterMaxZoom: 11,
        clusterRadius: 40,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "pts-src",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#0F766E",
            20,
            "#D97706",
            100,
            "#DC2626",
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            15,
            20,
            22,
            100,
            30,
          ],
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 1.5,
        },
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "pts-src",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 11,
          "text-font": ["Open Sans Bold"],
        },
        paint: {
          "text-color": "#FFFFFF",
          "text-halo-color": "rgba(0,0,0,0.25)",
          "text-halo-width": 1,
        },
      });

      const matchPairs: (string | number)[] = [];
      for (const [sp, color] of speciesColors) {
        matchPairs.push(sp, color);
      }
      matchPairs.push("#94A3B8");

      map.addLayer({
        id: "pts",
        type: "circle",
        source: "pts-src",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 6,
          "circle-color": ["match", ["get", "species"], ...matchPairs],
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 1,
          "circle-opacity": 0.92,
        },
      });

      const popup = new maplibregl.Popup({
        closeButton: false,
        maxWidth: "260px",
      });

      const showPoint = (f: any) => {
        const props = f.properties || {};
        const color = speciesColors.get(props.species) || "#0F766E";
        const year = props.year ? String(props.year) : "Year unknown";
        const country = props.country || "Country unspecified";
        return `
          <div style="font-family:system-ui;font-size:12px;line-height:1.55">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="width:9px;height:9px;border-radius:50%;background:${color};display:inline-block"></span>
              <span style="font-weight:600">${props.species}</span>
            </div>
            <div style="color:#0F766E;font-size:11px;font-family:monospace;margin-top:2px">${diseaseName}</div>
            <div style="margin-top:4px">${country}</div>
            <div style="color:${atlas.textMuted}">${year}</div>
          </div>`;
      };

      map.on("mouseenter", "pts", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        popup.setHTML(showPoint(f)).setLngLat(e.lngLat).addTo(map);
      });
      map.on("mouseleave", "pts", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
      });

      map.on("mouseenter", "clusters", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "clusters", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("click", "clusters", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const clusterId = f.properties?.cluster_id;
        const src = map.getSource("pts-src") as maplibregl.GeoJSONSource;
        src.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err || zoom === undefined) return;
          map.easeTo({
            center: (f.geometry as GeoJSON.Point).coordinates as [number, number],
            zoom,
          });
        });
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [entry, diseaseName, speciesColors]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {legend.length > 0 && (
        <div
          className="absolute left-3 bottom-3 rounded-md px-3 py-2 max-w-[220px]"
          style={{
            background: "rgba(255,255,255,0.92)",
            border: `1px solid ${atlas.border}`,
            boxShadow: atlas.shadow,
          }}
        >
          <div
            className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: atlas.textMuted }}
          >
            Tick species
          </div>
          <div className="space-y-1">
            {legend.map((l) => (
              <div
                key={l.name}
                className="flex items-center gap-2 text-[11px]"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: l.color }}
                />
                <span className="truncate" style={{ color: atlas.text }}>
                  {l.name}
                </span>
                <span
                  className="shrink-0 ml-auto tabular-nums"
                  style={{ color: atlas.textMuted, fontFamily: "monospace" }}
                >
                  {l.count}
                </span>
              </div>
            ))}
          </div>
          {speciesColors.size > legend.length && (
            <div
              className="text-[10px] mt-1"
              style={{ color: atlas.textMuted }}
            >
              +{speciesColors.size - legend.length} more species
            </div>
          )}
        </div>
      )}
    </div>
  );
}