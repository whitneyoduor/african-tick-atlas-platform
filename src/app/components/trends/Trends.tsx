import { useEffect, useMemo, useState } from "react";
import { fetchTicks, type TickRecord } from "../../lib/api";
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

export function Trends() {
  const [records, setRecords] = useState<TickRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<MetricKey>("records");
  const [speciesFilter, setSpeciesFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("all");
  const [brushRange, setBrushRange] = useState<[number, number]>([1930, 2025]);

  useEffect(() => {
    fetchTicks({ limit: 50000 })
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
    return { totalRecords, species: speciesSet.size, hosts: hostSet.size, diseases: diseaseSet.size, countries: countrySet.size };
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

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <span className="text-[11px]" style={{ color: "#A8A29E" }}>Loading...</span>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-6" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-lg font-semibold" style={{ color: "#1C1917" }}>Trends</h1>
        <p className="text-[12px] mt-0.5" style={{ color: "#57534E" }}>
          {stats.totalRecords.toLocaleString()} records &middot; {stats.species} species &middot; {stats.countries} countries &middot; {brushRange[0]}&ndash;{brushRange[1]}
        </p>
      </div>

      {/* Filters bar */}
      <div className="flex items-center gap-4 flex-wrap px-4 py-3 mb-5" style={{ background: "#FFFFFF", border: "1px solid #E2E5DE" }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium" style={{ color: "#A8A29E" }}>METRIC</span>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
            className="text-[11px] border px-2 py-1 outline-none"
            style={{ borderColor: "#E2E5DE", color: "#1C1917", background: "#F0F5F1", minWidth: 130 }}
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium" style={{ color: "#A8A29E" }}>SPECIES</span>
          <select
            value={speciesFilter}
            onChange={(e) => setSpeciesFilter(e.target.value)}
            className="text-[11px] border px-2 py-1 outline-none"
            style={{ borderColor: "#E2E5DE", color: "#1C1917", background: "#F0F5F1", minWidth: 160 }}
          >
            <option value="all">All Species</option>
            {speciesList.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium" style={{ color: "#A8A29E" }}>COUNTRY</span>
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="text-[11px] border px-2 py-1 outline-none"
            style={{ borderColor: "#E2E5DE", color: "#1C1917", background: "#F0F5F1", minWidth: 130 }}
          >
            <option value="all">All Countries</option>
            {countryList.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium" style={{ color: "#A8A29E" }}>YEAR</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={brushRange[0]}
              onChange={(e) => setBrushRange([parseInt(e.target.value) || minYear, brushRange[1]])}
              className="w-[72px] text-[11px] border px-2 py-1 bg-white text-center outline-none"
              style={{ borderColor: "#E2E5DE", color: "#1C1917", fontFamily: "monospace" }}
              min={minYear}
              max={brushRange[1]}
            />
            <span style={{ color: "#A8A29E" }}>&ndash;</span>
            <input
              type="number"
              value={brushRange[1]}
              onChange={(e) => setBrushRange([brushRange[0], parseInt(e.target.value) || maxYear])}
              className="w-[72px] text-[11px] border px-2 py-1 bg-white text-center outline-none"
              style={{ borderColor: "#E2E5DE", color: "#1C1917", fontFamily: "monospace" }}
              min={brushRange[0]}
              max={maxYear}
            />
          </div>
        </div>
      </div>

      {/* Stat counters */}
      <div className="grid grid-cols-5 gap-px mb-5" style={{ background: "#E2E5DE" }}>
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className="px-4 py-3 text-left cursor-pointer transition-colors"
            style={{
              background: metric === m.key ? "#D1FAE5" : "#FFFFFF",
              borderBottom: metric === m.key ? "2px solid #D97706" : "2px solid transparent",
            }}
          >
            <div className="text-[10px] font-medium" style={{ color: "#A8A29E" }}>{m.label.toUpperCase()}</div>
            <div className="text-xl font-semibold mt-0.5" style={{ color: "#1C1917", fontFamily: "monospace" }}>
              {(stats as any)[m.key]?.toLocaleString() || "0"}
            </div>
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="mb-5" style={{ background: "#FFFFFF", border: "1px solid #E2E5DE" }}>
        <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "#E2E5DE" }}>
          <h3 className="text-[11px] font-semibold" style={{ color: "#1C1917" }}>
            {METRICS.find((m) => m.key === metric)?.label} Over Time
          </h3>
          <span className="text-[10px]" style={{ color: "#A8A29E", fontFamily: "monospace" }}>
            {brushRange[0]} &ndash; {brushRange[1]}
          </span>
        </div>
        <div className="px-2 py-2">
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={yearlyData}>
              <defs>
                <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#134E4A" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#134E4A" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" vertical={false} />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 10, fill: "#A8A29E", fontFamily: "monospace" }}
                tickLine={false}
                axisLine={{ stroke: "#E2E5DE" }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#A8A29E", fontFamily: "monospace" }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 2,
                  border: "1px solid #E2E5DE",
                  fontSize: 11,
                  fontFamily: "monospace",
                  background: "#FFFFFF",
                  padding: "6px 10px",
                }}
                formatter={(value: number) => [value.toLocaleString(), METRICS.find((m) => m.key === metric)?.label]}
              />
              <Area
                type="monotone"
                dataKey={metric}
                stroke="#134E4A"
                strokeWidth={1.5}
                fill="url(#colorMetric)"
                dot={false}
                activeDot={{ r: 3, fill: "#134E4A", stroke: "#fff", strokeWidth: 1.5 }}
              />
              <Brush
                dataKey="year"
                height={20}
                stroke="#D1FAE5"
                fill="#F0F5F1"
                travellerWidth={8}
                onChange={handleBrushChange}
                startIndex={0}
                endIndex={yearlyData.length - 1}
                tickFormatter={(v) => String(v)}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom tables */}
      <div className="grid grid-cols-2 gap-px" style={{ background: "#E2E5DE" }}>

        {/* Top Species */}
        <div style={{ background: "#FFFFFF" }}>
          <div className="px-4 py-2.5 border-b" style={{ borderColor: "#E2E5DE" }}>
            <h3 className="text-[11px] font-semibold" style={{ color: "#1C1917" }}>Top Species in Selected Range</h3>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b" style={{ borderColor: "#EBEDE9" }}>
                  <th className="text-left px-4 py-1.5 font-medium" style={{ color: "#A8A29E", background: "#F0F5F1" }}>#</th>
                  <th className="text-left px-4 py-1.5 font-medium" style={{ color: "#A8A29E", background: "#F0F5F1" }}>Species</th>
                  <th className="text-right px-4 py-1.5 font-medium" style={{ color: "#A8A29E", background: "#F0F5F1" }}>Years Active</th>
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
                    <tr key={name} className="border-b" style={{ borderColor: "#EBEDE9" }}>
                      <td className="px-4 py-1.5" style={{ color: "#D1FAE5", fontFamily: "monospace" }}>{i + 1}</td>
                      <td className="px-4 py-1.5 font-medium" style={{ color: "#1C1917" }}>{name}</td>
                      <td className="px-4 py-1.5 text-right" style={{ color: "#57534E", fontFamily: "monospace" }}>{count}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Yearly Breakdown */}
        <div style={{ background: "#FFFFFF" }}>
          <div className="px-4 py-2.5 border-b" style={{ borderColor: "#E2E5DE" }}>
            <h3 className="text-[11px] font-semibold" style={{ color: "#1C1917" }}>Yearly Breakdown</h3>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b" style={{ borderColor: "#EBEDE9" }}>
                  <th className="text-left px-4 py-1.5 font-medium" style={{ color: "#A8A29E", background: "#F0F5F1" }}>Year</th>
                  <th className="text-right px-4 py-1.5 font-medium" style={{ color: "#A8A29E", background: "#F0F5F1" }}>Records</th>
                  <th className="text-right px-4 py-1.5 font-medium" style={{ color: "#A8A29E", background: "#F0F5F1" }}>Species</th>
                  <th className="text-right px-4 py-1.5 font-medium" style={{ color: "#A8A29E", background: "#F0F5F1" }}>Hosts</th>
                </tr>
              </thead>
              <tbody>
                {brushedData.slice().reverse().map((d) => (
                  <tr key={d.year} className="border-b" style={{ borderColor: "#EBEDE9" }}>
                    <td className="px-4 py-1.5 font-medium" style={{ color: "#1C1917", fontFamily: "monospace" }}>{d.year}</td>
                    <td className="px-4 py-1.5 text-right" style={{ color: "#57534E", fontFamily: "monospace" }}>{d.records.toLocaleString()}</td>
                    <td className="px-4 py-1.5 text-right" style={{ color: "#57534E", fontFamily: "monospace" }}>{d.species}</td>
                    <td className="px-4 py-1.5 text-right" style={{ color: "#57534E", fontFamily: "monospace" }}>{d.hosts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
