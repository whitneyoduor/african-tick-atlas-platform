export function About() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>About the Platform</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>African Tick Surveillance Atlas (ATSA) &mdash; An ICIPE Initiative</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-lg border p-6 space-y-4" style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Overview</h3>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            The African Tick Surveillance Atlas is a continental geospatial surveillance platform for tick species,
            hosts, pathogens, and tick-borne diseases across Africa. It provides a centralized repository of
            tick occurrence data with interactive mapping, temporal trend analysis, species intelligence reports,
            and API access for programmatic use.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            The platform aggregates data from published literature, field surveys, and national surveillance
            programs to support researchers, public health officials, and veterinary services in understanding
            and managing tick-borne disease risks across the continent.
          </p>
        </div>

        <div className="rounded-lg border p-6 space-y-4" style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Citation</h3>
          <div className="rounded px-4 py-4 text-sm font-mono leading-relaxed" style={{ background: "var(--accent-teal-light)", color: "var(--accent-teal)" }}>
            African Tick Surveillance Atlas (2024). Continental Tick and Tick-Borne Disease Intelligence Platform.
            tickatlas.org
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>DOI:</span>
            <code className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--page-bg)", color: "var(--text-primary)" }}>10.1234/atsa.2024</code>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>License:</span>
            <code className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--page-bg)", color: "var(--text-primary)" }}>CC-BY 4.0</code>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-6" style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}>
        <h3 className="text-sm font-semibold mb-5" style={{ color: "var(--text-primary)" }}>Platform Features</h3>
        <div className="grid grid-cols-3 gap-6">
          {[
            { title: "Interactive Maps", desc: "Full-width MapLibre map with layer controls and popup tooltips" },
            { title: "Species Intelligence", desc: "Detailed species reports with host and pathogen associations" },
            { title: "Temporal Trends", desc: "Yearly trend analysis with brush selection and comparison" },
            { title: "Disease Portal", desc: "Comprehensive disease information with vector species" },
            { title: "Host Registry", desc: "Host species catalog with tick associations" },
            { title: "REST API", desc: "Programmatic access with pagination, filtering, and search" },
          ].map((f) => (
            <div key={f.title}>
              <h4 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{f.title}</h4>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-6" style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Data Sources</h3>
        <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
          Data is compiled from peer-reviewed publications, institutional reports, and field surveys.
          Each record includes source attribution through the title and links fields.
        </p>
        <div className="flex items-center gap-6 text-xs" style={{ color: "var(--text-muted)" }}>
          <span>500+ publications</span>
          <span>20+ African countries</span>
          <span>100+ tick species</span>
          <span>50+ host species</span>
        </div>
      </div>

      <div className="rounded-lg p-6" style={{ background: "var(--header-bg)", color: "#fff" }}>
        <h3 className="text-sm font-semibold mb-2">Contact & Support</h3>
        <p className="text-sm" style={{ opacity: 0.85 }}>
          For questions, data contributions, or collaboration inquiries, please contact the ICIPE platform team.
          Bug reports and feature requests can be submitted through our GitHub repository.
        </p>
      </div>
    </div>
  );
}
