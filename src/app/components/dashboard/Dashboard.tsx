import { useEffect, useState } from "react";
import { fetchMetaCounts, type MetaCounts } from "../../lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useNavigate } from "react-router";

export function Dashboard() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState<MetaCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchMetaCounts(ctrl.signal)
      .then((d) => { setMeta(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
    return () => ctrl.abort();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="flex flex-col items-center gap-2">
        <div className="animate-spin rounded-full h-5 w-5 border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent-teal)" }} />
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Loading...</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="text-center">
        <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>Failed to load data. Ensure the backend server is running on port 3001.</span>
      </div>
    </div>
  );

  const totalDiseases = meta?.diseases.filter(d => d.name).length || 0;
  const totalSpecies = meta?.species.length || 0;
  const totalHosts = meta?.hosts.filter(h => h.name).length || 0;
  const totalCountries = meta?.countries.length || 0;
  const totalRecords = meta?.totalRecords || 0;

  const diseaseData = meta?.diseases.filter(d => d.name).slice(0, 12).map(d => ({
    name: d.name.length > 28 ? d.name.slice(0, 28) + "..." : d.name,
    count: d.count,
  })) || [];

  const speciesData = meta?.species.slice(0, 12).map(s => ({
    name: s.name.length > 28 ? s.name.slice(0, 28) + "..." : s.name,
    count: s.count,
  })) || [];

  const countryData = meta?.countries.slice(0, 12).map(c => ({
    name: c.name, count: c.count,
  })) || [];

  const topDiseases = meta?.diseases.filter(d => d.name).slice(0, 8) || [];
  const topSpecies = meta?.species.slice(0, 8) || [];

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Dashboard</h1>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          Continental tick and tick-borne disease surveillance data. {totalRecords.toLocaleString()} records across {totalCountries} countries.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-px mb-6" style={{ background: "var(--border)" }}>
        {[
          { label: "RECORDS", value: totalRecords.toLocaleString() },
          { label: "SPECIES", value: String(totalSpecies) },
          { label: "HOSTS", value: String(totalHosts) },
          { label: "DISEASES", value: String(totalDiseases) },
          { label: "COUNTRIES", value: String(totalCountries) },
        ].map((kpi) => (
          <div key={kpi.label} className="px-4 py-3" style={{ background: "var(--card-bg)" }}>
            <div className="text-[10px] font-medium tracking-wider" style={{ color: "var(--text-muted)" }}>{kpi.label}</div>
            <div className="text-xl font-semibold mt-0.5" style={{ color: "var(--text-primary)", fontFamily: "monospace" }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-px mb-6" style={{ background: "var(--border)" }}>
        <div className="p-4" style={{ background: "var(--card-bg)" }}>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>Top Species</h3>
            <button onClick={() => navigate("/species")} className="text-[10px]" style={{ color: "var(--accent-teal)" }}>View all</button>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={speciesData} layout="vertical" margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
              <XAxis type="number" stroke="var(--border)" tick={{ fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 9 }} width={160} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 4, border: "1px solid var(--border)", fontSize: 11, fontFamily: "monospace", background: "var(--card-bg)" }} />
              <Bar dataKey="count" fill="var(--accent-teal)" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="p-4" style={{ background: "var(--card-bg)" }}>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>Diseases &amp; Pathogens</h3>
            <button onClick={() => navigate("/diseases")} className="text-[10px]" style={{ color: "var(--accent-teal)" }}>View all</button>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={diseaseData} layout="vertical" margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
              <XAxis type="number" stroke="var(--border)" tick={{ fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 9 }} width={160} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 4, border: "1px solid var(--border)", fontSize: 11, fontFamily: "monospace", background: "var(--card-bg)" }} />
              <Bar dataKey="count" fill="var(--accent-red)" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="p-4" style={{ background: "var(--card-bg)" }}>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>Records by Country</h3>
            <button onClick={() => navigate("/maps")} className="text-[10px]" style={{ color: "var(--accent-teal)" }}>Map view</button>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={countryData} layout="vertical" margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
              <XAxis type="number" stroke="var(--border)" tick={{ fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 9 }} width={110} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 4, border: "1px solid var(--border)", fontSize: 11, fontFamily: "monospace", background: "var(--card-bg)" }} />
              <Bar dataKey="count" fill="var(--accent-amber)" radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px mb-6" style={{ background: "var(--border)" }}>
        <div style={{ background: "var(--card-bg)" }}>
          <div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
            <h3 className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>Disease Records</h3>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border-light)" }}>
                  <th className="text-left px-4 py-1.5 font-medium" style={{ color: "var(--text-muted)", background: "var(--page-bg)" }}>#</th>
                  <th className="text-left px-4 py-1.5 font-medium" style={{ color: "var(--text-muted)", background: "var(--page-bg)" }}>Disease / Pathogen</th>
                  <th className="text-right px-4 py-1.5 font-medium" style={{ color: "var(--text-muted)", background: "var(--page-bg)" }}>Records</th>
                  <th className="text-right px-4 py-1.5 font-medium" style={{ color: "var(--text-muted)", background: "var(--page-bg)" }}>%</th>
                </tr>
              </thead>
              <tbody>
                {topDiseases.map((d, i) => (
                  <tr
                    key={d.name}
                    className="border-b cursor-pointer"
                    style={{ borderColor: "var(--border-light)" }}
                    onClick={() => navigate(`/diseases/${encodeURIComponent(d.name)}`)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--page-bg)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="px-4 py-1.5" style={{ color: "var(--border)", fontFamily: "monospace" }}>{i + 1}</td>
                    <td className="px-4 py-1.5 font-medium" style={{ color: "var(--text-primary)" }}>{d.name}</td>
                    <td className="px-4 py-1.5 text-right" style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>{d.count.toLocaleString()}</td>
                    <td className="px-4 py-1.5 text-right" style={{ color: "var(--border)", fontFamily: "monospace" }}>
                      {((d.count / totalRecords) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ background: "var(--card-bg)" }}>
          <div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
            <h3 className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>Species Records</h3>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border-light)" }}>
                  <th className="text-left px-4 py-1.5 font-medium" style={{ color: "var(--text-muted)", background: "var(--page-bg)" }}>#</th>
                  <th className="text-left px-4 py-1.5 font-medium" style={{ color: "var(--text-muted)", background: "var(--page-bg)" }}>Tick Species</th>
                  <th className="text-right px-4 py-1.5 font-medium" style={{ color: "var(--text-muted)", background: "var(--page-bg)" }}>Records</th>
                  <th className="text-right px-4 py-1.5 font-medium" style={{ color: "var(--text-muted)", background: "var(--page-bg)" }}>%</th>
                </tr>
              </thead>
              <tbody>
                {topSpecies.map((s, i) => (
                  <tr
                    key={s.name}
                    className="border-b cursor-pointer"
                    style={{ borderColor: "var(--border-light)" }}
                    onClick={() => navigate(`/species?search=${encodeURIComponent(s.name)}`)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--page-bg)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="px-4 py-1.5" style={{ color: "var(--border)", fontFamily: "monospace" }}>{i + 1}</td>
                    <td className="px-4 py-1.5 font-medium" style={{ color: "var(--text-primary)" }}>{s.name}</td>
                    <td className="px-4 py-1.5 text-right" style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>{s.count.toLocaleString()}</td>
                    <td className="px-4 py-1.5 text-right" style={{ color: "var(--border)", fontFamily: "monospace" }}>
                      {((s.count / totalRecords) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mb-6" style={{ background: "var(--card-bg)", border: "1px solid var(--border)" }}>
        <div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>Geographic Distribution</h3>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border-light)" }}>
                <th className="text-left px-4 py-1.5 font-medium" style={{ color: "var(--text-muted)", background: "var(--page-bg)" }}>#</th>
                <th className="text-left px-4 py-1.5 font-medium" style={{ color: "var(--text-muted)", background: "var(--page-bg)" }}>Country</th>
                <th className="text-right px-4 py-1.5 font-medium" style={{ color: "var(--text-muted)", background: "var(--page-bg)" }}>Records</th>
                <th className="text-right px-4 py-1.5 font-medium" style={{ color: "var(--text-muted)", background: "var(--page-bg)" }}>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {meta?.countries.slice(0, 15).map((c, i) => (
                <tr
                  key={c.name}
                  className="border-b cursor-pointer"
                  style={{ borderColor: "var(--border-light)" }}
                  onClick={() => navigate("/maps")}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--page-bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td className="px-4 py-1.5" style={{ color: "var(--border)", fontFamily: "monospace" }}>{i + 1}</td>
                  <td className="px-4 py-1.5 font-medium" style={{ color: "var(--text-primary)" }}>{c.name}</td>
                  <td className="px-4 py-1.5 text-right" style={{ color: "var(--text-secondary)", fontFamily: "monospace" }}>{c.count.toLocaleString()}</td>
                  <td className="px-4 py-1.5 text-right" style={{ color: "var(--border)", fontFamily: "monospace" }}>
                    {((c.count / totalRecords) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] py-3 border-t" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        <span>Data updated: {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
        <span>{totalRecords.toLocaleString()} total records &middot; {totalCountries} countries &middot; {totalSpecies} species</span>
      </div>
    </div>
  );
}
