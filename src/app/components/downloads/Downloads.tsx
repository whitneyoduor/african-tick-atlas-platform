import { useState, useRef, useCallback } from "react";
import { atlas, PageHeader, Panel, FigureExportButton } from "../common/Atlas";

interface FigureExportTarget {
  id: string;
  label: string;
  description: string;
  pageRoute: string;
  ref?: React.RefObject<HTMLElement>;
  captureFn?: () => HTMLCanvasElement;
}

export function Downloads() {
  const [exporting, setExporting] = useState<string | null>(null);

  const figureTargets: FigureExportTarget[] = [
    {
      id: "trends-chart",
      label: "Temporal Trends Chart",
      description: "Yearly tick occurrence trends with brush selection",
      pageRoute: "/trends",
    },
    {
      id: "febrile-choropleth",
      label: "Febrile Pathogens Choropleth",
      description: "Geographic distribution of febrile illness pathogens by genus",
      pageRoute: "/febrile",
    },
    {
      id: "disease-map",
      label: "Disease Distribution Map",
      description: "Point map of selected pathogen occurrences",
      pageRoute: "/diseases",
    },
    {
      id: "species-map",
      label: "Species Range Map",
      description: "Tick species occurrence map with host/pathogen associations",
      pageRoute: "/species",
    },
    {
      id: "climsynoptick-map",
      label: "CLIMSYNOPTICK Choropleth",
      description: "Admin-unit choropleth of livestock, tick, facility, and pathogen layers",
      pageRoute: "/climsynoptick",
    },
  ];

  const handleFigureExport = useCallback(async (target: FigureExportTarget) => {
    setExporting(target.id);
    try {
      // Note: The actual capture would require the target component to expose its canvas/ref
      // For now, show a message directing user to the page
      const url = target.pageRoute;
      window.open(url, "_blank");
    } finally {
      setExporting(null);
    }
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Figure Downloads</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Raw data downloads are currently restricted. You can export figures (PNG) from the main analytical pages.
        </p>
      </div>

      <div className="rounded-lg border p-6 space-y-6" style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}>
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Data Access Notice</h3>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          The underlying tick surveillance data (CSV, GeoJSON) is not publicly downloadable at this time.
          Data will be made available for download once sustainable funding is secured to support platform maintenance
          and open-access distribution. Please contact the ICIPE platform team for data access requests.
        </p>
        <div className="flex items-center gap-3 p-3 rounded-md" style={{ background: "var(--accent-amber-light)", border: "1px solid var(--accent-amber)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--accent-amber)" }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="text-sm" style={{ color: "var(--accent-amber)" }}>
            Raw data access requires a data-sharing agreement. Figure exports are freely available.
          </span>
        </div>
      </div>

      <div className="rounded-lg border p-6" style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}>
        <h3 className="text-sm font-semibold mb-5" style={{ color: "var(--text-primary)" }}>Export Figures (PNG)</h3>
        <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
          Navigate to each page and use the figure export button (camera icon) in chart/map panels to download publication-ready PNGs.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {figureTargets.map((t) => (
            <div key={t.id} className="rounded-lg border p-4 transition-all hover:shadow-md" style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 flex-shrink-0" style={{ background: "var(--accent-teal-light)", color: "var(--accent-teal)" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{t.label}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{t.description}</div>
                </div>
              </div>
              <button
                onClick={() => handleFigureExport(t)}
                disabled={exporting === t.id}
                className="w-full mt-3 text-xs font-medium px-3 py-2 rounded-lg border transition-all flex items-center justify-center gap-1.5"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--page-bg)",
                  color: "var(--text-sub)",
                  cursor: exporting === t.id ? "not-allowed" : "pointer",
                  opacity: exporting === t.id ? 0.6 : 1,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>{exporting === t.id ? "Opening..." : "Go to page & export"}</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-6" style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>License</h3>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Figures exported from this platform are made available under the{" "}
          <strong style={{ color: "var(--text-primary)" }}>Creative Commons Attribution 4.0 International</strong> license.
          Please cite the African Tick Surveillance Atlas when using these figures.
        </p>
      </div>
    </div>
  );
}