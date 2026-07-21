import { useState } from "react";

export function ApiExplorer() {
  const [copied, setCopied] = useState<string | null>(null);

  const endpoints = [
    { method: "GET", path: "/api/ticks", desc: "List all tick records with pagination", params: "page, limit, species, country, host, disease, search" },
    { method: "GET", path: "/api/ticks/:id", desc: "Get a single tick record by ID", params: "—" },
    { method: "GET", path: "/api/ticks/meta/counts", desc: "Get aggregated metadata counts", params: "—" },
  ];

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {}
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>API Reference</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>REST API for programmatic access to tick surveillance data</p>
      </div>

      <div className="rounded-lg border p-6" style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-primary)" }}>Base URL</h3>
        <div className="rounded px-4 py-3 font-mono text-sm" style={{ background: "var(--accent-teal-light)", color: "var(--accent-teal)" }}>
          https://tickatlas.org/api
        </div>
      </div>

      <div className="space-y-4">
        {endpoints.map((ep) => (
          <div key={ep.path} className="rounded-lg border overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}>
            <div className="px-5 py-4 border-b flex items-center gap-3" style={{ borderColor: "var(--border)" }}>
              <span className="text-xs font-bold px-2 py-1 rounded" style={{ background: "var(--accent-teal-light)", color: "var(--accent-teal)" }}>{ep.method}</span>
              <code className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{ep.path}</code>
            </div>
            <div className="px-5 py-3 flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-muted)" }}>{ep.desc}</span>
              {ep.params !== "—" && (
                <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>Params: {ep.params}</span>
              )}
            </div>
            <div className="px-5 py-3 border-t flex items-center gap-2" style={{ borderColor: "var(--border)", background: "var(--page-bg)" }}>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Example:</span>
              <code className="text-xs font-mono flex-1" style={{ color: "var(--text-primary)" }}>
                {ep.method === "GET" && ep.path.includes(":id")
                  ? `curl ${ep.path.replace(":id", "1")}`
                  : `curl "${ep.path}?limit=10"`}
              </code>
              <button
                onClick={() => copyToClipboard(
                  ep.method === "GET" && ep.path.includes(":id")
                    ? `curl ${ep.path.replace(":id", "1")}`
                    : `curl "${ep.path}?limit=10"`,
                  ep.path
                )}
                className="text-xs font-medium px-3 py-1 rounded transition-colors"
                style={{
                  background: copied === ep.path ? "var(--accent-teal)" : "var(--card-bg)",
                  color: copied === ep.path ? "#fff" : "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}
              >
                {copied === ep.path ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border p-6" style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-primary)" }}>Query Parameters</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                <th className="text-left py-2.5 pr-4 text-xs uppercase font-semibold" style={{ color: "var(--text-muted)" }}>Param</th>
                <th className="text-left py-2.5 pr-4 text-xs uppercase font-semibold" style={{ color: "var(--text-muted)" }}>Type</th>
                <th className="text-left py-2.5 text-xs uppercase font-semibold" style={{ color: "var(--text-muted)" }}>Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                { param: "page", type: "number", desc: "Page number (default: 1)" },
                { param: "limit", type: "number", desc: "Records per page (default: 50, max: 50000)" },
                { param: "species", type: "string", desc: "Filter by tick species name" },
                { param: "country", type: "string", desc: "Filter by country name" },
                { param: "host", type: "string", desc: "Filter by host species" },
                { param: "disease", type: "string", desc: "Filter by disease/pathogen" },
                { param: "search", type: "string", desc: "Full-text search across all fields" },
              ].map((p) => (
                <tr key={p.param} className="border-b" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2.5 pr-4 font-mono text-xs" style={{ color: "var(--text-primary)" }}>{p.param}</td>
                  <td className="py-2.5 pr-4 text-xs" style={{ color: "var(--text-muted)" }}>{p.type}</td>
                  <td className="py-2.5 text-xs" style={{ color: "var(--text-muted)" }}>{p.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
