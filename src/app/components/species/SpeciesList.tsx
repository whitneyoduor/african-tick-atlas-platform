import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { fetchEpidemiological, fetchEpidemiologicalMeta, type EpidemiologicalRecord, type EpidemiologicalMeta } from "../../lib/api";
import { prioritizeSpecies } from "../../lib/species";
import { atlas, tooltipStyle, PageHeader, StatCards, Panel, FilterBar, FilterGroup, Select, Chip, SourceNote, PageLoader } from "../common/Atlas";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function SpeciesList() {
  const [searchParams] = useSearchParams();
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
              <ResponsiveContainer width="100%" height={500}>
                <BarChart data={overview.top15} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={atlas.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: atlas.textMuted, fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: atlas.border }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: atlas.text }} tickLine={false} axisLine={false} width={220} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number, _name: string, item: any) => {
                      const datum = item?.payload;
                      const match = overview.top15.find((s) => s.name === datum?.name);
                      return [`${value.toLocaleString()} records (${match?.pct || 0}%)`, datum?.fullName || datum?.name || "Species"];
                    }}
                  />
                  <Bar dataKey="count" fill={atlas.teal} radius={[0, 4, 4, 0]} cursor="pointer" onClick={(data: any) => data?.fullName && navigate(`/species/${encodeURIComponent(data.fullName)}`)} />
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
