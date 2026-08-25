import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { fetchEpidemiological, fetchEpidemiologicalMeta, type EpidemiologicalRecord, type EpidemiologicalMeta } from "../../lib/api";
import { atlas, tooltipStyle, PageHeader, StatCards, Panel, FilterBar, FilterGroup, Select, Chip, SourceNote, PageLoader } from "../common/Atlas";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import maplibregl from "maplibre-gl";

const DISEASE_COLORS: Record<string, string> = {
  "Rickettsia": "#DC2626",
  "Coxiella": "#7C3AED",
  "Ehrlichia": "#2563EB",
  "Babesia": "#D97706",
  "Theileria": "#0F766E",
  "Anaplasma": "#0891B2",
  "Borrelia": "#BE185D",
  "Francisella": "#4F46E5",
  "Crimean": "#B91C1C",
  "Wolbachia": "#6D28D9",
};

function getDiseaseColor(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(DISEASE_COLORS)) {
    if (lower.includes(key.toLowerCase())) return color;
  }
  const palette = ["#DC2626", "#7C3AED", "#2563EB", "#D97706", "#0F766E", "#0891B2", "#BE185D", "#4F46E5", "#B91C1C", "#6D28D9", "#059669", "#CA8A04"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}

const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  "Algeria": [3.0, 28.0], "Angola": [18.5, -12.5], "Benin": [2.3, 9.3],
  "Botswana": [24.5, -22.0], "Burkina Faso": [-1.5, 12.3], "Burundi": [29.9, -3.4],
  "Cameroon": [12.4, 6.0], "Central African Republic": [20.9, 6.6],
  "Chad": [18.7, 15.5], "Congo": [15.8, -0.2], "Cote d'Ivoire": [-5.5, 7.5],
  "DRC": [23.6, -4.0], "Djibouti": [43.1, 11.6], "Egypt": [30.8, 26.8],
  "Equatorial Guinea": [10.5, 1.7], "Eritrea": [39.8, 15.2], "Eswatini": [31.5, -26.5],
  "Ethiopia": [38.7, 9.1], "Gabon": [11.6, -0.8], "Gambia": [-15.5, 13.4],
  "Ghana": [-1.0, 7.9], "Guinea": [-11.7, 10.5], "Guinea-Bissau": [-15.2, 12.0],
  "Kenya": [37.9, 0.0], "Lesotho": [29.5, -29.6], "Liberia": [-9.4, 6.4],
  "Libya": [17.2, 26.3], "Madagascar": [46.9, -18.8], "Malawi": [34.3, -13.3],
  "Mali": [-4.0, 17.6], "Mauritania": [-10.9, 19.8], "Morocco": [-7.1, 31.8],
  "Mozambique": [35.5, -18.3], "Namibia": [18.5, -22.6], "Niger": [8.1, 17.6],
  "Nigeria": [8.7, 9.1], "Rwanda": [29.9, -1.9], "Sao Tome": [6.6, 0.2],
  "Senegal": [-14.5, 14.5], "Sierra Leone": [-11.8, 8.5], "Somalia": [46.2, 5.2],
  "South Africa": [25.0, -29.0], "South Sudan": [30.0, 7.0],
  "Sudan": [30.2, 12.9], "Tanzania": [34.9, -6.4], "Togo": [1.2, 8.6],
  "Tunisia": [9.5, 33.9], "Uganda": [32.3, 1.4], "Zambia": [28.3, -15.4],
  "Zimbabwe": [29.9, -19.0], "Cape Verde": [-23.6, 16.0], "Comoros": [44.3, -12.2],
  "Mauritius": [57.6, -20.3], "Seychelles": [55.5, -4.7], "Reunion": [55.5, -21.1],
  "Western Sahara": [-12.5, 24.5], "Mayotte": [45.1, -12.8],
  "Swaziland": [31.5, -26.5], "Dem. Rep. Congo": [23.6, -4.0],
  "Republic of the Congo": [15.8, -0.2], "United Republic of Tanzania": [34.9, -6.4],
};

function DiseaseMiniMap({ records }: { records: EpidemiologicalRecord[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const countryCounts: Record<string, number> = {};
    records.forEach((r) => { if (r.country) countryCounts[r.country] = (countryCounts[r.country] || 0) + 1; });

    const features: GeoJSON.Feature[] = [];
    for (const [country, count] of Object.entries(countryCounts)) {
      const coords = COUNTRY_CENTROIDS[country];
      if (!coords) continue;
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: coords },
        properties: { country, count },
      });
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
      map.addSource("disease-points", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });

      map.addLayer({
        id: "disease-heatmap",
        type: "heatmap",
        source: "disease-points",
        paint: {
          "heatmap-weight": ["get", "count"],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 3],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(236,253,245,0)",
            0.2, "rgba(16,185,129,0.3)",
            0.4, "rgba(16,185,129,0.5)",
            0.6, "rgba(15,118,110,0.7)",
            0.8, "rgba(15,118,110,0.85)",
            1, "rgba(13,70,67,1)",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 15, 6, 35],
          "heatmap-opacity": 0.8,
        },
      });

      map.addLayer({
        id: "disease-points",
        type: "circle",
        source: "disease-points",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 4, 50, 12, 500, 20],
          "circle-color": "#0F766E",
          "circle-stroke-color": "#FFFFFF",
          "circle-stroke-width": 1.5,
          "circle-opacity": 0.9,
        },
      });

      const popup = new maplibregl.Popup({ closeButton: false, maxWidth: "200px" });
      map.on("mouseenter", "disease-points", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        popup
          .setHTML(`<div style="font-family:system-ui;font-size:12px;line-height:1.5"><div style="font-weight:600">${f.properties?.country}</div><div style="color:#0F766E;font-family:monospace">${f.properties?.count} records</div></div>`)
          .setLngLat(e.lngLat)
          .addTo(map);
      });
      map.on("mouseleave", "disease-points", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [records]);

  return <div ref={containerRef} className="w-full h-full min-h-[300px]" />;
}

export function DiseaseList() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState<EpidemiologicalMeta | null>(null);
  const [records, setRecords] = useState<EpidemiologicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    let active = true;
    fetchEpidemiologicalMeta().catch(() => null).then((m) => {
      if (!active) return;
      setMeta(m);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selected) { setRecords([]); return; }
    let active = true;
    setSelectedLoading(true);
    fetchEpidemiological({ disease: selected, limit: 50000 })
      .then((res) => { if (active) setRecords(res.data); })
      .catch(() => { if (active) setRecords([]); })
      .finally(() => { if (active) setSelectedLoading(false); });
    return () => { active = false; };
  }, [selected]);

  const diseases = useMemo(() => (meta?.diseases || []).filter((d) => d && d.name), [meta]);

  const overview = useMemo(() => {
    if (!meta) return null;
    const total = meta.totalRecords;
    return { totalDiseases: diseases.length, totalRecords: total, totalCountries: meta.countries.length, diseases: diseases.slice(0, 30) };
  }, [meta, diseases]);

  const selectedData = useMemo(() => {
    if (!selected || records.length === 0) return null;
    const species: Record<string, number> = {};
    const hosts: Record<string, number> = {};
    const countries: Record<string, number> = {};
    records.forEach((r) => {
      if (r.species) species[r.species] = (species[r.species] || 0) + 1;
      if (r.relatedHosts) hosts[r.relatedHosts] = (hosts[r.relatedHosts] || 0) + 1;
      if (r.country) countries[r.country] = (countries[r.country] || 0) + 1;
    });
    return {
      total: records.length,
      species: Object.entries(species).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, c]) => ({ name: n, count: c })),
      hosts: Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, c]) => ({ name: n, count: c })),
      countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, c]) => ({ name: n, count: c })),
      uniqueVectors: Object.keys(species).length,
      uniqueHosts: Object.keys(hosts).length,
      uniqueCountries: Object.keys(countries).length,
      topVector: Object.entries(species).sort((a, b) => b[1] - a[1])[0]?.[0] || "",
    };
  }, [records, selected]);

  if (loading) return <PageLoader />;

  return (
    <div style={{ minHeight: "100vh", background: atlas.bg }}>
      <div className="max-w-7xl mx-auto px-6 py-8" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <PageHeader
          title="Diseases & Pathogens"
          subtitle={
            overview ? (
              <>{overview.totalDiseases} diseases detected in ticks across {overview.totalCountries} countries &middot; <span style={{ fontFamily: "monospace" }}>{overview.totalRecords.toLocaleString()}</span> records</>
            ) : "Loading..."
          }
        />

        <FilterBar>
          <FilterGroup label="Disease">
            <Select value={selected} onChange={setSelected} minWidth={340}>
              <option value="">Select a disease...</option>
              {diseases.map((d) => (
                <option key={d.name} value={d.name}>{d.name} ({d.count})</option>
              ))}
            </Select>
          </FilterGroup>
          {selected && selectedData && (
            <Chip tone="amber">
              {selectedData.total.toLocaleString()} records &middot; {selectedData.uniqueVectors} vectors &middot; {selectedData.uniqueCountries} countries
            </Chip>
          )}
        </FilterBar>

        {!selected && overview && (
          <>
            <StatCards
              className="grid-cols-1 sm:grid-cols-3"
              items={[
                { label: "Total Diseases", value: overview.totalDiseases, hint: "pathogens detected in ticks" },
                { label: "Total Records", value: overview.totalRecords, hint: "epidemiological detections" },
                { label: "Countries", value: overview.totalCountries, hint: "across Africa" },
              ]}
            />

            <div className="mb-6">
              <h2 className="text-[13px] font-semibold mb-3" style={{ color: atlas.text }}>Browse Diseases</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {overview.diseases.map((d) => {
                  const color = getDiseaseColor(d.name);
                  return (
                    <button
                      key={d.name}
                      onClick={() => { setSelected(d.name); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      className="text-left rounded-lg bg-white p-4 transition-all hover:shadow-md cursor-pointer group"
                      style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: color }} />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold truncate group-hover:underline" style={{ color: atlas.text }}>{d.name}</div>
                          <div className="text-[11px] mt-0.5" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>
                            {d.count.toLocaleString()} records
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {selected && (
          selectedLoading ? (
            <PageLoader />
          ) : selectedData ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 rounded-full" style={{ background: getDiseaseColor(selected) }} />
                <h2 className="text-lg font-semibold" style={{ color: atlas.text }}>{selected}</h2>
              </div>

              <StatCards
                className="grid-cols-2 lg:grid-cols-5"
                items={[
                  { label: "Records", value: selectedData.total },
                  { label: "Tick Vectors", value: selectedData.uniqueVectors },
                  { label: "Hosts", value: selectedData.uniqueHosts },
                  { label: "Countries", value: selectedData.uniqueCountries },
                  { label: "Top Vector", value: selectedData.topVector, hint: "most frequently associated" },
                ]}
              />

              <Panel title="Geographic Distribution" className="mb-6">
                <div style={{ height: 360 }}>
                  <DiseaseMiniMap records={records} />
                </div>
              </Panel>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <Panel title="Tick Vectors">
                  <div className="space-y-2">
                    {selectedData.species.map((s, i) => {
                      const maxCount = selectedData.species[0]?.count || 1;
                      const pct = (s.count / maxCount) * 100;
                      return (
                        <div key={s.name} className="group cursor-pointer" onClick={() => navigate(`/species/${encodeURIComponent(s.name)}`)}>
                          <div className="flex items-center justify-between text-[12px] mb-0.5">
                            <span className="font-medium truncate group-hover:underline" style={{ color: atlas.text }}>{s.name}</span>
                            <span style={{ color: atlas.textMuted, fontFamily: "monospace" }}>{s.count}</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: atlas.grid }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: getDiseaseColor(selected) }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
                <Panel title="Animal Hosts">
                  <div className="space-y-2">
                    {selectedData.hosts.map((h) => {
                      const maxCount = selectedData.hosts[0]?.count || 1;
                      const pct = (h.count / maxCount) * 100;
                      return (
                        <div key={h.name}>
                          <div className="flex items-center justify-between text-[12px] mb-0.5">
                            <span className="font-medium truncate" style={{ color: atlas.text }}>{h.name}</span>
                            <span style={{ color: atlas.textMuted, fontFamily: "monospace" }}>{h.count}</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: atlas.grid }}>
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: atlas.amber }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
                <Panel title="Countries">
                  <div className="space-y-2">
                    {selectedData.countries.map((c) => {
                      const maxCount = selectedData.countries[0]?.count || 1;
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
                </Panel>
              </div>

              <Panel title={`Records by Year \u2014 ${selected}`} className="mb-6">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={(() => {
                    const yCounts: Record<number, number> = {};
                    records.forEach((r) => {
                      if (r.yearStart != null) yCounts[r.yearStart] = (yCounts[r.yearStart] || 0) + 1;
                    });
                    return Object.entries(yCounts).sort(([a], [b]) => +a - +b).map(([y, c]) => ({ year: y, count: c }));
                  })()} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={atlas.grid} vertical={false} />
                    <XAxis dataKey="year" tick={{ fontSize: 10, fill: atlas.textMuted, fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: atlas.border }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: atlas.textMuted, fontFamily: "monospace" }} tickLine={false} axisLine={false} width={40} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" fill={getDiseaseColor(selected)} radius={[3, 3, 0, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>
            </>
          ) : (
            <Panel>
              <p className="text-[13px] py-6 text-center" style={{ color: atlas.textMuted }}>No records found for this disease.</p>
            </Panel>
          )
        )}

        <SourceNote />
      </div>
    </div>
  );
}
