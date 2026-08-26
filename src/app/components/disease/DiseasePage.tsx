import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { fetchEpidemiological, fetchDiseaseCoordinates, type EpidemiologicalRecord, type DiseaseCoordinatesMap, filterAfricanRecords } from "../../lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { atlas, tooltipStyle } from "../common/Atlas";
import maplibregl from "maplibre-gl";

function DiseaseHeatmap({ records, diseaseName, diseaseCoords }: { records: EpidemiologicalRecord[]; diseaseName: string; diseaseCoords: DiseaseCoordinatesMap }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const features: GeoJSON.Feature[] = [];
    const entry = diseaseCoords[diseaseName];
    if (entry && entry.points.length > 0) {
      for (const pt of entry.points) {
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [pt.lng, pt.lat] },
          properties: { disease: diseaseName },
        });
      }
    }

    if (features.length === 0) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      bounds: [[-20, -35], [55, 37]],
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("disease-pts", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });

      map.addLayer({
        id: "heat",
        type: "heatmap",
        source: "disease-pts",
        paint: {
          "heatmap-weight": 1,
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 3],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(236,253,245,0)",
            0.15, "rgba(16,185,129,0.2)",
            0.3, "rgba(16,185,129,0.4)",
            0.5, "rgba(15,118,110,0.6)",
            0.7, "rgba(15,118,110,0.8)",
            1, "rgba(13,70,67,1)",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 12, 6, 30],
          "heatmap-opacity": 0.85,
        },
      });

      map.addLayer({
        id: "pts",
        type: "circle",
        source: "disease-pts",
        paint: {
          "circle-radius": 5,
          "circle-color": "#0F766E",
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.9,
        },
      });

      const popup = new maplibregl.Popup({ closeButton: false, maxWidth: "220px" });
      map.on("mouseenter", "pts", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        popup
          .setHTML(`<div style="font-family:system-ui;font-size:12px;line-height:1.5"><div style="font-weight:600">${diseaseName}</div><div style="color:#0F766E;font-family:monospace;font-size:11px">GPS occurrence point</div></div>`)
          .setLngLat(e.lngLat)
          .addTo(map);
      });
      map.on("mouseleave", "pts", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [records, diseaseName, diseaseCoords]);

  return <div ref={containerRef} className="w-full h-full min-h-[360px]" />;
}

function TimelineHeatmap({ records, disease }: { records: EpidemiologicalRecord[]; disease: string }) {
  const { grid, years } = useMemo(() => {
    const countryYearCounts: Record<string, Record<number, number>> = {};
    const yearSet = new Set<number>();
    records.forEach((r) => {
      if (!r.country || r.yearStart == null) return;
      if (!countryYearCounts[r.country]) countryYearCounts[r.country] = {};
      countryYearCounts[r.country][r.yearStart] = (countryYearCounts[r.country][r.yearStart] || 0) + 1;
      yearSet.add(r.yearStart);
    });

    const countries = Object.keys(countryYearCounts).sort();
    const years = Array.from(yearSet).sort((a, b) => a - b);

    let maxVal = 0;
    for (const cy of Object.values(countryYearCounts)) {
      for (const v of Object.values(cy)) {
        if (v > maxVal) maxVal = v;
      }
    }

    const grid = countries.map((country) => ({
      country,
      years: years.map((year) => ({
        year,
        count: countryYearCounts[country]?.[year] || 0,
        intensity: maxVal > 0 ? (countryYearCounts[country]?.[year] || 0) / maxVal : 0,
      })),
    }));

    return { grid: grid.slice(0, 15), years };
  }, [records]);

  if (grid.length === 0 || years.length === 0) return null;

  const cellSize = Math.max(14, Math.min(22, 600 / years.length));

  return (
    <div className="overflow-x-auto">
      <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div className="flex items-center" style={{ marginLeft: 140 }}>
          {years.map((y) => (
            <div
              key={y}
              className="text-center shrink-0"
              style={{ width: cellSize, fontSize: 9, color: atlas.textMuted, fontFamily: "monospace" }}
            >
              {y % 5 === 0 || y === years[0] || y === years[years.length - 1] ? y : ""}
            </div>
          ))}
        </div>
        {grid.map((row) => (
          <div key={row.country} className="flex items-center" style={{ height: cellSize + 2 }}>
            <div
              className="text-right pr-2 shrink-0 truncate"
              style={{ width: 138, fontSize: 11, color: atlas.text }}
              title={row.country}
            >
              {row.country}
            </div>
            {row.years.map((cell) => (
              <div
                key={cell.year}
                className="shrink-0 rounded-sm transition-colors cursor-default"
                style={{
                  width: cellSize - 1,
                  height: cellSize - 1,
                  marginRight: 1,
                  background: cell.count === 0
                    ? atlas.grid
                    : `rgba(15, 118, 110, ${0.15 + cell.intensity * 0.85})`,
                }}
                title={`${row.country} ${cell.year}: ${cell.count} records`}
              />
            ))}
          </div>
        ))}
        <div className="flex items-center gap-2 mt-2 ml-[140px]">
          <span style={{ fontSize: 10, color: atlas.textMuted }}>Less</span>
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
            <div
              key={v}
              className="rounded-sm"
              style={{
                width: 12, height: 12,
                background: v === 0 ? atlas.grid : `rgba(15, 118, 110, ${0.15 + v * 0.85})`,
              }}
            />
          ))}
          <span style={{ fontSize: 10, color: atlas.textMuted }}>More</span>
        </div>
      </div>
    </div>
  );
}

export function DiseasePage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const disease = name || "";
  const [records, setRecords] = useState<EpidemiologicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [diseaseCoords, setDiseaseCoords] = useState<DiseaseCoordinatesMap>({});

  useEffect(() => {
    fetchDiseaseCoordinates().then(setDiseaseCoords).catch(() => {});
  }, []);

  useEffect(() => {
    if (!disease) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    fetchEpidemiological({ disease, limit: 50000 })
      .then((res) => { if (active) { setRecords(filterAfricanRecords(res.data)); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [disease]);

  const data = useMemo(() => {
    const species: Record<string, number> = {};
    const hosts: Record<string, number> = {};
    const countries: Record<string, number> = {};
    records.forEach((r) => {
      if (r.species) species[r.species] = (species[r.species] || 0) + 1;
      if (r.relatedHosts) hosts[r.relatedHosts] = (hosts[r.relatedHosts] || 0) + 1;
      if (r.country) countries[r.country] = (countries[r.country] || 0) + 1;
    });
    return {
      species: Object.entries(species).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      hosts: Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      speciesCount: Object.keys(species).length,
      hostCount: Object.keys(hosts).length,
      countryCount: Object.keys(countries).length,
    };
  }, [records]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <span className="text-sm" style={{ color: atlas.textMuted }}>Loading...</span>
    </div>
  );

  if (!disease || records.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <button onClick={() => navigate("/diseases")} className="text-sm mb-4 hover:underline" style={{ color: atlas.teal }}>&larr; Back to Diseases</button>
        <h1 className="text-2xl font-semibold" style={{ color: atlas.text }}>{disease || "Disease"}</h1>
        <div className="mt-4 px-5 py-8 text-center rounded-lg" style={{ background: atlas.card, border: `1px solid ${atlas.border}` }}>
          <p className="text-sm" style={{ color: atlas.textSub }}>No records found for this disease.</p>
        </div>
      </div>
    );
  }

  const yearlyData = (() => {
    const yCounts: Record<number, number> = {};
    records.forEach((r) => { if (r.yearStart != null) yCounts[r.yearStart] = (yCounts[r.yearStart] || 0) + 1; });
    return Object.entries(yCounts).sort(([a], [b]) => +a - +b).map(([y, c]) => ({ year: y, count: c }));
  })();

  return (
    <div className="max-w-7xl mx-auto px-6 py-6" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="mb-6">
        <button onClick={() => navigate("/diseases")} className="text-sm mb-1 hover:underline" style={{ color: atlas.teal }}>&larr; Back to Diseases</button>
        <h1 className="text-2xl font-semibold" style={{ color: atlas.text }}>{disease}</h1>
        <p className="text-sm mt-1" style={{ color: atlas.textSub }}>
          {records.length.toLocaleString()} records &middot; {data.speciesCount} tick vectors &middot; {data.countryCount} countries &middot; {data.hostCount} hosts
        </p>
      </div>

      <div className="grid grid-cols-4 gap-px mb-6" style={{ background: atlas.border }}>
        {[
          { label: "Records", value: records.length, color: atlas.teal },
          { label: "Tick Vectors", value: data.speciesCount, color: atlas.red },
          { label: "Countries", value: data.countryCount, color: atlas.blue },
          { label: "Hosts", value: data.hostCount, color: atlas.amber },
        ].map((m) => (
          <div key={m.label} className="px-5 py-4" style={{ background: atlas.card }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: atlas.textMuted }}>{m.label}</div>
            <div className="text-3xl font-semibold mt-1" style={{ color: m.color, fontFamily: "monospace" }}>{m.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-lg overflow-hidden" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
        <div className="px-5 py-3" style={{ borderBottom: `1px solid ${atlas.border}` }}>
          <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>Geographic Distribution</h3>
        </div>
        <div style={{ height: 380 }}>
          <DiseaseHeatmap records={records} diseaseName={disease} diseaseCoords={diseaseCoords} />
        </div>
      </div>

      {(() => {
        const yearSet = new Set<number>();
        records.forEach((r) => { if (r.yearStart != null) yearSet.add(r.yearStart); });
        return yearSet.size > 1;
      })() && (
        <div className="mb-6 rounded-lg overflow-hidden" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
          <div className="px-5 py-3" style={{ borderBottom: `1px solid ${atlas.border}` }}>
            <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>Timeline Heatmap</h3>
            <p className="text-[11px] mt-0.5" style={{ color: atlas.textMuted }}>Country x Year record density</p>
          </div>
          <div className="p-4">
            <TimelineHeatmap records={records} disease={disease} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
          <div className="px-5 py-3" style={{ borderBottom: `1px solid ${atlas.border}` }}>
            <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>Tick Vectors</h3>
          </div>
          <div className="p-4 space-y-2">
            {data.species.map((s) => {
              const maxCount = data.species[0]?.count || 1;
              const pct = (s.count / maxCount) * 100;
              return (
                <div key={s.name} className="group cursor-pointer" onClick={() => navigate(`/species/${encodeURIComponent(s.name)}`)}>
                  <div className="flex items-center justify-between text-[12px] mb-0.5">
                    <span className="font-medium truncate group-hover:underline" style={{ color: atlas.text }}>{s.name}</span>
                    <span style={{ color: atlas.textMuted, fontFamily: "monospace" }}>{s.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: atlas.grid }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: atlas.red }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
          <div className="px-5 py-3" style={{ borderBottom: `1px solid ${atlas.border}` }}>
            <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>Countries</h3>
          </div>
          <div className="p-4 space-y-2">
            {data.countries.map((c) => {
              const maxCount = data.countries[0]?.count || 1;
              const pct = (c.count / maxCount) * 100;
              return (
                <div key={c.name}>
                  <div className="flex items-center justify-between text-[12px] mb-0.5">
                    <span className="font-medium truncate" style={{ color: atlas.text }}>{c.name}</span>
                    <span style={{ color: atlas.textMuted, fontFamily: "monospace" }}>{c.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: atlas.grid }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: atlas.teal }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-lg overflow-hidden mb-6" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
        <div className="px-5 py-3" style={{ borderBottom: `1px solid ${atlas.border}` }}>
          <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>Animal Hosts</h3>
        </div>
        <div className="p-4">
          <ResponsiveContainer width="100%" height={Math.max(200, data.hosts.length * 36)}>
            <BarChart data={data.hosts} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={atlas.grid} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: atlas.textMuted, fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: atlas.border }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: atlas.text }} tickLine={false} axisLine={false} width={200} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" fill={atlas.amber} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {yearlyData.length > 1 && (
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
          <div className="px-5 py-3" style={{ borderBottom: `1px solid ${atlas.border}` }}>
            <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>Records Over Time</h3>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={yearlyData} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={atlas.grid} vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 10, fill: atlas.textMuted, fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: atlas.border }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11, fill: atlas.textMuted, fontFamily: "monospace" }} tickLine={false} axisLine={false} width={40} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill={atlas.teal} radius={[3, 3, 0, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
