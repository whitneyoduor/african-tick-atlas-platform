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

const HUMDATA = {
  title: "HUMdata Human Population Data",
  citation:
    "HDX. Africa Population Data — Humanitarian Data Exchange (OCHA). UNFPA/FAO Common Operational Datasets admin population estimates used for the population density layer on the atlas maps. Available at: https://data.humdata.org/",
  url: "https://data.humdata.org/",
};

const FACILITIES = {
  title: "HDX Health Facilities in Sub-Saharan Africa",
  citation:
    "HDX. Health Facilities in Sub-Saharan Africa — Humanitarian Data Exchange (OCHA). Sub-Saharan health-facility census (2015) with HOT/OSM Maghreb facilities, used for the mapped health-facility layer on the atlas maps. Available at: https://data.humdata.org/dataset/health-facilities-in-sub-saharan-africa",
  url: "https://data.humdata.org/dataset/health-facilities-in-sub-saharan-africa",
};

const MALARIA = {
  title: "Malaria Atlas Project, Malaria Incidence",
  citation:
    "Malaria Atlas Project (MAP). Admin-1 malaria incidence rate (cases per thousand, 2024), used for the malaria layer on the atlas maps. Available at: https://malariaatlas.org/",
  url: "https://malariaatlas.org/",
};

const LIVESTOCK = {
  title: "FAO Gridded Livestock of the World",
  citation:
    "Gilbert, M., Nicolas, G., Cinardi, G., Van Boeckel, T.P., Vanwambeke, S.O., Wint, G.R.W., Robinson, T.P., 2018. Global distribution data for cattle, buffaloes, horses, sheep, goats, pigs, chickens and ducks in 2010. Scientific Data 5, 180227.",
  doi: "10.1038/sdata.2018.227",
};

const MAMMALS = {
  title: "IUCN Red List Mammal Species Richness (Area of Habitat Maps)",
  citation:
    "International Union for Conservation of Nature, 2021. The IUCN Red List of Threatened Species: Mammals — Species Richness from Area of Habitat Maps. See Lumbierres, M., Dahal, P.R., Soria, C.D., Di Marco, M., Butchart, S.H.M., Donald, P.F., Rondinini, C., 2022. Area of Habitat maps for the world's terrestrial birds and mammals. Scientific Data 9, 749.",
  doi: "10.1038/s41597-022-01838-w",
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
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: atlas.teal }}>
            Livestock data source
          </span>
        </div>
        <p className="text-sm text-center py-1 font-mono" style={{ color: atlas.text }}>
          {LIVESTOCK.title} &middot; {LIVESTOCK.citation}
        </p>
        <p className="text-xs" style={{ color: atlas.textSub }}>
          Data DOI:{" "}
          <a
            href={`https://doi.org/${LIVESTOCK.doi}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono hover:underline"
            style={{ color: atlas.teal }}
          >
            {LIVESTOCK.doi}
          </a>{" "}
          &middot; Gridded cattle, sheep and goat density surfaces (heads per ~8 km cell) underpinning the livestock layers on the health maps.
        </p>
      </div>

      <div className="rounded-lg border p-5" style={{ borderColor: atlas.border, background: "var(--card-bg)" }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: atlas.teal }}>
            Mammal data source
          </span>
        </div>
        <p className="text-sm text-center py-1 font-mono" style={{ color: atlas.text }}>
          {MAMMALS.title} &middot; {MAMMALS.citation}
        </p>
        <p className="text-xs" style={{ color: atlas.textSub }}>
          Data DOI:{" "}
          <a
            href={`https://doi.org/${MAMMALS.doi}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono hover:underline"
            style={{ color: atlas.teal }}
          >
            {MAMMALS.doi}
          </a>{" "}
          &middot; Wild-mammal species richness (5 km Area-of-Habitat mosaic) standing in for potential wild tick-host availability on the health maps.
        </p>
      </div>

      <div className="rounded-lg border p-5" style={{ borderColor: atlas.border, background: "var(--card-bg)" }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: atlas.teal }}>
            Human population data source
          </span>
        </div>
        <p className="text-sm text-center py-1 font-mono" style={{ color: atlas.text }}>
          {HUMDATA.title} &middot; {HUMDATA.citation}
        </p>
        <p className="text-xs" style={{ color: atlas.textSub }}>
          Source:{" "}
          <a
            href={HUMDATA.url}
            target="_blank"
            rel="noreferrer"
            className="font-mono hover:underline"
            style={{ color: atlas.teal }}
          >
            {HUMDATA.url}
          </a>{" "}
          &middot; Human population density data underpinning the population density context on the atlas maps.
        </p>
      </div>

      <div className="rounded-lg border p-5" style={{ borderColor: atlas.border, background: "var(--card-bg)" }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: atlas.teal }}>
            Health facility data source
          </span>
        </div>
        <p className="text-sm text-center py-1 font-mono" style={{ color: atlas.text }}>
          {FACILITIES.title} &middot; {FACILITIES.citation}
        </p>
        <p className="text-xs" style={{ color: atlas.textSub }}>
          Source:{" "}
          <a
            href={FACILITIES.url}
            target="_blank"
            rel="noreferrer"
            className="font-mono hover:underline"
            style={{ color: atlas.teal }}
          >
            {FACILITIES.url}
          </a>{" "}
          &middot; Mapped health-facility layer underpinning the health access and facility distributions on the atlas maps.
        </p>
      </div>

      <div className="rounded-lg border p-5" style={{ borderColor: atlas.border, background: "var(--card-bg)" }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: atlas.teal }}>
            Malaria data source
          </span>
        </div>
        <p className="text-sm text-center py-1 font-mono" style={{ color: atlas.text }}>
          {MALARIA.title} &middot; {MALARIA.citation}
        </p>
        <p className="text-xs" style={{ color: atlas.textSub }}>
          Source:{" "}
          <a
            href={MALARIA.url}
            target="_blank"
            rel="noreferrer"
            className="font-mono hover:underline"
            style={{ color: atlas.teal }}
          >
            {MALARIA.url}
          </a>{" "}
          &middot; Malaria incidence rates underpinning the malaria layer on the health maps.
        </p>
      </div>

      <div className="rounded-lg border p-5" style={{ borderColor: atlas.border, background: "var(--card-bg)" }}>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: atlas.teal }}>
            Tick occurrence data source
          </span>
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
