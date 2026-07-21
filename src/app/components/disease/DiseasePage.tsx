import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { fetchTicks, type TickRecord } from "../../lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function DiseasePage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const decoded = decodeURIComponent(name || "");
  const [records, setRecords] = useState<TickRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!decoded) return;
    fetchTicks({ disease: decoded, limit: 50000 })
      .then((res) => { setRecords(res.data); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [decoded]);

  const data = useMemo(() => {
    const species: Record<string, number> = {};
    const hosts: Record<string, number> = {};
    const countries: Record<string, number> = {};

    records.forEach((r) => {
      if (r.species) species[r.species] = (species[r.species] || 0) + 1;
      if (r.relatedHosts) hosts[r.relatedHosts] = (hosts[r.relatedHosts] || 0) + 1;
      if (r.country) countries[r.country] = (countries[r.country] || 0) + 1;
    });

    return {
      species: Object.entries(species).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      hosts: Object.entries(hosts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      countries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c })),
      speciesCount: Object.keys(species).length,
      hostCount: Object.keys(hosts).length,
      countryCount: Object.keys(countries).length,
    };
  }, [records]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <span className="text-sm" style={{ color: "#A8A29E" }}>Loading...</span>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-6" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="mb-6">
        <button onClick={() => navigate("/diseases")} className="text-sm mb-1 hover:underline" style={{ color: "#134E4A" }}>&larr; Back to Diseases</button>
        <h1 className="text-2xl font-semibold" style={{ color: "#1C1917" }}>{decoded}</h1>
        <p className="text-sm mt-1" style={{ color: "#57534E" }}>
          {records.length.toLocaleString()} records &middot; {data.countryCount} countries &middot; {data.speciesCount} tick vectors
        </p>
      </div>

      <div className="grid grid-cols-3 gap-px mb-6" style={{ background: "#E2E5DE" }}>
        {[
          { label: "Records", value: records.length },
          { label: "Tick Vectors", value: data.speciesCount },
          { label: "Countries", value: data.countryCount },
        ].map((m) => (
          <div key={m.label} className="px-5 py-4" style={{ background: "#FFFFFF" }}>
            <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#A8A29E" }}>{m.label}</div>
            <div className="text-3xl font-semibold mt-1" style={{ color: "#1C1917", fontFamily: "monospace" }}>{m.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-px mb-6" style={{ background: "#E2E5DE" }}>
        <div style={{ background: "#FFFFFF" }}>
          <div className="px-5 py-3 border-b" style={{ borderColor: "#E2E5DE" }}>
            <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Tick Vectors</h3>
          </div>
          <div className="p-3">
            <ResponsiveContainer width="100%" height={Math.max(200, data.species.length * 36)}>
              <BarChart data={data.species} layout="vertical" margin={{ left: 10, right: 30 }}>
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
            <ResponsiveContainer width="100%" height={Math.max(200, data.countries.length * 36)}>
              <BarChart data={data.countries} layout="vertical" margin={{ left: 10, right: 30 }}>
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
          <ResponsiveContainer width="100%" height={Math.max(200, data.hosts.length * 36)}>
            <BarChart data={data.hosts} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: "#1C1917" }} tickLine={false} axisLine={false} width={200} />
              <Tooltip contentStyle={{ borderRadius: 2, border: "1px solid #E2E5DE", fontSize: 12, fontFamily: "monospace", background: "#FFFFFF", padding: "8px 12px" }} />
              <Bar dataKey="count" fill="#D97706" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
