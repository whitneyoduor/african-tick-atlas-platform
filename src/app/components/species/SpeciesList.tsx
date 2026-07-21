import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { fetchTicks, fetchMetaCounts, type TickRecord, type MetaCounts } from "../../lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function SpeciesList() {
  const [searchParams] = useSearchParams();
  const [meta, setMeta] = useState<MetaCounts | null>(null);
  const [records, setRecords] = useState<TickRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    Promise.all([
      fetchMetaCounts().catch(() => null),
      fetchTicks({ limit: 50000 }).catch(() => ({ data: [], pagination: { page: 1, limit: 0, total: 0, totalPages: 0 } })),
    ]).then(([m, r]) => {
      setMeta(m);
      setRecords(r.data);
      setLoading(false);
      const q = searchParams.get("search");
      if (q && r.data.length > 0) {
        const match = r.data.find((rec) => rec.species && rec.species.toLowerCase().includes(q.toLowerCase()));
        if (match?.species) setSelected(match.species);
      }
    });
  }, []);

  const overview = useMemo(() => {
    if (!meta) return null;
    const total = meta.totalRecords;
    const countrySet = new Set<string>();
    const countriesMap: Record<string, Set<string>> = {};
    const diseaseMap: Record<string, Set<string>> = {};

    records.forEach((r) => {
      if (!r.species) return;
      if (!countriesMap[r.species]) countriesMap[r.species] = new Set();
      if (!diseaseMap[r.species]) diseaseMap[r.species] = new Set();
      if (r.country) { countriesMap[r.species].add(r.country); countrySet.add(r.country); }
      if (r.epidemiologicalDisease) diseaseMap[r.species].add(r.epidemiologicalDisease);
    });

    const top15 = meta.species.slice(0, 15).map((s) => ({
      name: s.name.length > 30 ? s.name.slice(0, 30) + "..." : s.name,
      fullName: s.name,
      count: s.count,
      pct: total > 0 ? ((s.count / total) * 100).toFixed(1) : "0",
      countryCount: countriesMap[s.name]?.size || 0,
      diseaseCount: diseaseMap[s.name]?.size || 0,
    }));

    return { totalSpecies: meta.species.length, totalRecords: total, totalCountries: countrySet.size, top15 };
  }, [meta, records]);

  const selectedData = useMemo(() => {
    if (!selected) return null;
    const filtered = records.filter((r) => r.species === selected);
    if (filtered.length === 0) return null;

    const countries: Record<string, number> = {};
    const hosts: Record<string, number> = {};
    const diseases: Record<string, number> = {};
    const yearly: Record<string, number> = {};

    filtered.forEach((r) => {
      if (r.country) countries[r.country] = (countries[r.country] || 0) + 1;
      if (r.relatedHosts) hosts[r.relatedHosts] = (hosts[r.relatedHosts] || 0) + 1;
      if (r.epidemiologicalDisease) diseases[r.epidemiologicalDisease] = (diseases[r.epidemiologicalDisease] || 0) + 1;
      const y = r.yearStart;
      if (y !== null && y !== undefined) yearly[y] = (yearly[y] || 0) + 1;
    });

    return {
      total: filtered.length,
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

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <span className="text-sm" style={{ color: "#A8A29E" }}>Loading...</span>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-6" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: "#1C1917" }}>Tick Species</h1>
        <p className="text-sm mt-1" style={{ color: "#57534E" }}>
          {overview ? `${overview.totalSpecies} species documented across ${overview.totalCountries} countries &middot; ${overview.totalRecords.toLocaleString()} total records` : "Loading species data..."}
        </p>
      </div>

      <div className="flex items-center gap-4 flex-wrap px-5 py-4 mb-6" style={{ background: "#FFFFFF", border: "1px solid #E2E5DE" }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>Select Species</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="text-sm border px-3 py-1.5 outline-none"
            style={{ borderColor: "#E2E5DE", color: "#1C1917", background: "#F0F5F1", minWidth: 300 }}
          >
            <option value="">All species (overview)</option>
            {meta?.species.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>
        {selected && (
          <span className="text-xs font-medium" style={{ color: "#D97706" }}>
            {selectedData?.total.toLocaleString()} records &middot; {selectedData?.uniqueCountries} countries &middot; {selectedData?.uniqueHosts} hosts &middot; {selectedData?.uniqueDiseases} diseases
          </span>
        )}
      </div>

      {!selected && overview && (
        <>
          <div className="grid grid-cols-3 gap-px mb-6" style={{ background: "#E2E5DE" }}>
            {[
              { label: "Total Species", value: overview.totalSpecies },
              { label: "Total Records", value: overview.totalRecords },
              { label: "Countries", value: overview.totalCountries },
            ].map((s) => (
              <div key={s.label} className="px-5 py-4" style={{ background: "#FFFFFF" }}>
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>{s.label}</div>
                <div className="text-3xl font-semibold mt-1" style={{ color: "#1C1917", fontFamily: "monospace" }}>{s.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "#FFFFFF", border: "1px solid #E2E5DE" }}>
            <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
              <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Top 15 Species by Record Count</h3>
            </div>
            <div className="p-3">
              <ResponsiveContainer width="100%" height={480}>
                <BarChart data={overview.top15} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#1C1917" }} tickLine={false} axisLine={false} width={220} />
                  <Tooltip
                    contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }}
                    formatter={(value: number, _name: string, props: any) => {
                      const item = overview.top15.find((s) => s.name === props.payload.name);
                      return [`${value.toLocaleString()} records (${item?.pct}%)`, props.payload.fullName || props.payload.name];
                    }}
                  />
                  <Bar dataKey="count" fill="#134E4A" radius={[0, 3, 3, 0]} cursor="pointer" onClick={(data) => setSelected(data.fullName || data.name)} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {selected && selectedData && (
        <>
          <div className="grid grid-cols-4 gap-px mb-6" style={{ background: "#E2E5DE" }}>
            {[
              { label: "Records", value: selectedData.total },
              { label: "Countries", value: selectedData.uniqueCountries },
              { label: "Hosts", value: selectedData.uniqueHosts },
              { label: "Diseases", value: selectedData.uniqueDiseases },
            ].map((s) => (
              <div key={s.label} className="px-5 py-4" style={{ background: "#FFFFFF" }}>
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>{s.label}</div>
                <div className="text-3xl font-semibold mt-1" style={{ color: "#1C1917", fontFamily: "monospace" }}>{s.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-px mb-6" style={{ background: "#E2E5DE" }}>
            <div style={{ background: "#FFFFFF" }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
                <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Records by Country</h3>
              </div>
              <div className="p-3">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={selectedData.countries} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#1C1917" }} tickLine={false} axisLine={false} width={120} />
                    <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                    <Bar dataKey="count" fill="#134E4A" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{ background: "#FFFFFF" }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
                <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Animal Hosts</h3>
              </div>
              <div className="p-3">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={selectedData.hosts} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#1C1917" }} tickLine={false} axisLine={false} width={120} />
                    <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                    <Bar dataKey="count" fill="#D97706" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px" style={{ background: "#E2E5DE" }}>
            <div style={{ background: "#FFFFFF" }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
                <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Associated Diseases</h3>
              </div>
              <div className="p-3">
                {selectedData.diseases.length === 0 ? (
                  <p className="text-sm py-4 text-center" style={{ color: "#A8A29E" }}>No disease data recorded for this species</p>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={selectedData.diseases} layout="vertical" margin={{ left: 10, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 12, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1C1917" }} tickLine={false} axisLine={false} width={240} />
                      <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                      <Bar dataKey="count" fill="#DC2626" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <div style={{ background: "#FFFFFF" }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
                <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Records Over Time</h3>
              </div>
              <div className="p-3">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={selectedData.yearly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" vertical={false} />
                    <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                    <YAxis tick={{ fontSize: 12, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={false} width={50} />
                    <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                    <Bar dataKey="count" fill="#134E4A" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
