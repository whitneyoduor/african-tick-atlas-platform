import { useEffect, useState } from "react";
import { fetchEpidemiologicalMeta, fetchOccurrenceMeta, type EpidemiologicalMeta, type OccurrenceMeta } from "../../lib/api";

const REPO_URL = "https://github.com/whitneyoduor/african-tick-atlas-platform";

export function About() {
  const [occMeta, setOccMeta] = useState<OccurrenceMeta | null>(null);
  const [epiMeta, setEpiMeta] = useState<EpidemiologicalMeta | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchOccurrenceMeta().catch(() => null),
      fetchEpidemiologicalMeta().catch(() => null),
    ]).then(([o, e]) => {
      if (!active) return;
      setOccMeta(o);
      setEpiMeta(e);
    });
    return () => { active = false; };
  }, []);

  const stats = [
    { label: "Occurrence records", value: occMeta?.totalRecords ?? null },
    { label: "Epidemiological records", value: epiMeta?.totalRecords ?? null },
    { label: "Tick species", value: occMeta?.species.length ?? null },
    { label: "Diseases & pathogens", value: epiMeta?.diseases.length ?? null },
    { label: "Host species", value: epiMeta?.hosts.length ?? null },
    { label: "Countries", value: occMeta?.countries.length ?? null },
  ];

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
            and downloadable datasets.
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
            African Tick Surveillance Atlas ({new Date().getFullYear()}). Continental Tick and Tick-Borne Disease
            Intelligence Platform.
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>License:</span>
            <code className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--page-bg)", color: "var(--text-primary)" }}>CC-BY 4.0</code>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Source code:</span>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium hover:underline"
              style={{ color: "var(--accent-teal)" }}
            >
              github.com/whitneyoduor/african-tick-atlas-platform
            </a>
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-6" style={{ borderColor: "var(--border)", background: "var(--card-bg)" }}>
        <h3 className="text-sm font-semibold mb-5" style={{ color: "var(--text-primary)" }}>Platform Features</h3>
        <div className="grid grid-cols-3 gap-6">
          {[
            { title: "Interactive Maps", desc: "Full-width MapLibre map with six layers and popup tooltips" },
            { title: "Species Intelligence", desc: "Detailed species reports with host and pathogen associations" },
            { title: "Temporal Trends", desc: "Yearly trend analysis with brush selection and comparison" },
            { title: "Disease Portal", desc: "Comprehensive disease information with vector species" },
            { title: "Host Registry", desc: "Host species catalog with tick associations" },
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
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-xs" style={{ color: "var(--text-muted)" }}>
          {stats.map((s) => (
            <span key={s.label}>
              <strong style={{ color: "var(--text-primary)", fontFamily: "monospace" }}>
                {s.value != null ? s.value.toLocaleString() : "—"}
              </strong>
              {" "}{s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg p-6" style={{ background: "var(--header-bg)", color: "#fff" }}>
        <h3 className="text-sm font-semibold mb-2">Contact & Support</h3>
        <p className="text-sm" style={{ opacity: 0.85 }}>
          For questions, data contributions, or collaboration inquiries, please contact the ICIPE platform team.
          Bug reports and feature requests can be submitted through our{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="underline" style={{ color: "#D1FAE5" }}>
            GitHub repository
          </a>.
        </p>
      </div>
    </div>
  );
}
