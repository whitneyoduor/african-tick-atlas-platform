import { useState, useRef, useCallback } from "react";
import { fetchTicks, exportAsCSV, exportAsGeoJSON } from "../../lib/api";

export function Downloads() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [format, setFormat] = useState<"csv" | "geojson">("csv");
  const [recordCount, setRecordCount] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const handleDownload = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setSuccess(false);
    setRecordCount(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetchTicks({ limit: 50000, signal: controller.signal });
      if (controller.signal.aborted) return;
      const records = res.data;
      setRecordCount(records.length);
      if (format === "csv") exportAsCSV(records);
      else exportAsGeoJSON(records);
      setSuccess(true);
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setError(e.message || "Download failed. Please try again.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }, [format, loading]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setError(null);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Data Downloads</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Download tick surveillance data in multiple formats</p>
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-8">
        <div className="rounded-lg border p-6 space-y-6" style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Download Configuration</h3>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider mb-2.5 block" style={{ color: "var(--text-muted)" }}>Data Format</label>
            <div className="grid grid-cols-2 gap-2.5">
              {(["csv", "geojson"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => { if (!loading) setFormat(f); }}
                  className="text-xs font-medium px-4 py-3 rounded-lg border transition-all"
                  style={{
                    borderColor: format === f ? "var(--accent-teal)" : "var(--border)",
                    background: format === f ? "var(--accent-teal-light)" : "var(--card-bg)",
                    color: format === f ? "var(--accent-teal)" : "var(--text-muted)",
                  }}
                >
                  <div className="font-semibold">{f.toUpperCase()}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {f === "csv" ? "Tabular data" : "Spatial points"}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              onClick={loading ? handleCancel : handleDownload}
              className="w-full text-sm font-medium px-4 py-2.5 rounded-lg transition-all flex items-center justify-center gap-2.5"
              style={{
                background: loading ? "var(--page-bg)" : "var(--accent-teal)",
                color: loading ? "var(--text-muted)" : "#fff",
                border: loading ? "1px solid var(--border)" : "1px solid var(--accent-teal)",
              }}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2" style={{ borderColor: "var(--text-muted)", borderTopColor: "transparent" }} />
                  <span>Downloading...</span>
                </>
              ) : (
                <span>Download {format.toUpperCase()}</span>
              )}
            </button>
            {loading && (
              <button
                onClick={handleCancel}
                className="w-full text-xs py-1 transition-colors hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                Cancel
              </button>
            )}
          </div>

          {error && (
            <div className="text-xs rounded-lg px-3 py-2.5 flex items-center justify-between" style={{ background: "var(--accent-red-light)", color: "var(--accent-red)" }}>
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-2 font-bold">&times;</button>
            </div>
          )}

          {success && (
            <div className="text-xs rounded-lg px-3 py-2.5 flex items-center justify-between" style={{ background: "var(--accent-teal-light)", color: "var(--accent-teal)" }}>
              <span className="font-medium">Downloaded {recordCount?.toLocaleString()} records successfully</span>
              <button onClick={() => { setSuccess(false); setRecordCount(null); }} className="ml-2" style={{ color: "var(--text-muted)" }}>&times;</button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-5" style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-primary)" }}>Data Dictionary</h3>
            <div className="space-y-1.5">
              {[
                { field: "species", desc: "Tick species name" },
                { field: "country", desc: "Country of collection" },
                { field: "latitude", desc: "Decimal latitude" },
                { field: "longitude", desc: "Decimal longitude" },
                { field: "yearOfStudy", desc: "Year or date range" },
                { field: "relatedHosts", desc: "Host species" },
                { field: "epidemiologicalDisease", desc: "Associated disease" },
                { field: "methodOfExtraction", desc: "Collection method" },
              ].map((f) => (
                <div key={f.field} className="flex items-center gap-2.5 py-1">
                  <code className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--accent-teal-light)", color: "var(--accent-teal)", minWidth: 100, fontFamily: "monospace" }}>{f.field}</code>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{f.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border p-5" style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-primary)" }}>License</h3>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Data is made available under the <strong style={{ color: "var(--text-primary)" }}>Creative Commons Attribution 4.0 International</strong> license.
              Please cite the African Tick Surveillance Atlas when using this data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
