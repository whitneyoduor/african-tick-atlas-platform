import { useEffect, useMemo, useState } from "react";
import { fetchEpidemiological, type EpidemiologicalRecord } from "../../lib/api";
import { atlas, tooltipStyle, PageHeader, StatCards, Panel, FilterBar, FilterGroup, Select, SourceNote, PageLoader } from "../common/Atlas";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush } from "recharts";

function extractYear(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/\b(19\d\d|20\d\d)\b/);
  return m ? parseInt(m[1]) : null;
}

const METRICS = [
  { key: "records", label: "Total Records" },
  { key: "species", label: "Tick Species" },
  { key: "hosts", label: "Animal Hosts" },
  { key: "diseases", label: "Diseases Found" },
  { key: "countries", label: "Countries" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

const METRIC_COLORS: Record<MetricKey, string> = {
  records: atlas.teal,
  species: "#2563EB",
  hosts: "#D97706",
  diseases: "#DC2626",
  countries: "#7C3AED",
};

export function Trends() {
  const [records, setRecords] = useState<EpidemiologicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<MetricKey>("records");
  const [speciesFilter, setSpeciesFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [brushRange, setBrushRange] = useState<[number, number]>([1930, 2025]);

  useEffect(() => {
    fetchEpidemiological({ limit: 50000 })
      .then((res) => { setRecords(res.data); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, []);

  const speciesList = useMemo(() => {
    const s = new Set<string>();
    records.forEach((r) => { if (r.species) s.add(r.species); });
    return Array.from(s).sort();
  }, [records]);

  const countryList = useMemo(() => {
    const c = new Set<string>();
    records.forEach((r) => { if (r.country) c.add(r.country); });
    return Array.from(c).sort();
  }, [records]);

  const filtered = useMemo(() => {
    let data = [...records];
    if (speciesFilter !== "all") data = data.filter((r) => r.species === speciesFilter);
    if (countryFilter !== "all") data = data.filter((r) => r.country === countryFilter);
    return data;
  }, [records, speciesFilter, countryFilter]);

  const yearlyMap = useMemo(() => {
    const map = new Map<number, { records: number; species: Set<string>; hosts: Set<string>; diseases: Set<string>; countries: Set<string> }>();
    filtered.forEach((r) => {
      const y = extractYear(r.yearOfStudy);
      if (y === null) return;
      if (!map.has(y)) map.set(y, { records: 0, species: new Set(), hosts: new Set(), diseases: new Set(), countries: new Set() });
      const d = map.get(y)!;
      d.records++;
      if (r.species) d.species.add(r.species);
      if (r.relatedHosts) d.hosts.add(r.relatedHosts);
      if (r.epidemiologicalDisease) d.diseases.add(r.epidemiologicalDisease);
      if (r.country) d.countries.add(r.country);
    });
    return map;
  }, [filtered]);

  const yearlyData = useMemo(() => {
    return Array.from(yearlyMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, d]) => ({
        year: String(year),
        records: d.records,
        species: d.species.size,
        hosts: d.hosts.size,
        diseases: d.diseases.size,
        countries: d.countries.size,
      }));
  }, [yearlyMap]);

  const brushedData = useMemo(() => {
    return yearlyData.filter((d) => {
      const y = parseInt(d.year);
      return y >= brushRange[0] && y <= brushRange[1];
    });
  }, [yearlyData, brushRange]);

  const stats = useMemo(() => {
    let totalRecords = 0;
    const speciesSet = new Set<string>();
    const hostSet = new Set<string>();
    const diseaseSet = new Set<string>();
    const countrySet = new Set<string>();
    brushedData.forEach((d) => {
      totalRecords += d.records;
      const yr = yearlyMap.get(parseInt(d.year));
      if (yr) {
        yr.species.forEach((s) => speciesSet.add(s));
        yr.hosts.forEach((h) => hostSet.add(h));
        yr.diseases.forEach((d2) => diseaseSet.add(d2));
        yr.countries.forEach((c) => countrySet.add(c));
      }
    });
    return { records: totalRecords, species: speciesSet.size, hosts: hostSet.size, diseases: diseaseSet.size, countries: countrySet.size };
  }, [brushedData, yearlyMap]);

  const minYear = yearlyData.length > 0 ? parseInt(yearlyData[0].year) : 1930;
  const maxYear = yearlyData.length > 0 ? parseInt(yearlyData[yearlyData.length - 1].year) : 2025;

  const handleBrushChange = (e: any) => {
    if (e && e.startIndex !== undefined && e.endIndex !== undefined) {
      const start = yearlyData[e.startIndex];
      const end = yearlyData[e.endIndex];
      if (start && end) {
        setBrushRange([parseInt(start.year), parseInt(end.year)]);
      }
    }
  };

  if (loading) return <PageLoader />;

  const metricColor = METRIC_COLORS[metric];
  const activeMetric = METRICS.find((m) => m.key === metric);

  return (
    <div style={{ minHeight: "100vh", background: atlas.bg }}>
      <div className="max-w-7xl mx-auto px-6 py-8" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <PageHeader
          title="Trends"
          subtitle={
            <>
              How African tick surveillance has changed over time &middot;{" "}
              <span style={{ fontFamily: "monospace" }}>{stats.records.toLocaleString()}</span> records in the selected period
            </>
          }
        />

        <FilterBar>
          <FilterGroup label="Metric">
            <Select value={metric} onChange={(v) => setMetric(v as MetricKey)} minWidth={150}>
              {METRICS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </Select>
          </FilterGroup>
          <FilterGroup label="Species">
            <Select value={speciesFilter} onChange={setSpeciesFilter} minWidth={170}>
              <option value="all">All Species</option>
              {speciesList.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </FilterGroup>
          <FilterGroup label="Country">
            <Select value={countryFilter} onChange={setCountryFilter} minWidth={150}>
              <option value="all">All Countries</option>
              {countryList.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </FilterGroup>
          <FilterGroup label="Year Range">
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={brushRange[0]}
                onChange={(e) => setBrushRange([parseInt(e.target.value) || minYear, brushRange[1]])}
                className="w-[74px] text-[13px] border px-2 py-1.5 rounded-md bg-white text-center outline-none"
                style={{ borderColor: atlas.borderStrong, color: atlas.text, fontFamily: "monospace" }}
                min={minYear}
                max={brushRange[1]}
              />
              <span style={{ color: atlas.textMuted }}>–</span>
              <input
                type="number"
                value={brushRange[1]}
                onChange={(e) => setBrushRange([brushRange[0], parseInt(e.target.value) || maxYear])}
                className="w-[74px] text-[13px] border px-2 py-1.5 rounded-md bg-white text-center outline-none"
                style={{ borderColor: atlas.borderStrong, color: atlas.text, fontFamily: "monospace" }}
                min={brushRange[0]}
                max={maxYear}
              />
            </div>
          </FilterGroup>
        </FilterBar>

        <StatCards
          className="grid-cols-2 lg:grid-cols-5"
          items={METRICS.map((m) => ({
            label: m.label,
            value: (stats as any)[m.key] ?? 0,
            active: metric === m.key,
            onClick: () => setMetric(m.key),
          }))}
        />

        <Panel
          title={
            <span style={{ color: metricColor }}>
              {activeMetric?.label} Over Time
            </span>
          }
          action={
            <span className="text-[11px]" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>
              {brushRange[0]} – {brushRange[1]}
            </span>
          }
          className="mb-6"
        >
          <ResponsiveContainer width="100%" height={360}>
            <AreaChart data={yearlyData}>
              <defs>
                <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={metricColor} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={metricColor} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={atlas.grid} vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 10, fill: atlas.textMuted, fontFamily: "monospace" }}
                tickLine={false}
                axisLine={{ stroke: atlas.border }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 10, fill: atlas.textMuted, fontFamily: "monospace" }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number) => [value.toLocaleString(), activeMetric?.label]}
              />
              <Area
                type="monotone"
                dataKey={metric}
                stroke={metricColor}
                strokeWidth={2}
                fill="url(#colorMetric)"
                dot={false}
                activeDot={{ r: 4, fill: metricColor, stroke: "#fff", strokeWidth: 2 }}
              />
              <Brush
                dataKey="year"
                height={22}
                stroke={atlas.teal}
                fill="#F0F4F3"
                travellerWidth={8}
                onChange={handleBrushChange}
                startIndex={0}
                endIndex={yearlyData.length - 1}
                tickFormatter={(v) => String(v)}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Top Species in Selected Range" className="h-full">
            <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: atlas.border }}>
                    <th className="text-left px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>#</th>
                    <th className="text-left px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>Species</th>
                    <th className="text-right px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>Years Active</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const counts: Record<string, number> = {};
                    brushedData.forEach((d) => {
                      const yr = yearlyMap.get(parseInt(d.year));
                      if (yr) yr.species.forEach((s) => { counts[s] = (counts[s] || 0) + 1; });
                    });
                    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count], i) => (
                      <tr key={name} className="border-b" style={{ borderColor: atlas.grid }}>
                        <td className="px-3 py-1.5" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>{i + 1}</td>
                        <td className="px-3 py-1.5 font-medium" style={{ color: atlas.text }}>{name}</td>
                        <td className="px-3 py-1.5 text-right" style={{ color: atlas.textSub, fontFamily: "monospace" }}>{count}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="Yearly Breakdown" className="h-full">
            <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: atlas.border }}>
                    <th className="text-left px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>Year</th>
                    <th className="text-right px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>Records</th>
                    <th className="text-right px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>Species</th>
                    <th className="text-right px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>Hosts</th>
                  </tr>
                </thead>
                <tbody>
                  {brushedData.slice().reverse().map((d) => (
                    <tr key={d.year} className="border-b" style={{ borderColor: atlas.grid }}>
                      <td className="px-3 py-1.5 font-medium" style={{ color: atlas.text, fontFamily: "monospace" }}>{d.year}</td>
                      <td className="px-3 py-1.5 text-right" style={{ color: atlas.textSub, fontFamily: "monospace" }}>{d.records.toLocaleString()}</td>
                      <td className="px-3 py-1.5 text-right" style={{ color: atlas.textSub, fontFamily: "monospace" }}>{d.species}</td>
                      <td className="px-3 py-1.5 text-right" style={{ color: atlas.textSub, fontFamily: "monospace" }}>{d.hosts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <SourceNote />
      </div>
    </div>
  );
}
