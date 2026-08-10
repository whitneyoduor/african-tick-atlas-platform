import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { fetchEpidemiological, fetchEpidemiologicalMeta, type EpidemiologicalRecord, type EpidemiologicalMeta } from "../../lib/api";
import { atlas, tooltipStyle, PageHeader, StatCards, Panel, FilterBar, FilterGroup, Select, Chip, SourceNote, PageLoader } from "../common/Atlas";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function DiseaseList() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState<EpidemiologicalMeta | null>(null);
  const [records, setRecords] = useState<EpidemiologicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selected, setSelected] = useState("");

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
    if (!selected) {
      setRecords([]);
      return;
    }
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
    const top15 = diseases.slice(0, 15).map((d) => ({
      name: d.name.length > 40 ? d.name.slice(0, 40) + "..." : d.name,
      fullName: d.name,
      count: d.count,
      pct: total > 0 ? ((d.count / total) * 100).toFixed(1) : "0",
    }));
    return { totalDiseases: diseases.length, totalRecords: total, totalCountries: meta.countries.length, top15 };
  }, [meta, diseases]);

  const selectedData = useMemo(() => {
    if (!selected) return null;
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
      species: Object.entries(species).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      hosts: Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      uniqueVectors: Object.keys(species).length,
      uniqueHosts: Object.keys(hosts).length,
      uniqueCountries: Object.keys(countries).length,
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
              <>
                {overview.totalDiseases} diseases and pathogens detected in ticks across {overview.totalCountries} countries &middot;{" "}
                <span style={{ fontFamily: "monospace" }}>{overview.totalRecords.toLocaleString()}</span> detections
              </>
            ) : "Loading disease data..."
          }
        />

        <FilterBar>
          <FilterGroup label="Disease">
            <Select value={selected} onChange={setSelected} minWidth={340}>
              <option value="">All diseases (overview)</option>
              {diseases.map((d) => (
                <option key={d.name} value={d.name}>{d.name}</option>
              ))}
            </Select>
          </FilterGroup>
          {selected && (
            <Chip tone="amber">
              {selectedLoading
                ? "Loading records..."
                : `${selectedData?.total.toLocaleString() || 0} records · ${selectedData?.uniqueVectors || 0} vectors · ${selectedData?.uniqueHosts || 0} hosts · ${selectedData?.uniqueCountries || 0} countries`}
            </Chip>
          )}
        </FilterBar>

        {!selected && overview && (
          <>
            <StatCards
              className="grid-cols-1 sm:grid-cols-3"
              items={[
                { label: "Total Diseases", value: overview.totalDiseases, hint: "pathogens & disease agents detected" },
                { label: "Total Detections", value: overview.totalRecords, hint: "epidemiological records" },
                { label: "Countries", value: overview.totalCountries, hint: "across the African continent" },
              ]}
            />

            <Panel title="Top 15 Diseases & Pathogens by Record Count" className="mb-6">
              <ResponsiveContainer width="100%" height={500}>
                <BarChart data={overview.top15} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={atlas.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: atlas.textMuted, fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: atlas.border }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: atlas.text }} tickLine={false} axisLine={false} width={300} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number, _name: string, item: any) => {
                      const datum = item?.payload;
                      const match = overview.top15.find((d) => d.name === datum?.name);
                      return [`${value.toLocaleString()} records (${match?.pct || 0}%)`, datum?.fullName || datum?.name || "Disease"];
                    }}
                  />
                  <Bar dataKey="count" fill={atlas.red} radius={[0, 4, 4, 0]} cursor="pointer" onClick={(data: any) => data?.fullName && navigate(`/diseases/${encodeURIComponent(data.fullName)}`)} />
                </BarChart>
              </ResponsiveContainer>
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
                  { label: "Tick Vectors", value: selectedData.uniqueVectors },
                  { label: "Hosts", value: selectedData.uniqueHosts },
                  { label: "Countries", value: selectedData.uniqueCountries },
                ]}
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <Panel title="Tick Vectors">
                  <ResponsiveContainer width="100%" height={Math.max(220, selectedData.species.length * 34)}>
                    <BarChart data={selectedData.species} layout="vertical" margin={{ left: 10, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={atlas.grid} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: atlas.textMuted, fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: atlas.border }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: atlas.text }} tickLine={false} axisLine={false} width={200} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="count" fill={atlas.red} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Panel>
                <Panel title="Countries">
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
              </div>

              <Panel title="Animal Hosts">
                <ResponsiveContainer width="100%" height={Math.max(220, selectedData.hosts.length * 34)}>
                  <BarChart data={selectedData.hosts} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={atlas.grid} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: atlas.textMuted, fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: atlas.border }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: atlas.text }} tickLine={false} axisLine={false} width={200} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" fill={atlas.amber} radius={[0, 4, 4, 0]} />
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
