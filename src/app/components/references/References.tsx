import { useEffect, useMemo, useState } from "react";
import { atlas } from "../common/Atlas";

interface EpRecord {
  id: number;
  species: string | null;
  yearOfStudy: string | null;
  country: string | null;
  title: string | null;
  links: string | null;
  epidemiologicalDisease: string | null;
}

interface SourceEntry {
  key: string;
  title: string;
  link: string | null;
  doi: string | null;
  count: number;
  years: string[];
  species: Set<string>;
  countries: Set<string>;
}

const DOI_RE = /(?:doi\.org\/)?(10\.\d{4,}\/[^\s]+)/i;

function extractDoi(link: string | null): string | null {
  if (!link) return null;
  const m = link.match(DOI_RE);
  return m ? m[1].replace(/[.,;:)\]\s]+$/, "") : null;
}

const GBIF = {
  title: "GBIF Occurrence Download",
  citation:
    "GBIF.org, 2026. GBIF Occurrence Download — African tick occurrence records. Global Biodiversity Information Facility. Available at: https://doi.org/10.15468/dl.jve6v3",
  doi: "10.15468/dl.jve6v3",
};

export function References() {
  const [sources, setSources] = useState<SourceEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/epidemiological.json")
      .then((r) => r.json())
      .then((json) => {
        const data: EpRecord[] = Array.isArray(json) ? json : json?.data || [];
        const map = new Map<string, SourceEntry>();
        for (const rec of data) {
          const title = (rec.title || "").trim();
          const link = (rec.links || "").trim();
          if (!title && !link) continue;
          const key = `${title}\u0000${link}`;
          let src = map.get(key);
          if (!src) {
            src = {
              key,
              title,
              link: link || null,
              doi: extractDoi(link || null),
              count: 0,
              years: [],
              species: new Set(),
              countries: new Set(),
            };
            map.set(key, src);
          }
          src.count += 1;
          if (rec.yearOfStudy) src.years.push(rec.yearOfStudy);
          if (rec.species) src.species.add(rec.species);
          if (rec.country) src.countries.add(rec.country);
        }
        const list = Array.from(map.values()).sort(
          (a, b) => b.count - a.count || (a.title || a.link || "").localeCompare(b.title || b.link || "")
        );
        if (!active) return;
        setTotal(data.length);
        setSources(list);
      })
      .catch(() => {
        if (active) setSources([]);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!sources) return [];
    const q = query.trim().toLowerCase();
    if (!q) return sources;
    return sources.filter((s) => {
      const hay = `${s.title} ${s.link} ${Array.from(s.countries).join(" ")} ${Array.from(s.species).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sources, query]);

  const visible = showAll ? filtered : filtered.slice(0, 250);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold" style={{ color: atlas.text }}>References</h1>
        <p className="text-sm mt-1" style={{ color: atlas.textSub }}>
          Source literature underlying the African Tick Atlas. References are compiled from peer-reviewed
          publications curated within the epidemiological data set ({total.toLocaleString()} records).
        </p>
      </div>

      <div className="rounded-lg border p-5" style={{ borderColor: atlas.border, background: "var(--card-bg)" }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: atlas.teal }}>Dataset source</span>
        </div>
        <p className="text-sm text-center py-1 font-mono" style={{ color: atlas.text }}>
          {GBIF.title} &middot; {GBIF.citation}
        </p>
        <p className="text-xs" style={{ color: atlas.textSub }}>
          Data DOI:{" "}
          <a
            href={`https://doi.org/${GBIF.doi}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono hover:underline"
            style={{ color: atlas.teal }}
          >
            {GBIF.doi}
          </a>{" "}
          &middot; Tick occurrence records, largely compiled from field surveys and published literature via GBIF.
        </p>
      </div>

      {sources && sources.length > 0 && (
        <div className="rounded-lg border p-4" style={{ borderColor: atlas.border, background: "var(--card-bg)" }}>
          <div className="flex flex-wrap items-center gap-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search references (title, author, DOI, country, species)..."
              className="flex-1 min-w-[260px] px-3 py-2 rounded-md outline-none text-sm"
              style={{ border: `1px solid ${atlas.borderStrong}`, color: atlas.text, background: "#fff" }}
            />
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-xs font-medium px-4 py-2 rounded-md"
              style={{ background: atlas.teal, color: "#fff", border: "none", cursor: "pointer" }}
            >
              {showAll ? "Show fewer" : `Show all (${filtered.length.toLocaleString()})`}
            </button>
          </div>
          <div className="text-[11px] mt-2" style={{ color: atlas.textSub }}>
            {sources.length.toLocaleString()} distinct sources &middot; showing {visible.length.toLocaleString()}
            {query ? ` matching "${query}"` : ""}
          </div>
        </div>
      )}

      {sources === null ? (
        <div className="rounded-lg border p-10 text-center" style={{ borderColor: atlas.border }}>
          <span className="text-sm" style={{ color: atlas.textSub }}>Loading references…</span>
        </div>
      ) : sources.length === 0 ? (
        <div className="rounded-lg border p-10 text-center" style={{ borderColor: atlas.border }}>
          <span className="text-sm" style={{ color: atlas.textSub }}>No references available.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((s) => (
            <div key={s.key} className="rounded-lg border p-4 flex items-start gap-4" style={{ borderColor: atlas.border, background: "var(--card-bg)" }}>
              <div
                className="w-12 h-10 rounded-md flex items-center justify-center text-[11px] font-mono shrink-0 flex-shrink-0"
                style={{ background: atlas.tealLight, color: atlas.teal }}
              >
                {s.count}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm leading-snug" style={{ color: atlas.text }}>
                  {s.title ? (
                    <em>{s.title}</em>
                  ) : s.doi || s.link ? (
                    <span className="font-mono text-[13px]">{s.link}</span>
                  ) : (
                    "Uncited source"
                  )}
                </div>
                <div className="text-xs mt-1" style={{ color: atlas.textSub }}>
                  {s.years.length ? <>Years: {Array.from(new Set(s.years)).sort().join(", ")} &middot; </> : null}
                  {s.countries.size ? <>Countries: {Array.from(s.countries).join(", ")} &middot; </> : null}
                  {s.species.size ? <>Species: {Array.from(s.species).join(", ")}</> : null}
                </div>
                {s.doi && (
                  <a
                    href={`https://doi.org/${s.doi}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium hover:underline"
                    style={{ color: atlas.teal }}
                  >
                    doi.org/{s.doi}
                  </a>
                )}
              </div>
            </div>
          ))}
          {!showAll && filtered.length > visible.length && (
            <div className="text-center py-3">
              <button
                onClick={() => setShowAll(true)}
                className="text-xs font-medium px-4 py-2 rounded-md"
                style={{ border: `1px solid ${atlas.borderStrong}`, color: atlas.teal, background: "#fff", cursor: "pointer" }}
              >
                Show all {filtered.length.toLocaleString()} references
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
