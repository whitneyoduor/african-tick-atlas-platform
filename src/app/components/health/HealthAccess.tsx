import { useEffect, useMemo, useState } from "react";
import { atlas, PageHeader, StatCards, Panel, FilterBar, FilterGroup, Select, Chip, SourceNote, PageLoader } from "../common/Atlas";
import {
  fetchLivestock,
  fetchCountries,
  fetchFacilities,
  HealthMap,
  METRICS,
  METRIC_GROUPS,
  FAC_CLASSES,
  type MetricKey,
  type LivestockData,
  type LivestockCountries,
  type LivestockCountryFeature,
} from "./HealthMap";

function fmtNum(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toLocaleString();
}

function fmtVal(m: (typeof METRICS)[number], v: number | undefined, tot: number | undefined): string {
  if (v == null) return "No data";
  if (m.kind === "count") return fmtNum(tot || 0);
  if (m.kind === "rate") return `${fmtNum(tot || 0)} · ${v >= 1 ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : v.toFixed(2)} mean`;
  return `${fmtNum(tot || 0)} · ${v >= 1 ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : v.toFixed(2)} ${m.unit}`;
}

export function HealthAccess() {
  const [data, setData] = useState<LivestockData | null>(null);
  const [countries, setCountries] = useState<LivestockCountries | null>(null);
  const [facilities, setFacilities] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<MetricKey>("population");
  const [selectedG0, setSelectedG0] = useState<string>("");
  const [facilityType, setFacilityType] = useState<string | null>(null);

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

  const facCount = facilityType ? facilities?.features.filter((f: any) => f.properties.cl === facilityType).length ?? null : facilities?.features?.length ?? null;
  const facCountries = useMemo(() => {
    if (!facilities) return 0;
    return new Set(facilities.features.map((f: any) => f.properties.co)).size;
  }, [facilities]);

  const facilityTypes = useMemo(() => {
    if (!facilities) return [];
    const types: Record<string, number> = {};
    for (const f of facilities.features) {
      const k = f.properties.cl;
      if (k) types[k] = (types[k] || 0) + 1;
    }
    return Object.entries(types).sort((a, b) => b[1] - a[1]);
  }, [facilities]);

  const classCounts = useMemo(() => {
    const c: Record<string, number> = {};
    if (!facilities) return c;
    for (const f of facilities.features) {
      const k = f.properties.cl;
      if (!facilityType || k === facilityType) {
        c[k] = (c[k] || 0) + 1;
      }
    }
    return c;
  }, [facilities, facilityType]);

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
  const activeAfrica = africa ? africa[metric] : undefined;

  const totalCol = activeMetric.kind === "density"
    ? `Total ${metric === "population" ? "people" : "heads"}`
    : activeMetric.kind === "rate" ? "Africa value" : `Total ${activeMetric.noun}`;

  return (
    <div style={{ minHeight: "100vh", background: atlas.bg }}>
      <div className="max-w-7xl mx-auto px-6 py-8" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <PageHeader
          title="Health Risk & Access"
          subtitle={
            <>
              Every layer is summarised at GADM district level — livestock and human population density, mammal richness,
              malaria incidence, and counts of health facilities, tick occurrences and pathogen records.{" "}
              <span style={{ fontWeight: 600, color: atlas.text }}>Districts without data are shown grey, never as zero.</span>
            </>
          }
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {METRIC_GROUPS.map((g, gi) => {
            const ms = METRICS.filter((m) => m.group === g);
            return (
              <div key={g} className="rounded-lg bg-white px-4 py-3 col-span-2 sm:col-span-1"
                style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: atlas.textMuted }}>{g}</div>
                <div className="space-y-1.5">
                  {ms.map((m) => (
                    <div key={m.key} className="flex items-center gap-2 text-[12px]">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
                      <span className="truncate flex-1" style={{ color: atlas.text }}>{m.label}</span>
                      <span className="shrink-0 tabular-nums" style={{ color: atlas.textSub, fontFamily: "monospace" }}>
                        {africa && africa[m.key] != null ? fmtNum(africa[m.key] as number) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <StatCards
          className="grid-cols-2 lg:grid-cols-5"
          items={[
            {
              label: "Districts",
              value: data?.meta?.regions ?? 0,
              hint: "GADM ADM2 layers",
              active: false,
            },
            {
              label: "Countries",
              value: data?.meta?.countries.length ?? 0,
              hint: "Atlas coverage",
              active: false,
            },
            {
              label: "Health facilities",
              value: facCount ?? 0,
              hint: `mapped · ${facCountries} countries`,
              active: metric === "facility",
              onClick: () => setMetric("facility"),
            },
            {
              label: "Tick records mapped",
              value: africa?.tick ?? 0,
              hint: "occurrences in districts",
              active: metric === "tick",
              onClick: () => setMetric("tick"),
            },
            {
              label: "Pathogen records",
              value: africa?.pathogen ?? 0,
              hint: "in districts",
              active: metric === "pathogen",
              onClick: () => setMetric("pathogen"),
            },
          ]}
        />

        <div className="rounded-lg bg-white overflow-hidden mb-6" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${atlas.border}` }}>
            <div>
              <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>
                {activeMetric.label} by district
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: atlas.textMuted }}>
                {activeMetric.blurb} — GADM level-2 choropleth.
              </p>
            </div>
            {activeAfrica != null && (
              <Chip tone="amber">
                Africa · {fmtNum(activeAfrica as number)} {activeMetric.unit}
              </Chip>
            )}
          </div>
          <FilterBar>
            <FilterGroup label="Layer">
              <Select value={metric} onChange={(v) => setMetric(v as MetricKey)} minWidth={230}>
                {METRIC_GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {METRICS.filter((m) => m.group === g).map((m) => (
                      <option key={m.key} value={m.key}>{m.label}</option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </FilterGroup>
            <FilterGroup label="Country">
              <Select value={selectedG0} onChange={setSelectedG0} minWidth={180}>
                <option value="">All countries</option>
                {countryOptions.map((c) => (
                  <option key={c.gid} value={c.gid}>{c.name}</option>
                ))}
              </Select>
            </FilterGroup>
            <FilterGroup label="Facility type">
              <Select value={facilityType ?? ""} onChange={(v) => setFacilityType(v as string | null)} minWidth={150}>
                <option value="">All types</option>
                {facilityTypes.map(([type, count]) => (
                  <option key={type} value={type}>{type} ({count})</option>
                ))}
              </Select>
            </FilterGroup>
            <span className="text-[11px]" style={{ color: atlas.textMuted }}>
              Hover a district for all layer values; pick a country to zoom.
            </span>
          </FilterBar>
          {focus && (
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 text-[12px]"
              style={{ borderBottom: `1px solid ${atlas.grid}`, background: "#F1F7F6", color: atlas.text }}
            >
              <span className="font-semibold">{focus.properties.CN}</span>
              <span className="tabular-nums" style={{ fontFamily: "monospace" }}>
                {fmtVal(activeMetric, focus.properties[metric], focus.properties[`${metric}_tot`])}
              </span>
              <span style={{ color: atlas.textMuted }}>{focus.properties.districts} districts</span>
            </div>
          )}
          <HealthMap data={data} countries={countries} metric={metric} focus={focus} />
          {data && (
            <div className="text-[10px] px-5 py-2 flex flex-wrap gap-x-4 gap-y-1" style={{ color: atlas.textMuted, borderTop: `1px solid ${atlas.grid}` }}>
              <span>{data.meta.regions.toLocaleString()} districts · {data.meta.countries.length} countries · {data.meta.resolution}</span>
              {data.meta.population_year ? <span>Population {data.meta.population_year}</span> : null}
              {data.meta.mammal_year ? <span>Mammals {data.meta.mammal_year}</span> : null}
              {data.meta.malaria_year ? <span>Malaria {data.meta.malaria_year}</span> : null}
              <span>{data.meta.years}</span>
            </div>
          )}
        </div>

        <Panel title={`Highest ${activeMetric.label} countries`} className="mt-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b" style={{ borderColor: atlas.border }}>
                  <th className="text-left px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>#</th>
                  <th className="text-left px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>Country</th>
                  <th className="text-right px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>{totalCol}</th>
                  <th className="text-right px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>
                    {activeMetric.kind === "count" ? "Per district" : "Mean value"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((c, i) => (
                  <tr key={c.gid} className="border-b" style={{ borderColor: atlas.grid }}>
                    <td className="px-3 py-1.5 tabular-nums" style={{ color: atlas.textMuted }}>{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium" style={{ color: atlas.text }}>{c.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: atlas.text, fontFamily: "monospace" }}>
                      {fmtNum((c[`${metric}_tot`] || 0) as number)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: atlas.textSub, fontFamily: "monospace" }}>
                      {c[metric] != null ? fmtNum(c[metric] as number) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
          {FAC_CLASSES.map((c) => (
            <div key={c.key} className="rounded-lg bg-white px-4 py-3"
              style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
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

        <Panel title="About this map" className="mt-6">
          <div className="text-[12px] leading-relaxed" style={{ color: atlas.textSub }}>
            Each health layer is a GADM level-2 district choropleth. Livestock counts come from the 2015 Gridded Livestock of
            the World layers (heads per ~8 km cell), averaged and summed per district. Human population uses UNFPA/Common
            Operational Dataset admin-2 estimates keyed by ADM2_PCODE, rolled up to country totals where district joins are
            unreliable; reference years vary by country. Mammal richness is the mean wild-mammal species per district from the
            IUCN/SERVIR Area of Habitat 2021 5 km mosaic, standing in for wild tick-host availability. Malaria incidence is
            the Malaria Atlas Project admin-1 rate (cases per thousand, 2024) attached to every district under a matching
            admin-1 unit. Mapped health facilities (2015 sub-Saharan census), GBIF tick occurrences and tick-borne disease /
            pathogen records are counted per district. Only districts with data are coloured; missing districts are shown in
            grey so gaps are never mistaken for zeros.
          </div>
        </Panel>

        <SourceNote>
          Livestock: FAO Gridded Livestock of the World (cattle, goat, sheep), 2015, zonal statistics per GADM district.
          Population: UNFPA/COD admin-2 estimates (cod_population_admin2.csv), keyed by ADM2_PCODE; reference years vary by
          country. Mammals: IUCN/SERVIR Area of Habitat mammal species richness 2021, 5 km World-Mollweide mosaic.
          Malaria: Malaria Atlas Project admin-1 incidence rate 2024 (cases per thousand), joined by admin-1 name.
          Facilities: sub-Saharan health-facility census 2015. Tick occurrences: GBIF. Pathogens: atlas disease/pathogen
          records. Density in heads or people per km²; rates and counts as reported per district.
        </SourceNote>
      </div>
    </div>
  );
}