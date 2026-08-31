import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { fetchEpidemiological, fetchEpidemiologicalMeta, fetchDiseaseCoordinates, type EpidemiologicalRecord, type EpidemiologicalMeta, type DiseaseCoordinatesMap, filterAfricanRecords, isAfricanCountry } from "../../lib/api";
import { atlas, tooltipStyle, PageHeader, StatCards, Panel, FilterBar, FilterGroup, Select, Chip, SourceNote, PageLoader, FigureExportButton } from "../common/Atlas";
import { EvidenceMap } from "../common/EvidenceMap";
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { FEBRILE_CATEGORIES, FEBRILE_GENERA_MAP, febrileGeneraOfLabel } from "../../lib/febrile";

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

const PIE_COLORS = ["#0F766E", "#14B8A6", "#2DD4BF", "#0D9488", "#115E59", "#134E4A", "#5EEAD4", "#99F6E4", "#CCFBF1", "#D97706", "#DC2626", "#2563EB", "#7C3AED", "#DB2777", "#059669"];

function PieLegend({ data, colors }: { data: { name: string; count: number }[]; colors: string[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="space-y-1.5 min-w-0">
      {data.map((d, i) => {
        const pct = total > 0 ? ((d.count / total) * 100).toFixed(1) : "0";
        return (
          <div key={d.name} className="flex items-center gap-2 text-[11px]">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[i % colors.length] }} />
            <span className="truncate flex-1" style={{ color: atlas.text }}>{d.name}</span>
            <span className="shrink-0 font-medium" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>{d.count}</span>
            <span className="shrink-0" style={{ color: atlas.textMuted, fontFamily: "monospace", fontSize: 10 }}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function DonutPie({ data, colors, size = 160 }: { data: { name: string; count: number }[]; colors: string[]; size?: number }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%" cy="50%"
            innerRadius={size * 0.25}
            outerRadius={size * 0.42}
            paddingAngle={2}
            dataKey="count" nameKey="name"
            strokeWidth={0}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function DiseaseMiniMap({ records, diseaseCoords, diseaseName, registerCapture }: { records: EpidemiologicalRecord[]; diseaseCoords: DiseaseCoordinatesMap; diseaseName: string; registerCapture?: (fn: () => HTMLCanvasElement) => void }) {
  return <EvidenceMap entry={diseaseCoords[diseaseName]} diseaseName={diseaseName} registerCapture={registerCapture} />;
}

export function DiseaseList() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState<EpidemiologicalMeta | null>(null);
  const [records, setRecords] = useState<EpidemiologicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selected, setSelected] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [diseaseCoords, setDiseaseCoords] = useState<DiseaseCoordinatesMap>({});
  const [captureMap, setCaptureMap] = useState<() => HTMLCanvasElement>(() => () => undefined as unknown as HTMLCanvasElement);

  useEffect(() => {
    let active = true;
    fetchEpidemiologicalMeta().catch(() => null).then((m) => {
      if (!active) return;
      setMeta(m);
      setLoading(false);
    });
    fetchDiseaseCoordinates().then((dc) => { if (active) setDiseaseCoords(dc); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selected) { setRecords([]); return; }
    let active = true;
    setSelectedLoading(true);
    fetchEpidemiological({ disease: selected, limit: 50000 })
      .then((res) => { if (active) setRecords(filterAfricanRecords(res.data)); })
      .catch(() => { if (active) setRecords([]); })
      .finally(() => { if (active) setSelectedLoading(false); });
    return () => { active = false; };
  }, [selected]);

  const diseases = useMemo(() => (meta?.diseases || []).filter((d) => d && d.name), [meta]);

  const diseaseCategory = (name: string): "core" | "other" | "both" | null => {
    const keys = febrileGeneraOfLabel(name);
    if (keys.length === 0) return null;
    const cats = new Set(keys.map((k) => FEBRILE_GENERA_MAP[k].category as "core" | "other"));
    return cats.size > 1 ? "both" : [...cats][0] ?? null;
  };

  const filteredDiseases = useMemo(() => {
    if (categoryFilter === "all") return diseases;
    return diseases.filter((d) => {
      const c = diseaseCategory(d.name);
      return c === categoryFilter || c === "both";
    });
  }, [diseases, categoryFilter]);

  const overview = useMemo(() => {
    if (!meta) return null;
    const total = categoryFilter === "all"
      ? meta.totalRecords
      : filteredDiseases.reduce((s, d) => s + (d.count || 0), 0);
    const africanCountries = (meta.countries || []).filter((c) => isAfricanCountry(c.name));
    return {
      totalDiseases: filteredDiseases.length,
      totalRecords: total,
      totalCountries: africanCountries.length,
      diseases: filteredDiseases.slice(0, 30),
    };
  }, [meta, filteredDiseases, categoryFilter]);

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
              <>{overview.totalDiseases} pathogens detected in ticks across {overview.totalCountries} countries &middot; <span style={{ fontFamily: "monospace" }}>{overview.totalRecords.toLocaleString()}</span> records</>
            ) : "Loading..."
          }
        />

        <FilterBar>
          <FilterGroup label="Diseases Category">
            <div
              className="flex items-center gap-1 p-1"
              style={{ border: `1px solid ${atlas.border}`, borderRadius: 10, background: "#FFFFFF" }}
            >
              {[{ key: "all", label: "All" }, ...FEBRILE_CATEGORIES].map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCategoryFilter(c.key)}
                  className="transition-colors"
                  style={{
                    padding: "5px 12px",
                    borderRadius: 7,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    background: categoryFilter === c.key ? atlas.teal : "transparent",
                    color: categoryFilter === c.key ? "#FFFFFF" : atlas.textSub,
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </FilterGroup>
          <FilterGroup label="Pathogens">
            <Select value={selected} onChange={setSelected} minWidth={340}>
              <option value="">Select a pathogen...</option>
              {filteredDiseases.map((d) => (
                <option key={d.name} value={d.name}>{d.name} ({d.count})</option>
              ))}
            </Select>
          </FilterGroup>
          {categoryFilter !== "all" && (
            <Chip tone="amber">
              {filteredDiseases.length} diseases &middot; {FEBRILE_CATEGORIES.find((c) => c.key === categoryFilter)?.description}
            </Chip>
          )}
          {selected && selectedData && (
            <Chip tone="teal">
              {selectedData.total.toLocaleString()} records &middot; {selectedData.uniqueVectors} vectors &middot; {selectedData.uniqueCountries} countries
            </Chip>
          )}
        </FilterBar>

        {!selected && overview && (
          <>
            <StatCards
              className="grid-cols-1 sm:grid-cols-3"
              items={[
                { label: "Total Pathogens", value: overview.totalDiseases, hint: "pathogens detected in ticks" },
                { label: "Total Records", value: overview.totalRecords, hint: "epidemiological detections" },
                { label: "Countries", value: overview.totalCountries, hint: "across Africa" },
              ]}
            />

            <div className="mb-6">
              <h2 className="text-[13px] font-semibold mb-3" style={{ color: atlas.text }}>Browse Pathogens</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {overview.diseases.map((d) => {
                  const color = getDiseaseColor(d.name);
                  const cat = diseaseCategory(d.name);
                  return (
                    <button
                      key={d.name}
                      onClick={() => { setSelected(d.name); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      className="text-left rounded-lg bg-white p-4 transition-all hover:shadow-md cursor-pointer group"
                      style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full mt-1 shrink-0" style={{ background: color }} />
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-semibold truncate group-hover:underline" style={{ color: atlas.text }}>{d.name}</div>
                            <div className="text-[11px] mt-0.5" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>
                              {d.count.toLocaleString()} records
                            </div>
                          </div>
                        </div>
                        {cat && (
                          <span
                            className="shrink-0 text-[9px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5"
                            style={{
                              background: cat === "both" ? "#6B7280" : cat === "core" ? "#DC2626" : "#7C3AED",
                              color: "#FFFFFF",
                            }}
                            title={cat === "both" ? "Matches both febrile categories" : FEBRILE_CATEGORIES.find((c) => c.key === cat)?.label}
                          >
                            {cat === "both" ? "Febrile" : cat === "core" ? "Malaria-diff" : "Neglected febrile"}
                          </span>
                        )}
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

              <Panel title="Geographic Distribution" className="mb-6" action={<FigureExportButton captureFn={captureMap} filename={`disease-map-${selected}.png`} />}>
                <div style={{ height: 360 }}>
                  <DiseaseMiniMap records={records} diseaseCoords={diseaseCoords} diseaseName={selected} registerCapture={setCaptureMap} />
                </div>
              </Panel>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                <Panel title="Associated Tick Vectors">
                  <div className="flex items-center gap-3">
                    <DonutPie data={selectedData.species} colors={PIE_COLORS} />
                    <div className="flex-1 min-w-0">
                      <PieLegend data={selectedData.species.slice(0, 6)} colors={PIE_COLORS} />
                      {selectedData.species.length > 6 && <div className="text-[10px] mt-1" style={{ color: atlas.textMuted }}>+{selectedData.species.length - 6} more</div>}
                    </div>
                  </div>
                </Panel>
                <Panel title="Animal Hosts">
                  <div className="flex items-center gap-3">
                    <DonutPie data={selectedData.hosts} colors={PIE_COLORS} />
                    <div className="flex-1 min-w-0">
                      <PieLegend data={selectedData.hosts.slice(0, 6)} colors={PIE_COLORS} />
                      {selectedData.hosts.length > 6 && <div className="text-[10px] mt-1" style={{ color: atlas.textMuted }}>+{selectedData.hosts.length - 6} more</div>}
                    </div>
                  </div>
                </Panel>
                <Panel title="Records by Country">
                  <div className="flex items-center gap-3">
                    <DonutPie data={selectedData.countries} colors={PIE_COLORS} />
                    <div className="flex-1 min-w-0">
                      <PieLegend data={selectedData.countries.slice(0, 6)} colors={PIE_COLORS} />
                      {selectedData.countries.length > 6 && <div className="text-[10px] mt-1" style={{ color: atlas.textMuted }}>+{selectedData.countries.length - 6} more</div>}
                    </div>
                  </div>
                </Panel>
              </div>

              <Panel title={`Records Over Time \u2014 ${selected}`} className="mb-6">
                <div className="flex items-center gap-6 p-4">
                  <DonutPie data={(() => {
                    const yCounts: Record<string, number> = {};
                    records.forEach((r) => {
                      if (r.yearStart != null) yCounts[r.yearStart] = (yCounts[r.yearStart] || 0) + 1;
                    });
                    return Object.entries(yCounts).sort(([a], [b]) => +a - +b).map(([y, c]) => ({ name: y, count: c }));
                  })()} colors={PIE_COLORS} size={200} />
                  <div className="flex-1 min-w-0 max-h-[240px] overflow-y-auto">
                    <PieLegend data={(() => {
                      const yCounts: Record<string, number> = {};
                      records.forEach((r) => {
                        if (r.yearStart != null) yCounts[r.yearStart] = (yCounts[r.yearStart] || 0) + 1;
                      });
                      return Object.entries(yCounts).sort(([a], [b]) => +a - +b).map(([y, c]) => ({ name: y, count: c }));
                    })().slice(0, 15)} colors={PIE_COLORS} />
                  </div>
                </div>
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
