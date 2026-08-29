import { useEffect, useMemo, useState } from "react";
import { atlas, PageHeader, StatCards, Panel, FilterBar, Chip, SourceNote, PageLoader } from "../common/Atlas";
import {
  fetchLivestock,
  fetchCountries,
  fetchFacilities,
  HealthMap,
  METRICS,
  FAC_CLASSES,
  type MetricKey,
  type LivestockData,
  type LivestockCountries,
  type LivestockCountryFeature,
} from "./HealthMap";

function fmtD(v: number): string {
  return v >= 1 ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : v.toFixed(2);
}

function fmtH(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toLocaleString();
}

export function HealthAccess() {
  const [data, setData] = useState<LivestockData | null>(null);
  const [countries, setCountries] = useState<LivestockCountries | null>(null);
  const [facilities, setFacilities] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<MetricKey>("population");
  const [selectedG0, setSelectedG0] = useState<string>("");

  useEffect(() => {
    let active = true;
    Promise.all([fetchLivestock(), fetchCountries(), fetchFacilities()])
      .then(([lv, ct, fc]) => {
        if (!active) return;
        setData(lv);
        setCountries(ct);
        setFacilities(fc);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const facCount = facilities?.features?.length ?? null;
  const facCountries = useMemo(() => {
    if (!facilities) return 0;
    return new Set(facilities.features.map((f: any) => f.properties.co)).size;
  }, [facilities]);

  const classCounts = useMemo(() => {
    const c: Record<string, number> = {};
    if (!facilities) return c;
    for (const f of facilities.features) {
      const k = f.properties.cl;
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }, [facilities]);

  const africa = data?.meta?.africa;
  const leaders = useMemo(() => {
    if (!data) return [];
    return [...data.meta.countries]
      .sort((a, b) => (b[`${metric}_tot`] || 0) - (a[`${metric}_tot`] || 0))
      .slice(0, 8);
  }, [data, metric]);

  const countryOptions = useMemo(() => {
    if (!data) return [];
    return [...data.meta.countries].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const focus = useMemo<LivestockCountryFeature | null>(() => {
    if (!selectedG0 || !countries) return null;
    return countries.features.find((f) => f.properties.G0 === selectedG0) || null;
  }, [selectedG0, countries]);

  if (loading) return <PageLoader />;

  const activeMetric = METRICS.find((m) => m.key === metric) || METRICS[0];

  const totalCol = activeMetric.kind === "density"
    ? `Total ${metric === "population" ? "people" : "heads"}`
    : activeMetric.kind === "rate" ? `${activeMetric.noun} mean` : `Total ${activeMetric.noun}`;

  const footprint = (v: number, kind: string, unit: string) =>
    kind === "rate" ? `${fmtD(v)} ${unit}` : `${fmtD(v)}${kind === "count" ? "" : "/km²"}`;

  return (
    <div style={{ minHeight: "100vh", background: atlas.bg }}>
      <div className="max-w-7xl mx-auto px-6 py-8" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <PageHeader
          title="Health Access"
          subtitle={
            <>
              Every layer is summarised by GADM district: livestock and human population density, mammal richness,
              malaria incidence, and per-district counts of mapped health facilities, tick occurrences and pathogen records.
            </>
          }
        />

        <StatCards
          className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
          items={[
            {
              label: "Health facilities",
              value: facCount ?? 0,
              hint: `mapped · ${facCountries} countries`,
              active: false,
              onClick: () => setMetric("facility"),
            },
            ...METRICS.map((m) => ({
              label: `${m.label}${m.kind === "density" ? " density" : ""}`,
              value: africa ? fmtD(africa[m.key] ?? 0) : "—",
              hint: `Africa${m.kind === "density" ? ` mean · ${m.unit}` : ` · ${m.unit}`}`,
              active: m.key === metric,
              onClick: () => setMetric(m.key),
            })),
            {
              label: "Districts",
              value: data?.meta?.regions ?? 0,
              hint: "GADM ADM2 · zonal means & counts",
              active: false,
            },
          ]}
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {FAC_CLASSES.map((c) => (
            <div
              key={c.key}
              className="rounded-lg bg-white px-4 py-3"
              style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                <span className="text-[12px] font-medium truncate" style={{ color: atlas.text }}>{c.key}</span>
              </div>
              <div className="mt-1.5 text-[18px] font-bold leading-none tabular-nums" style={{ color: c.color, fontFamily: "monospace" }}>
                {(classCounts[c.key] ?? 0).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-white overflow-hidden" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${atlas.border}` }}>
            <div>
              <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>
                Health layers by district
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: atlas.textMuted }}>
                Livestock, mammal and population layers use ~8 km / 5 km gridded estimates averaged per GADM district;
                malaria uses admin-1 incidence joined to districts; facilities, tick occurrences and pathogen records are
                counted per district.
              </p>
            </div>
            {africa && (
              <Chip tone="amber">
                {activeMetric.label} · Africa {fmtD(africa[metric] ?? 0)} {activeMetric.unit}
              </Chip>
            )}
          </div>
          <FilterBar>
            <div className="flex items-center gap-2 flex-wrap">
              {METRICS.map((m) => {
                const active = m.key === metric;
                return (
                  <button
                    key={m.key}
                    onClick={() => setMetric(m.key)}
                    className="text-[12px] font-medium rounded-full px-3.5 py-1.5 transition-colors"
                    style={{
                      background: active ? atlas.teal : "#FFFFFF",
                      color: active ? "#FFFFFF" : atlas.textSub,
                      border: `1px solid ${active ? atlas.teal : atlas.borderStrong}`,
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: m.color }} />
                      {m.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-2 text-[12px] font-medium" style={{ color: atlas.textSub }}>
              Country
              <select
                value={selectedG0}
                onChange={(e) => setSelectedG0(e.target.value)}
                className="rounded-full px-3 py-1.5 bg-white text-[12px] font-medium cursor-pointer outline-none"
                style={{ color: atlas.text, border: `1px solid ${atlas.borderStrong}` }}
              >
                <option value="">All countries</option>
                {countryOptions.map((c) => (
                  <option key={c.gid} value={c.gid}>{c.name}</option>
                ))}
              </select>
            </label>
            <span className="text-[11px]" style={{ color: atlas.textMuted }}>
              Hover a district for its values; pick a country to zoom
            </span>
          </FilterBar>
          {focus && (
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 text-[12px]"
              style={{ borderBottom: `1px solid ${atlas.grid}`, background: "#F1F7F6", color: atlas.text }}
            >
              <span className="font-semibold">{focus.properties.CN}</span>
              <span className="tabular-nums" style={{ fontFamily: "monospace" }}>
                {focus.properties[`${metric}_tot`] != null
                  ? `${fmtH(focus.properties[`${metric}_tot`])} ${activeMetric.noun} total`
                  : "no data"}
              </span>
              <span className="tabular-nums" style={{ fontFamily: "monospace" }}>
                {focus.properties[metric] != null ? `${footprint(focus.properties[metric], activeMetric.kind, activeMetric.unit)}${activeMetric.kind === "count" ? "" : " mean"}` : "—"}
              </span>
              <span style={{ color: atlas.textMuted }}>{focus.properties.districts} districts</span>
            </div>
          )}
          <HealthMap data={data} countries={countries} metric={metric} focus={focus} />
          {data && (
            <div className="text-[10px] px-5 py-2" style={{ color: atlas.textMuted, borderTop: `1px solid ${atlas.grid}` }}>
              {data.meta.regions.toLocaleString()} districts · {data.meta.countries.length} countries · {data.meta.resolution} · {data.meta.years}
              {data.meta.population_year ? ` · Population ${data.meta.population_year}` : ""}
              {data.meta.mammal_year ? ` · Mammals ${data.meta.mammal_year}` : ""}
              {data.meta.malaria_year ? ` · Malaria ${data.meta.malaria_year}` : ""}
            </div>
          )}
        </div>

        <Panel title={`Highest ${activeMetric.label} countries`} className="mt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b" style={{ borderColor: atlas.border }}>
                  <th className="text-left px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>#</th>
                  <th className="text-left px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>Country</th>
                  <th className="text-right px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>{totalCol}</th>
                  <th className="text-right px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>
                    {activeMetric.kind === "count" ? "Mean per district" : "Mean value"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((c, i) => (
                  <tr key={c.gid} className="border-b" style={{ borderColor: atlas.grid }}>
                    <td className="px-3 py-1.5 tabular-nums" style={{ color: atlas.textMuted }}>{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium" style={{ color: atlas.text }}>{c.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: atlas.text, fontFamily: "monospace" }}>
                      {fmtH((c[`${metric}_tot`] || 0) as number)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: atlas.textSub, fontFamily: "monospace" }}>
                      {footprint((c[metric] || 0) as number, activeMetric.kind, activeMetric.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="About this map" className="mt-6">
          <div className="text-[12px] leading-relaxed" style={{ color: atlas.textSub }}>
            Every health layer is rendered as a GADM level-2 district choropleth (no point clustering). Livestock counts come
            from the 2015 Gridded Livestock of the World layers — cattle, goat and sheep heads per ~8 km cell — averaged and
            summed per district. The population layer shades the same districts by people per km² using UNFPA/Common
            Operational Dataset admin-2 estimates keyed by ADM2_PCODE, rolled up to country totals where district joins are
            unreliable; reference years vary by country. The mammal layer shows the mean wild-mammal species richness per
            district from the IUCN/SERVIR Area of Habitat 2021 5 km mosaic, standing in for wild tick-host availability. The
            malaria layer shows the Malaria Atlas Project admin-1 incidence rate (cases per thousand, 2024) attached to each
            district under a matching admin-1 unit. Mapped health facilities (2015 sub-Saharan census, 96,395 with
            coordinates), GBIF tick occurrences and tick-borne disease / pathogen records are each counted per district. The
            country picker above zooms to and highlights the selected nation.
          </div>
        </Panel>

        <SourceNote>
          Livestock: FAO Gridded Livestock of the World (cattle, goat, sheep), 2015 release, zonal statistics per GADM
          district. Population: UNFPA/COD admin-2 population estimates (cod_population_admin2.csv), keyed by ADM2_PCODE,
          reference years vary by country. Mammals: IUCN/SERVIR Area of Habitat mammal species richness 2021, 5 km
          World-Mollweide mosaic, zonal means. Malaria: Malaria Atlas Project admin-1 incidence rate 2024 (cases per
          thousand), joined by admin-1 name. Facilities: sub-Saharan health-facility census 2015. Tick occurrences: GBIF.
          Pathogens: atlas disease/pathogen records. Density units are heads or people per km²; counts are per district.
          Values are modelled or reported estimates.
        </SourceNote>
      </div>
    </div>
  );
}