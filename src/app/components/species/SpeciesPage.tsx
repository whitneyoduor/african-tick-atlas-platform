import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router";
import { fetchTicks, type TickRecord } from "../../lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function SpeciesPage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const decoded = decodeURIComponent(name || "");
  const [records, setRecords] = useState<TickRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!decoded) return;
    fetchTicks({ species: decoded, limit: 50000 })
      .then((res) => { setRecords(res.data); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [decoded]);

  const countryData = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => { if (r.country) counts[r.country] = (counts[r.country] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c }));
  }, [records]);

  const hostData = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => { if (r.relatedHosts) counts[r.relatedHosts] = (counts[r.relatedHosts] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({ name: n, count: c }));
  }, [records]);

  const diseaseData = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => { if (r.epidemiologicalDisease) counts[r.epidemiologicalDisease] = (counts[r.epidemiologicalDisease] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([n, c]) => ({
      name: n.length > 35 ? n.slice(0, 35) + "..." : n,
      count: c,
    }));
  }, [records]);

  const yearlyData = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => {
      const y = r.yearStart;
      if (y === null || y === undefined) return;
      counts[y] = (counts[y] || 0) + 1;
    });
    return Object.entries(counts).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([y, c]) => ({ year: y, count: c }));
  }, [records]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <span className="text-sm" style={{ color: "#A8A29E" }}>Loading...</span>
    </div>
  );

  const hostCount = new Set(records.map(r => r.relatedHosts).filter(Boolean)).size;
  const diseaseCount = new Set(records.map(r => r.epidemiologicalDisease).filter(Boolean)).size;
  const countryCount = new Set(records.map(r => r.country).filter(Boolean)).size;

  return (
    <div className="max-w-7xl mx-auto px-6 py-6" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="mb-6">
        <button onClick={() => navigate("/species")} className="text-sm mb-1 hover:underline" style={{ color: "#134E4A" }}>&larr; Back to Species</button>
        <h1 className="text-2xl font-semibold" style={{ color: "#1C1917" }}>{decoded}</h1>
        <p className="text-sm mt-1" style={{ color: "#57534E" }}>
          {records.length.toLocaleString()} records &middot; {countryCount} countries &middot; {hostCount} hosts &middot; {diseaseCount} diseases
        </p>
      </div>

      <div className="grid grid-cols-4 gap-px mb-6" style={{ background: "#E2E5DE" }}>
        {[
          { label: "Records", value: records.length },
          { label: "Countries", value: countryCount },
          { label: "Hosts", value: hostCount },
          { label: "Diseases", value: diseaseCount },
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
            <h3 className="text-sm font-semibold" style={{ color: "#1C1917" }}>Records by Country</h3>
          </div>
          <div className="p-3">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={countryData} layout="vertical" margin={{ left: 10, right: 30 }}>
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
              <BarChart data={hostData} layout="vertical" margin={{ left: 10, right: 30 }}>
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
            {diseaseData.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "#A8A29E" }}>No disease data recorded for this species</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, diseaseData.length * 36)}>
                <BarChart data={diseaseData} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EBEDE9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12, fill: "#A8A29E", fontFamily: "monospace" }} tickLine={false} axisLine={{ stroke: "#E2E5DE" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#1C1917" }} tickLine={false} axisLine={false} width={250} />
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
              <BarChart data={yearlyData}>
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
    </div>
  );
}
