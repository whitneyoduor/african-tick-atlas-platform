import { useEffect, useMemo, useState } from "react";
import { fetchTicks, fetchMetaCounts, type TickRecord, type MetaCounts } from "../../lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function DiseaseList() {
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
    });
  }, []);

  const overview = useMemo(() => {
    if (!meta) return null;
    const total = meta.totalRecords;
    const vectorMap: Record<string, Set<string>> = {};
    const hostMap: Record<string, Set<string>> = {};
    const countrySet = new Set<string>();

    records.forEach((r) => {
      if (!r.epidemiologicalDisease) return;
      if (!vectorMap[r.epidemiologicalDisease]) vectorMap[r.epidemiologicalDisease] = new Set();
      if (!hostMap[r.epidemiologicalDisease]) hostMap[r.epidemiologicalDisease] = new Set();
      if (r.species) vectorMap[r.epidemiologicalDisease].add(r.species);
      if (r.relatedHosts) hostMap[r.epidemiologicalDisease].add(r.relatedHosts);
      if (r.country) countrySet.add(r.country);
    });

    const top15 = meta.diseases.slice(0, 15).map((d) => ({
      name: d.name.length > 40 ? d.name.slice(0, 40) + "..." : d.name,
      fullName: d.name,
      count: d.count,
      pct: total > 0 ? ((d.count / total) * 100).toFixed(1) : "0",
      vectorCount: vectorMap[d.name]?.size || 0,
      hostCount: hostMap[d.name]?.size || 0,
    }));

    return { totalDiseases: meta.diseases.length, totalRecords: total, totalCountries: countrySet.size, top15 };
  }, [meta, records]);

  const selectedData = useMemo(() => {
    if (!selected) return null;
    const filtered = records.filter((r) => r.epidemiologicalDisease === selected);
    if (filtered.length === 0) return null;

    const species: Record<string, number> = {};
    const hosts: Record<string, number> = {};
    const countries: Record<string, number> = {};

    filtered.forEach((r) => {
      if (r.species) species[r.species] = (species[r.species] || 0) + 1;
      if (r.relatedHosts) hosts[r.relatedHosts] = (hosts[r.relatedHosts] || 0) + 1;
      if (r.country) countries[r.country] = (countries[r.country] || 0) + 1;
    });

    return {
      total: filtered.length,
      species: Object.entries(species).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      hosts: Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      uniqueVectors: Object.keys(species).length,
      uniqueHosts: Object.keys(hosts).length,
      uniqueCountries: Object.keys(countries).length,
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
        <h1 className="text-2xl font-semibold" style={{ color: "#1C1917" }}>Diseases &amp; Pathogens</h1>
        <p className="text-sm mt-1" style={{ color: "#57534E" }}>
          {overview ? `${overview.totalDiseases} diseases and pathogens detected in ticks across ${overview.totalCountries} countries &middot; ${overview.totalRecords.toLocaleString()} total records` : "Loading disease data..."}
        </p>
      </div>

      <div className="flex items-center gap-4 flex-wrap px-5 py-4 mb-6" style={{ background: "#FFFFFF", border: "1px solid #E2E5DE" }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>Select Disease</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="text-sm border px-3 py-1.5 outline-none"
            style={{ borderColor: "#E2E5DE", color: "#1C1917", background: "#F0F5F1", minWidth: 340 }}
          >
            <option value="">All diseases (overview)</option>
            {meta?.diseases.map((d) => (
              <option key={d.name} value={d.name}>{d.name}</option>
            ))}
          </select>
        </div>
        {selected && (
          <span className="text-xs font-medium" style={{ color: "#D97706" }}>
            {selectedData?.total.toLocaleString()} records &middot; {selectedData?.uniqueVectors} vectors &middot; {selectedData?.uniqueHosts} hosts &middot; {selectedData?.uniqueCountries} countries
          </span>
        )}
      </div>

      {!selected && overview && (
        <>
          <div className="grid grid-cols-3 gap-px mb-6" style={{ background: "#E2E5DE" }}>
            {[
              { label: "Total Diseases", value: overview.totalDiseases },
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
              <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Top 15 Diseases by Record Count</h3>
            </div>
            <div className="p-3">
              <ResponsiveContainer width="100%" height={480}>
                <BarChart data={overview.top15} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#1C1917" }} tickLine={false} axisLine={false} width={300} />
                  <Tooltip
                    contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }}
                    formatter={(value: number, _name: string, props: any) => {
                      const item = overview.top15.find((d) => d.name === props.payload.name);
                      return [`${value.toLocaleString()} records (${item?.pct}%)`, props.payload.fullName || props.payload.name];
                    }}
                  />
                  <Bar dataKey="count" fill="#DC2626" radius={[0, 3, 3, 0]} cursor="pointer" onClick={(data) => setSelected(data.fullName || data.name)} />
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
              { label: "Tick Vectors", value: selectedData.uniqueVectors },
              { label: "Hosts", value: selectedData.uniqueHosts },
              { label: "Countries", value: selectedData.uniqueCountries },
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
                <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Tick Vectors</h3>
              </div>
              <div className="p-3">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={selectedData.species} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#1C1917" }} tickLine={false} axisLine={false} width={200} />
                    <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                    <Bar dataKey="count" fill="#DC2626" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{ background: "#FFFFFF" }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
                <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Countries</h3>
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
          </div>

          <div style={{ background: "#FFFFFF", border: "1px solid #E2E5DE" }}>
            <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
              <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Animal Hosts</h3>
            </div>
            <div className="p-3">
              <ResponsiveContainer width="100%" height={Math.max(200, selectedData.hosts.length * 36)}>
                <BarChart data={selectedData.hosts} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#1C1917" }} tickLine={false} axisLine={false} width={200} />
                  <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
                  <Bar dataKey="count" fill="#D97706" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
