import { useEffect, useMemo, useRef, useState } from "react";
import { fetchEpidemiological, type EpidemiologicalRecord } from "../../lib/api";
import { atlas, tooltipStyle, PageHeader, StatCards, Panel, FilterBar, FilterGroup, Select, SourceNote, PageLoader, FigureExportButton } from "../common/Atlas";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Brush } from "recharts";

function extractYear(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/\b(19\d\d|20\d\d)\b/);
  return m ? parseInt(m[1]) : null;
}

const PIE_COLORS = [
  "#0F766E", "#D97706", "#DC2626", "#2563EB", "#7C3AED",
  "#DB2777", "#059669", "#EA580C", "#4F46E5", "#9333EA",
  "#0891B2", "#B45309", "#14B8A6", "#BE185D", "#6D28D9",
];

function donutData(records: EpidemiologicalRecord[], pick: (r: EpidemiologicalRecord) => string | null, max = 10) {
  const counts = new Map<string, number>();
  records.forEach((r) => {
    const key = pick(r);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([name, count]) => ({ name, count }));
}

function TrendPie({
  data,
  title,
  subtitle,
  size = 190,
  max = 12,
}: {
  data: { name: string; count: number }[];
  title: string;
  subtitle?: string;
  size?: number;
  max?: number;
}) {
  if (data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.count, 0);
  const shown = data.slice(0, max);
  const hidden = data.length - max;
  return (
    <Panel
      title={
        <div>
          <div className="text-[13px] font-semibold" style={{ color: atlas.text }}>
            {title}
          </div>
          {subtitle && (
            <div className="text-[11px] mt-0.5 font-normal" style={{ color: atlas.textMuted }}>
              {subtitle}
            </div>
          )}
        </div>
      }
      className="flex flex-col"
    >
      <div className="flex items-start gap-5 p-4 flex-1 min-h-0">
        <div style={{ width: size, height: size, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={size * 0.26}
                outerRadius={size * 0.44}
                paddingAngle={2}
                dataKey="count"
                nameKey="name"
                strokeWidth={0}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number, name: string) => {
                  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
                  return [`${value} (${pct}%)`, name];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 min-w-0 overflow-y-auto" style={{ maxHeight: 260 }}>
          <div className="space-y-1">
            {shown.map((d, i) => {
              const pct = total > 0 ? ((d.count / total) * 100).toFixed(1) : "0";
              return (
                <div key={d.name} className="flex items-center gap-2 text-[11px]">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="truncate flex-1" style={{ color: atlas.text }}>
                    {d.name}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>
                    {d.count}
                  </span>
                  <span className="shrink-0 tabular-nums" style={{ color: atlas.textMuted, fontFamily: "monospace", fontSize: 10 }}>
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
          {hidden > 0 && (
            <div className="text-[10px] mt-1" style={{ color: atlas.textMuted }}>
              +{hidden} more
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
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
  const trendRef = useRef<HTMLDivElement>(null);

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

  const brushedRecords = useMemo(() => {
    return filtered.filter((r) => {
      const y = extractYear(r.yearOfStudy);
      return y !== null && y >= brushRange[0] && y <= brushRange[1];
    });
  }, [filtered, brushRange]);

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

  const countryPie = useMemo(() => donutData(brushedRecords, (r) => r.country, 10), [brushedRecords]);
  const speciesPie = useMemo(() => donutData(brushedRecords, (r) => r.species, 10), [brushedRecords]);
  const hostsPie = useMemo(() => donutData(brushedRecords, (r) => r.relatedHosts, 10), [brushedRecords]);
  const diseasesPie = useMemo(() => donutData(brushedRecords, (r) => r.epidemiologicalDisease, 10), [brushedRecords]);
  const methodsPie = useMemo(() => donutData(brushedRecords, (r) => r.methodOfExtraction, 8), [brushedRecords]);

  const decadeData = useMemo(() => {
    const counts = new Map<string, number>();
    brushedRecords.forEach((r) => {
      const y = extractYear(r.yearOfStudy);
      if (y === null) return;
      const decade = `${Math.floor(y / 10) * 10}s`;
      counts.set(decade, (counts.get(decade) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort(([a], [b]) => +a - +b)
      .map(([name, count]) => ({ name, count }));
  }, [brushedRecords]);

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
            <div className="flex items-center gap-3">
              <span className="text-[11px]" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>
                {brushRange[0]} – {brushRange[1]}
              </span>
              <FigureExportButton targetRef={trendRef} filename="trends-chart.png" />
            </div>
          }
          className="mb-6"
        >
          <div ref={trendRef}>
          <ResponsiveContainer width="100%" height={340}>
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
          </div>
        </Panel>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <TrendPie title="Records by Country" subtitle="Geographic distribution of surveillance" data={countryPie} />
          <TrendPie title="Tick Vectors Reported" subtitle="Species linked to pathogen records" data={speciesPie} />
          <TrendPie title="Animal Hosts" subtitle="Known and suspected vertebrate hosts" data={hostsPie} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <TrendPie title="Pathogens Reported" subtitle="Diseases detected in tick surveillance" data={diseasesPie} />
          <TrendPie title="Sampling Methods" subtitle="How pathogens were detected" data={methodsPie} max={8} />
          <TrendPie title="Records by Decade" subtitle="Surveillance cadence over time" data={decadeData} max={12} />
        </div>

        <SourceNote />
      </div>
    </div>
  );
}