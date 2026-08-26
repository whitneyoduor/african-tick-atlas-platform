import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { fetchEpidemiological, fetchEpidemiologicalMeta, fetchGenBankStats, type EpidemiologicalRecord, type EpidemiologicalMeta, type GenBankStats } from "../../lib/api";
import { prioritizeSpecies } from "../../lib/species";
import { atlas, tooltipStyle, PageHeader, StatCards, Panel, FilterBar, FilterGroup, Select, Chip, SourceNote, PageLoader } from "../common/Atlas";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

export function SpeciesList() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [meta, setMeta] = useState<EpidemiologicalMeta | null>(null);
  const [records, setRecords] = useState<EpidemiologicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selected, setSelected] = useState("");
  const [genbankStats, setGenbankStats] = useState<GenBankStats | null>(null);
  const [genbankLoading, setGenbankLoading] = useState(false);

  useEffect(() => {
    let active = true;
    fetchEpidemiologicalMeta()
      .catch(() => null)
      .then((m) => {
        if (!active) return;
        setMeta(m);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!meta) return;
    const q = searchParams.get("search");
    if (!q) return;
    const match = meta.species.find((s) => s.name.toLowerCase().includes(q.toLowerCase()));
    if (match) setSelected(match.name);
  }, [meta, searchParams]);

  useEffect(() => {
    if (!selected) {
      setRecords([]);
      return;
    }
    let active = true;
    setSelectedLoading(true);
    fetchEpidemiological({ species: selected, limit: 50000 })
      .then((res) => { if (active) setRecords(res.data); })
      .catch(() => { if (active) setRecords([]); })
      .finally(() => { if (active) setSelectedLoading(false); });
    return () => { active = false; };
  }, [selected]);

  useEffect(() => {
    if (!selected) { setGenbankStats(null); return; }
    let active = true;
    setGenbankLoading(true);
    fetchGenBankStats(selected)
      .then((s) => { if (active) { setGenbankStats(s); setGenbankLoading(false); } })
      .catch(() => { if (active) { setGenbankStats(null); setGenbankLoading(false); } });
    return () => { active = false; };
  }, [selected]);

  const species = useMemo(
    () => prioritizeSpecies((meta?.species || []).filter((s) => s && s.name)),
    [meta]
  );

  const overview = useMemo(() => {
    if (!meta) return null;
    const total = meta.totalRecords;
    const top15 = species.slice(0, 15).map((s) => ({
      name: s.name.length > 30 ? s.name.slice(0, 30) + "..." : s.name,
      fullName: s.name,
      count: s.count,
      pct: total > 0 ? ((s.count / total) * 100).toFixed(1) : "0",
    }));
    return { totalSpecies: species.length, totalRecords: total, totalCountries: meta.countries.length, top15 };
  }, [meta, species]);

  const selectedData = useMemo(() => {
    if (!selected) return null;

    const countries: Record<string, number> = {};
    const hosts: Record<string, number> = {};
    const diseases: Record<string, number> = {};
    const yearly: Record<string, number> = {};

    records.forEach((r) => {
      if (r.country) countries[r.country] = (countries[r.country] || 0) + 1;
      if (r.relatedHosts) hosts[r.relatedHosts] = (hosts[r.relatedHosts] || 0) + 1;
      if (r.epidemiologicalDisease) diseases[r.epidemiologicalDisease] = (diseases[r.epidemiologicalDisease] || 0) + 1;
      const y = r.yearStart;
      if (y !== null && y !== undefined) yearly[y] = (yearly[y] || 0) + 1;
    });

    return {
      total: records.length,
      countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      hosts: Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      diseases: Object.entries(diseases).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({
        name: n.length > 35 ? n.slice(0, 35) + "..." : n,
        count: c,
      })),
      yearly: Object.entries(yearly).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([y, c]) => ({ year: y, count: c })),
      uniqueCountries: Object.keys(countries).length,
      uniqueHosts: Object.keys(hosts).length,
      uniqueDiseases: Object.keys(diseases).length,
    };
  }, [records, selected]);

  if (loading) return <PageLoader />;

  return (
    <div style={{ minHeight: "100vh", background: atlas.bg }}>
      <div className="max-w-7xl mx-auto px-6 py-8" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <PageHeader
          title="Tick Species"
          subtitle={
            overview ? (
              <>
                {overview.totalSpecies} species documented across {overview.totalCountries} countries &middot;{" "}
                <span style={{ fontFamily: "monospace" }}>{overview.totalRecords.toLocaleString()}</span> epidemiological records
              </>
            ) : "Loading species data..."
          }
        />

        <FilterBar>
          <FilterGroup label="Species">
            <Select value={selected} onChange={setSelected} minWidth={300}>
              <option value="">All species (overview)</option>
              {species.map((s) => (
                <option key={s.name} value={s.name}>{s.name}</option>
              ))}
            </Select>
          </FilterGroup>
          {selected && (
            <Chip tone="amber">
              {selectedLoading
                ? "Loading records..."
                : `${selectedData?.total.toLocaleString() || 0} records · ${selectedData?.uniqueCountries || 0} countries · ${selectedData?.uniqueHosts || 0} hosts · ${selectedData?.uniqueDiseases || 0} diseases`}
            </Chip>
          )}
        </FilterBar>

        {selected && (
          <Panel title="Molecular Data — GenBank" className="mb-6">
            {genbankLoading ? (
              <p className="text-[13px] py-6 text-center" style={{ color: atlas.textMuted }}>Loading GenBank data...</p>
            ) : genbankStats && genbankStats.total > 0 ? (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div className="px-4 py-3 rounded" style={{ background: atlas.bg }}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: atlas.textMuted }}>Sequences</div>
                    <div className="text-xl font-semibold mt-0.5" style={{ color: atlas.text, fontFamily: "monospace" }}>{genbankStats.total.toLocaleString()}</div>
                  </div>
                  <div className="px-4 py-3 rounded" style={{ background: atlas.bg }}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: atlas.textMuted }}>Genes</div>
                    <div className="text-xl font-semibold mt-0.5" style={{ color: atlas.text, fontFamily: "monospace" }}>{genbankStats.genes.length}</div>
                  </div>
                  <div className="px-4 py-3 rounded" style={{ background: atlas.bg }}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: atlas.textMuted }}>Countries</div>
                    <div className="text-xl font-semibold mt-0.5" style={{ color: atlas.text, fontFamily: "monospace" }}>{genbankStats.countries.length}</div>
                  </div>
                  <div className="px-4 py-3 rounded" style={{ background: atlas.bg }}>
                    <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: atlas.textMuted }}>Avg Length</div>
                    <div className="text-xl font-semibold mt-0.5" style={{ color: atlas.text, fontFamily: "monospace" }}>
                      {genbankStats.sequenceLength ? `${genbankStats.sequenceLength.mean.toLocaleString()} bp` : "—"}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {genbankStats.genes.length > 0 && (
                    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E2E5DE" }}>
                      <div className="px-4 py-3" style={{ borderBottom: "1px solid #F0F0F0" }}>
                        <h4 className="text-[12px] font-semibold" style={{ color: atlas.text }}>Gene Distribution</h4>
                        <p className="text-[10px] mt-0.5" style={{ color: atlas.textMuted }}>Proportion of sequences by target gene</p>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-4">
                          <div style={{ width: 160, height: 160, flexShrink: 0 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={genbankStats.genes.slice(0, 8)}
                                  cx="50%" cy="50%"
                                  innerRadius={40} outerRadius={70}
                                  paddingAngle={2}
                                  dataKey="count" nameKey="name"
                                  strokeWidth={0}
                                >
                                  {genbankStats.genes.slice(0, 8).map((_, i) => (
                                    <Cell key={i} fill={["#0F766E", "#F59E0B", "#DC2626", "#2563EB", "#7C3AED", "#EC4899", "#14B8A6", "#D97706"][i % 8]} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  contentStyle={{ borderRadius: 8, border: "1px solid #E2E5DE", fontSize: 11, fontFamily: "monospace", background: "#FFFFFF", padding: "6px 10px" }}
                                  formatter={(value: number) => [`${value.toLocaleString()} seqs`, "Count"]}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="flex-1 space-y-1 min-w-0">
                            {genbankStats.genes.slice(0, 7).map((g, i) => {
                              const pct = genbankStats.total > 0 ? ((g.count / genbankStats.total) * 100).toFixed(1) : "0";
                              return (
                                <div key={g.name} className="flex items-center gap-1.5 text-[11px]">
                                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ["#0F766E", "#F59E0B", "#DC2626", "#2563EB", "#7C3AED", "#EC4899", "#14B8A6", "#D97706"][i % 8] }} />
                                  <span className="truncate flex-1" style={{ color: atlas.text }}>{g.name}</span>
                                  <span className="shrink-0 font-medium" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>{g.count}</span>
                                  <span className="shrink-0" style={{ color: atlas.textMuted, fontFamily: "monospace", fontSize: 10 }}>{pct}%</span>
                                </div>
                              );
                            })}
                            {genbankStats.genes.length > 7 && (
                              <div className="text-[10px]" style={{ color: atlas.textMuted }}>+{genbankStats.genes.length - 7} more</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {genbankStats.hosts.length > 0 && (
                    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid #E2E5DE" }}>
                      <div className="px-4 py-3" style={{ borderBottom: "1px solid #F0F0F0" }}>
                        <h4 className="text-[12px] font-semibold" style={{ color: atlas.text }}>GenBank Hosts</h4>
                        <p className="text-[10px] mt-0.5" style={{ color: atlas.textMuted }}>Hosts from which this tick was collected</p>
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-4">
                          <div style={{ width: 160, height: 160, flexShrink: 0 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={genbankStats.hosts.slice(0, 8)}
                                  cx="50%" cy="50%"
                                  innerRadius={40} outerRadius={70}
                                  paddingAngle={2}
                                  dataKey="count" nameKey="name"
                                  strokeWidth={0}
                                >
                                  {genbankStats.hosts.slice(0, 8).map((_, i) => (
                                    <Cell key={i} fill={["#B45309", "#DC2626", "#2563EB", "#059669", "#7C3AED", "#EC4899", "#0891B2", "#CA8A04"][i % 8]} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  contentStyle={{ borderRadius: 8, border: "1px solid #E2E5DE", fontSize: 11, fontFamily: "monospace", background: "#FFFFFF", padding: "6px 10px" }}
                                  formatter={(value: number) => [`${value.toLocaleString()} seqs`, "Count"]}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="flex-1 space-y-1 min-w-0">
                            {genbankStats.hosts.slice(0, 7).map((h, i) => {
                              const total = genbankStats.hosts.reduce((s, x) => s + x.count, 0);
                              const pct = total > 0 ? ((h.count / total) * 100).toFixed(1) : "0";
                              return (
                                <div key={h.name} className="flex items-center gap-1.5 text-[11px]">
                                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ["#B45309", "#DC2626", "#2563EB", "#059669", "#7C3AED", "#EC4899", "#0891B2", "#CA8A04"][i % 8] }} />
                                  <span className="truncate flex-1" style={{ color: atlas.text }}>{h.name}</span>
                                  <span className="shrink-0 font-medium" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>{h.count}</span>
                                  <span className="shrink-0" style={{ color: atlas.textMuted, fontFamily: "monospace", fontSize: 10 }}>{pct}%</span>
                                </div>
                              );
                            })}
                            {genbankStats.hosts.length > 7 && (
                              <div className="text-[10px]" style={{ color: atlas.textMuted }}>+{genbankStats.hosts.length - 7} more</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-3 text-right">
                  <button
                    onClick={() => navigate(`/species/${encodeURIComponent(selected)}`)}
                    className="text-[12px] font-medium hover:underline"
                    style={{ color: atlas.teal }}
                  >
                    View full species page →
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[13px] py-6 text-center" style={{ color: atlas.textMuted }}>
                No GenBank records found for this species.
              </p>
            )}
          </Panel>
        )}

        {!selected && overview && (
          <>
            <StatCards
              className="grid-cols-1 sm:grid-cols-3"
              items={[
                { label: "Total Species", value: overview.totalSpecies, hint: "species with literature records" },
                { label: "Total Records", value: overview.totalRecords, hint: "epidemiological records" },
                { label: "Countries", value: overview.totalCountries, hint: "across the African continent" },
              ]}
            />

            <Panel title="Top 15 Species by Record Count" className="mb-6">
              <div className="flex flex-col lg:flex-row items-center gap-6">
                <div style={{ width: 320, height: 320, flexShrink: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={overview.top15}
                        cx="50%" cy="50%"
                        innerRadius={70} outerRadius={140}
                        paddingAngle={1}
                        dataKey="count" nameKey="name"
                        strokeWidth={0}
                        cursor="pointer"
                        onClick={(data: any) => data?.fullName && navigate(`/species/${encodeURIComponent(data.fullName)}`)}
                      >
                        {overview.top15.map((_, i) => (
                          <Cell key={i} fill={["#134E4A", "#0F766E", "#14B8A6", "#0D9488", "#115E59", "#2DD4BF", "#065F46", "#047857", "#059669", "#10B981", "#34D399", "#6EE7B7", "#A7F3D0", "#047857", "#065F46"][i % 15]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: 8, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }}
                        formatter={(value: number, _name: string, item: any) => {
                          const datum = item?.payload;
                          const match = overview.top15.find((s) => s.name === datum?.name);
                          return [`${value.toLocaleString()} records (${match?.pct || 0}%)`, datum?.fullName || datum?.name || "Species"];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 min-w-0">
                  {overview.top15.map((s, i) => {
                    const colors = ["#134E4A", "#0F766E", "#14B8A6", "#0D9488", "#115E59", "#2DD4BF", "#065F46", "#047857", "#059669", "#10B981", "#34D399", "#6EE7B7", "#A7F3D0", "#047857", "#065F46"];
                    return (
                      <button
                        key={s.fullName}
                        onClick={() => navigate(`/species/${encodeURIComponent(s.fullName)}`)}
                        className="flex items-center gap-2 text-[12px] hover:underline text-left"
                        style={{ color: atlas.text }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colors[i % colors.length] }} />
                        <span className="truncate flex-1">{s.name}</span>
                        <span className="shrink-0 font-medium" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>{s.count.toLocaleString()}</span>
                        <span className="shrink-0" style={{ color: atlas.textMuted, fontFamily: "monospace", fontSize: 10 }}>{s.pct}%</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Panel>
          </>
        )}

        {selected && (
          selectedLoading ? (
            <PageLoader />
          ) : selectedData ? (
            <>
              <StatCards
                className="grid-cols-2 lg:grid-cols-4"
                items={[
                  { label: "Records", value: selectedData.total },
                  { label: "Countries", value: selectedData.uniqueCountries },
                  { label: "Hosts", value: selectedData.uniqueHosts },
                  { label: "Diseases", value: selectedData.uniqueDiseases },
                ]}
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <Panel title="Records by Country">
                  <ResponsiveContainer width="100%" height={Math.max(220, selectedData.countries.length * 34)}>
                    <BarChart data={selectedData.countries} layout="vertical" margin={{ left: 10, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={atlas.grid} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: atlas.textMuted, fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: atlas.border }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: atlas.text }} tickLine={false} axisLine={false} width={130} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="count" fill={atlas.teal} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Panel>
                <Panel title="Animal Hosts">
                  <ResponsiveContainer width="100%" height={Math.max(220, selectedData.hosts.length * 34)}>
                    <BarChart data={selectedData.hosts} layout="vertical" margin={{ left: 10, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={atlas.grid} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: atlas.textMuted, fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: atlas.border }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: atlas.text }} tickLine={false} axisLine={false} width={130} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="count" fill={atlas.amber} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Panel>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Panel title="Associated Diseases">
                  {selectedData.diseases.length === 0 ? (
                    <p className="text-[13px] py-6 text-center" style={{ color: atlas.textMuted }}>No disease data recorded for this species</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={Math.max(220, selectedData.diseases.length * 34)}>
                      <BarChart data={selectedData.diseases} layout="vertical" margin={{ left: 10, right: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={atlas.grid} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 11, fill: atlas.textMuted, fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: atlas.border }} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: atlas.text }} tickLine={false} axisLine={false} width={240} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="count" fill={atlas.red} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </Panel>
                <Panel title="Records Over Time">
                  <ResponsiveContainer width="100%" height={Math.max(220, selectedData.yearly.length * 24)}>
                    <BarChart data={selectedData.yearly}>
                      <CartesianGrid strokeDasharray="3 3" stroke={atlas.grid} vertical={false} />
                      <XAxis dataKey="year" tick={{ fontSize: 10, fill: atlas.textMuted, fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: atlas.border }} interval="preserveStartEnd" minTickGap={30} />
                      <YAxis tick={{ fontSize: 11, fill: atlas.textMuted, fontFamily: "monospace" }} tickLine={false} axisLine={false} width={50} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="count" fill={atlas.teal} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Panel>
              </div>
            </>
          ) : (
            <Panel>
              <p className="text-[13px] py-6 text-center" style={{ color: atlas.textMuted }}>No records found for this species.</p>
            </Panel>
          )
        )}

        <SourceNote />
      </div>
    </div>
  );
}
