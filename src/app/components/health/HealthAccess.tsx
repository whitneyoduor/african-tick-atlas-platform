import { useCallback, useEffect, useMemo, useState } from "react";
import { atlas, PageHeader, StatCards, Panel, FilterBar, FilterGroup, MenuSelect, Chip, SourceNote, PageLoader, FigureExportButton } from "../common/Atlas";
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

const NO_DATA = "#E4E8ED";

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

function fmtDV(m: (typeof METRICS)[number], v: number): string {
  if (m.kind === "count") return fmtNum(v);
  if (m.kind === "rate") return `${v >= 1 ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : v.toFixed(2)} ${m.unit} mean`;
  return `${v >= 1 ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : v.toFixed(2)} ${m.unit}`;
}

/** Property key for a facility class facet, e.g. "Health centre" -> facility_Health_centre */
function facKey(t: string): string {
  return "facility_" + t.replace(/[ /\-]/g, "_");
}

/** Decorate a slug into a display species name (rhipicephalus_annulatus -> Rhipicephalus annulatus). */
function speciesName(slug: string): string {
  return slug.split("_").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
}

function useCoverage(data: LivestockData | null, countries: LivestockCountries | null) {
  return useMemo(() => {
    if (!data || !countries) return null;
    const keys = METRICS.map((m) => m.key);
    const nameByG0: Record<string, string> = {};
    for (const f of countries.features) nameByG0[f.properties.G0] = f.properties.CN || f.properties.G0;
    const byCountry: Record<string, { total: number; present: Record<string, number> }> = {};
    for (const f of data.features) {
      const g0 = f.properties.G0;
      const b = (byCountry[g0] ||= { total: 0, present: {} });
      b.total++;
      for (const k of keys) if (f.properties[k] != null) b.present[k] = (b.present[k] || 0) + 1;
    }
    const allCovered = data.features.filter((f) => keys.every((k) => f.properties[k] != null)).length;
    return {
      total: data.features.length,
      keys,
      perMetric: Object.fromEntries(keys.map((k) => [k, data.features.filter((f) => f.properties[k] != null).length])) as Record<string, number>,
      byCountry,
      nameByG0,
      allCovered,
    };
  }, [data, countries]);
}

export function HealthAccess() {
  const [data, setData] = useState<LivestockData | null>(null);
  const [countries, setCountries] = useState<LivestockCountries | null>(null);
  const [facilities, setFacilities] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<MetricKey>("population");
  const [selectedG0, setSelectedG0] = useState<string>("");
  const [facilityType, setFacilityType] = useState<string | null>(null);
  const [tickSpecies, setTickSpecies] = useState<string | null>(null);
  const [hovered, setHovered] = useState<any | null>(null);
  const [pinned, setPinned] = useState<any | null>(null);
  const [captureMap, setCaptureMap] = useState<() => HTMLCanvasElement>(() => () => undefined as unknown as HTMLCanvasElement);

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

  const classDot = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of FAC_CLASSES) m[c.key] = c.color;
    return m;
  }, []);

  const africa = data?.meta?.africa;
  const coverage = useCoverage(data, countries);

  const leaders = useMemo(() => {
    if (!data) return [];
    return [...data.meta.countries]
      .sort((a, b) => (b[`${metric}_tot`] || 0) - (a[`${metric}_tot`] || 0))
      .slice(0, 8);
  }, [data, metric]);

  const countryNameByG0 = useMemo(() => {
    const m: Record<string, string> = {};
    if (countries) for (const f of countries.features) m[f.properties.G0] = f.properties.CN || f.properties.G0;
    return m;
  }, [countries]);

  const focus = useMemo<LivestockCountryFeature | null>(() => {
    if (!selectedG0 || !countries) return null;
    return countries.features.find((f) => f.properties.G0 === selectedG0) || null;
  }, [selectedG0, countries]);

  const onHover = useCallback((f: any | null) => { setHovered(f); }, []);
  const onSelect = useCallback((f: any | null) => { setPinned((p) => (p === f ? null : f)); }, []);

  const speciesOptions = useMemo(() => {
    const list = data?.meta?.tick_species;
    if (!Array.isArray(list)) return [];
    return list.map((s) => ({ value: s.slug, label: s.name, sub: `${s.count} records` }));
  }, [data]);

  const facet = useMemo(() => {
    if (facilityType && metric === "facility") {
      return { metric: "facility" as MetricKey, propKey: facKey(facilityType), label: `${facilityType} facilities` };
    }
    if (tickSpecies && metric === "tick") {
      const found = speciesOptions.find((s) => s.value === tickSpecies);
      return { metric: "tick" as MetricKey, propKey: "tick_" + tickSpecies, label: found ? found.label : speciesName(tickSpecies) };
    }
    return null;
  }, [facilityType, tickSpecies, metric, speciesOptions]);

  const zeroCountries = useMemo(() => {
    if (!coverage) return [];
    return Object.entries(coverage.byCountry)
      .filter(([, b]) => !b.present[metric] && b.total > 0)
      .map(([g0, b]) => ({ name: coverage.nameByG0[g0] || g0, g0, n: b.total }))
      .sort((a, b) => b.n - a.n);
  }, [coverage, metric]);

  if (loading) return <PageLoader />;
  if (!data || !countries) {
    return (
      <div style={{ minHeight: "60vh", background: atlas.bg }}>
        <div className="max-w-7xl mx-auto px-6 py-8">
          <Panel title="Data unavailable">
            <span className="text-[12px]" style={{ color: atlas.textSub }}>
              The health layers could not be loaded. Data may still be publishing — please reload in a moment.
            </span>
          </Panel>
        </div>
      </div>
    );
  }

  const activeMetric = METRICS.find((m) => m.key === metric) || METRICS[0];
  const activeAfrica = africa ? africa[metric] : undefined;
  const inspect = pinned ?? hovered;

  const totalCol = activeMetric.kind === "density"
    ? `Total ${metric === "population" ? "people" : "heads"}`
    : activeMetric.kind === "rate" ? "Africa value" : `Total ${activeMetric.noun}`;

  // coverage panel
  const metricPct = coverage && data ? Math.round((coverage.perMetric[metric] / data.features.length) * 100) : null;

  const facTypeOptions = [
    ...facilityTypes.map(([type]) => ({ value: type, label: type, dot: classDot[type] || "#9CA3AF", sub: "" })),
  ];

  return (
    <div style={{ minHeight: "100vh", background: atlas.bg }}>
      <div className="max-w-7xl mx-auto px-6 py-8" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <PageHeader
          title="Climsynoptick"
          right={
            data ? (
              <Chip tone="teal">
                {data.meta.countries.length} countries · {data.meta.regions.toLocaleString()} admin units
              </Chip>
            ) : undefined
          }
          subtitle={
            <>
              A synoptic dashboard that layers climate- and host-driven livestock exposure against tick, pathogen and
              health-system risk across Africa, at GADM district (admin-unit) resolution.{" "}
              <span style={{ fontWeight: 600, color: atlas.text }}>
                Hover any district for its full profile; districts without data are shown grey, never as zero.
              </span>
            </>
          }
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {METRICS.map((m) => {
            const on = metric === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className="rounded-lg bg-white px-4 py-3 flex items-center gap-2 text-[12px] cursor-pointer text-left"
                style={{ border: `1px solid ${on ? m.color : atlas.border}`, boxShadow: atlas.shadow, background: on ? "#F1F7F6" : "#fff" }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
                <span className="truncate flex-1" style={{ fontWeight: on ? 600 : 400, color: atlas.text }}>{m.label}</span>
                <span className="shrink-0 tabular-nums" style={{ color: on ? atlas.teal : atlas.textSub, fontFamily: "monospace" }}>
                  {africa && africa[m.key] != null ? fmtNum(africa[m.key] as number) : "—"}
                </span>
              </button>
            );
          })}
        </div>

        <StatCards
          className="grid-cols-2 lg:grid-cols-6"
          items={[
            {
              label: "Admin units",
              value: data?.meta?.regions ?? 0,
              hint: "GADM districts (Libya ADM1)",
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
              value: facilityType
                ? (facilities?.features.filter((f: any) => f.properties.cl === facilityType).length ?? 0)
                : (africa?.facility ?? facCount ?? 0),
              hint: `mapped in districts · ${facCountries} countries in source`,
              active: metric === "facility",
              onClick: () => { setMetric("facility"); },
            },
            {
              label: "Tick records",
              value: africa?.tick ?? 0,
              hint: "occurrences in districts",
              active: metric === "tick",
              onClick: () => setMetric("tick"),
            },
            {
              label: "Pathogen records",
              value: africa?.pathogen ?? 0,
              hint: "disease / pathogen points",
              active: metric === "pathogen",
              onClick: () => setMetric("pathogen"),
            },
          ]}
        />

        <div className="grid lg:grid-cols-[minmax(0,1fr)_330px] gap-4 mb-6 items-start">
          <div className="rounded-lg bg-white overflow-hidden" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
            <div className="flex items-center justify-between px-5 py-3 gap-3" style={{ borderBottom: `1px solid ${atlas.border}` }}>
              <div className="min-w-0">
                <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>
                  {facet ? facet.label : activeMetric.label} by admin unit
                </h3>
                <p className="text-[11px] mt-0.5" style={{ color: atlas.textMuted }}>
                  {facet
                    ? `Coloured by this ${facet.metric === "facility" ? "facility class" : "tick species"} only, per admin unit.`
                    : `${activeMetric.blurb} — GADM-level choropleth.`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {activeAfrica != null && (
                  <Chip tone="amber">
                    Africa · {fmtNum(activeAfrica as number)} {activeMetric.unit}
                  </Chip>
                )}
                <FigureExportButton captureFn={captureMap} filename="climsynoptick-map.png" />
              </div>
            </div>
            <FilterBar>
              <FilterGroup label="Layer">
                <MenuSelect
                  value={metric}
                  onChange={(v) => setMetric(v as MetricKey)}
                  minWidth={230}
                  options={METRICS
                    .filter((m) => m.key !== "pathogen")
                    .map((m) => ({ value: m.key, label: m.label, dot: m.color, sub: "" }))}
                />
              </FilterGroup>
              <FilterGroup label="Tick species">
                <MenuSelect
                  value={tickSpecies ?? ""}
                  onChange={(v) => {
                    const s = (v as string) || null;
                    setTickSpecies(s);
                    if (s) setMetric("tick");
                  }}
                  searchable
                  includeClear
                  placeholder="All species"
                  minWidth={230}
                  options={speciesOptions}
                />
              </FilterGroup>
              <FilterGroup label="Country">
                <MenuSelect
                  value={selectedG0}
                  onChange={setSelectedG0}
                  searchable
                  includeClear
                  minWidth={190}
                  options={[...data.meta.countries]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((c) => ({ value: c.gid, label: c.name, sub: `(${c[`${metric}_tot`] != null ? fmtNum(c[`${metric}_tot`]) : "–"})` }))}
                />
              </FilterGroup>
              <FilterGroup label="Facility type">
                <MenuSelect
                  value={facilityType ?? ""}
                  onChange={(v) => {
                    const t = (v as string) || null;
                    setFacilityType(t);
                    if (t) setMetric("facility");
                  }}
                  includeClear
                  placeholder="All facility types"
                  minWidth={160}
                  options={facTypeOptions}
                />
              </FilterGroup>
              <span className="text-[11px]" style={{ color: atlas.textMuted }}>
                Hover for the full district profile · click to pin.
              </span>
            </FilterBar>
            {focus && (
              <div
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 text-[12px]"
                style={{ borderBottom: `1px solid ${atlas.grid}`, background: "#F1F7F6", color: atlas.text }}
              >
                <span className="font-semibold">{focus.properties.CN}</span>
                <span className="tabular-nums" style={{ fontFamily: "monospace" }}>
                  {fmtVal(activeMetric, focus.properties[facet?.propKey ?? metric], focus.properties[`${facet?.propKey ?? metric}_tot`])}
                </span>
                <span style={{ color: atlas.textMuted }}>{focus.properties.districts} admin units</span>
                <button
                  onClick={() => setSelectedG0("")}
                  className="ml-auto text-[11px] font-medium cursor-pointer underline"
                  style={{ color: atlas.teal }}
                >
                  Reset focus
                </button>
              </div>
            )}
            <HealthMap
              data={data}
              countries={countries}
              metric={metric}
              focus={focus}
              facet={facet}
              onHover={onHover}
              onSelect={onSelect}
              registerCapture={setCaptureMap}
            />
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

          <div className="rounded-lg bg-white overflow-hidden" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${atlas.border}` }}>
              <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>District profile</h3>
              {inspect && (
                <button
                  onClick={() => { setPinned(null); setHovered(null); }}
                  className="text-[11px] font-medium cursor-pointer uppercase tracking-wide"
                  style={{ color: atlas.textMuted }}
                >
                  {pinned ? "Unpin" : "Clear"}
                </button>
              )}
            </div>
            {inspect ? (
              <DistrictProfile
                feature={inspect}
                activeMetric={activeMetric}
                facilityType={facilityType}
                country={countryNameByG0[inspect.properties.G0]}
                onFocusCountry={setSelectedG0}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-center px-6 py-14" style={{ color: atlas.textMuted }}>
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 10 }}>
                  <path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4h-6v4a1 1 0 01-1 1H4a1 1 0 01-1-1v-9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
                <div className="text-[12px] font-medium" style={{ color: atlas.text }}>
                  Hover any district on the map
                </div>
                <div className="text-[11px] mt-1">Its full layer profile appears here and stays after you leave. Click a district to pin it.</div>
              </div>
            )}
          </div>
        </div>

        <Panel title="Data coverage audit">
          <div className="text-[12px] leading-relaxed" style={{ color: atlas.textSub }}>
            {data && coverage ? (
              <>
                <span style={{ color: atlas.text }}>{coverage.total.toLocaleString()}</span> admin units across{" "}
                <span style={{ color: atlas.text }}>{data.meta.countries.length} countries</span>. Only{" "}
                <span style={{ color: atlas.text }}>{coverage.allCovered.toLocaleString()}</span> carry data for
                every layer — every other unit is shown grey on the layer where its source data is absent, so gaps are visible, never read as zero.
              </>
            ) : null}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mt-3">
            {data && metricPct != null && METRICS.map((m) => {
              const pct = coverage ? Math.round((coverage.perMetric[m.key] / data.features.length) * 100) : 0;
              return (
                <div
                  key={m.key}
                  className="rounded-md px-3 py-2 cursor-pointer transition-shadow hover:shadow-md"
                  style={{ border: `1px solid ${metric === m.key ? "#8FBDB7" : atlas.border}`, background: metric === m.key ? "#F6FBF9" : "#FBFCFD" }}
                  onClick={() => setMetric(m.key)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium truncate" style={{ color: atlas.text }}>{m.label}</span>
                    <span className="text-[11px] tabular-nums font-semibold" style={{ color: metric === m.key ? atlas.teal : atlas.textSub, fontFamily: "monospace" }}>{pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: atlas.grid }}>
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: m.color }} />
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: atlas.textMuted }}>
                    {coverage?.perMetric[m.key].toLocaleString()}/{data.features.length.toLocaleString()} units
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2.5 mt-4">
            {data && coverage && (zeroCountries.length === 0 ? (
              <span className="text-[11px]" style={{ color: atlas.textMuted }}>
                Every country has this layer.
              </span>
            ) : (
              <>
                <span className="text-[11px] py-1" style={{ color: atlas.textMuted }}>
                  No data for <strong style={{ color: atlas.text }}>{activeMetric.label}</strong> in:
                </span>
                {zeroCountries.length <= 6 ? zeroCountries.map((c) => (
                  <button
                    key={c.g0}
                    onClick={() => setSelectedG0(c.g0)}
                    className="text-[11px] font-medium rounded-full px-3 py-1 cursor-pointer"
                    style={{ background: "#FEF3E2", color: "#B45309", border: "1px solid #F5D9AC" }}
                  >
                    {c.name} · {c.n} units
                  </button>
                )) : (
                  <span className="inline-flex flex-wrap gap-2">
                    {zeroCountries.slice(0, 6).map((c) => (
                      <button
                        key={c.g0}
                        onClick={() => setSelectedG0(c.g0)}
                        className="text-[11px] font-medium rounded-full px-3 py-1 cursor-pointer"
                        style={{ background: "#FEF3E2", color: "#B45309", border: "1px solid #F5D9AC" }}
                      >
                        {c.name} · {c.n} units
                      </button>
                    ))}
                    <span className="text-[11px] py-1" style={{ color: atlas.textMuted }}>+{zeroCountries.length - 6} more</span>
                  </span>
                )}
              </>
            ))}
          </div>
          <div className="mt-4 text-[11px] leading-relaxed" style={{ color: atlas.textMuted, borderTop: `1px solid ${atlas.grid}`, paddingTop: 12 }}>
            <strong style={{ color: atlas.textSub }}>Known data gaps, checked:</strong>{" "}
            Libya renders at ADM1 (22 shabiyas) because GADM has no ADM2 layer for it; it has tick and pathogen records but no
            population, malaria or facility source data. The malaria admin-1 join leaves Madagascar, Malawi and Uganda with no
            rate (district-level rates are not reported for those admin models); minor joins still miss parts of Burundi, Benin,
            Algeria, Ethiopia, Mali, Mozambique and Sudan. Population and facility layers cover only the countries in their
            source censuses — North African countries therefore show grey there by design.
          </div>
        </Panel>

        <Panel
          title={`Highest ${activeMetric.label} countries`}
          action={<span className="text-[11px]" style={{ color: atlas.textMuted }}>click a row to focus the map</span>}
          className="mt-6"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b" style={{ borderColor: atlas.border }}>
                  <th className="text-left px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>#</th>
                  <th className="text-left px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>Country</th>
                  <th className="text-right px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>{totalCol}</th>
                  <th className="text-right px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>
                    {activeMetric.kind === "count" ? "Per admin unit" : "Mean value"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((c, i) => (
                  <tr
                    key={c.gid}
                    className="border-b cursor-pointer"
                    style={{ borderColor: atlas.grid, background: selectedG0 === c.gid ? "#F1F7F6" : "transparent" }}
                    onClick={() => setSelectedG0(selectedG0 === c.gid ? "" : c.gid)}
                  >
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
          {FAC_CLASSES.map((c) => {
            const on = facilityType === c.key;
            return (
              <button
                key={c.key}
                onClick={() => { setMetric("facility"); setFacilityType(on ? null : c.key); }}
                className="rounded-lg bg-white px-4 py-3 text-left cursor-pointer transition-shadow hover:shadow-md"
                style={{ border: `1px solid ${on ? "#8FBDB7" : atlas.border}`, boxShadow: on ? `0 0 0 1px ${atlas.teal} inset` : atlas.shadow, background: on ? "#F6FBF9" : "#FFFFFF" }}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                  <span className="text-[12px] font-medium truncate" style={{ color: atlas.text }}>{c.key}</span>
                </div>
                <div className="mt-1.5 text-[18px] font-bold leading-none tabular-nums" style={{ color: c.color, fontFamily: "monospace" }}>
                  {(classCounts[c.key] ?? 0).toLocaleString()}
                </div>
                <div className="text-[10px] mt-1" style={{ color: on ? atlas.teal : atlas.textMuted }}>{on ? "shown on map" : "click to map"}</div>
              </button>
            );
          })}
        </div>

        <Panel title="About this map" className="mt-6">
          <div className="text-[12px] leading-relaxed" style={{ color: atlas.textSub }}>
            Each layer is a GADM admin-unit choropleth of the whole African continent. Livestock counts come from the 2015
            Gridded Livestock of the World layers (heads per ~8 km cell), averaged and summed per unit. Human population uses
            UNFPA/Common Operational Dataset admin-2 estimates keyed by ADM2_PCODE, rolled up to country totals where district
            joins are unreliable; reference years vary by country. Mammal richness is the mean wild-mammal species per unit from
            the IUCN/SERVIR Area of Habitat 2021 5 km mosaic, standing in for wild tick-host availability. Malaria incidence is
            the Malaria Atlas Project admin-1 rate (cases per thousand, 2024) attached to every unit under a matching admin-1
            unit. Mapped health facilities (2015 sub-Saharan census), GBIF tick occurrences and tick-borne disease / pathogen
            records are counted per unit — the facility layer can be split into its five classes. Units without data for a
            layer are grey, so gaps are never mistaken for zeros. Numeric breakdown of all nine layers for every hovered unit
            is available in the district profile panel.
          </div>
        </Panel>

        <SourceNote>
          Livestock: FAO Gridded Livestock of the World (cattle, goat, sheep), 2015, zonal statistics per GADM admin unit.
          Population: UNFPA/COD admin-2 estimates (cod_population_admin2.csv), keyed by ADM2_PCODE; reference years vary by
          country. Mammals: IUCN/SERVIR Area of Habitat mammal species richness 2021, 5 km World-Mollweide mosaic.
          Malaria: Malaria Atlas Project admin-1 incidence rate 2024 (cases per thousand), joined by admin-1 name.
          Facilities: sub-Saharan health-facility census 2015. Tick occurrences: GBIF. Pathogens: atlas disease/pathogen
          records. Density in heads or people per km²; rates and counts as reported per admin unit.
        </SourceNote>
      </div>
    </div>
  );
}

function DistrictProfile({
  feature,
  activeMetric,
  facilityType,
  country,
  onFocusCountry,
}: {
  feature: any;
  activeMetric: (typeof METRICS)[number];
  facilityType: string | null;
  country?: string;
  onFocusCountry: (g0: string) => void;
}) {
  const p = feature.properties || {};
  const N1 = p.N1;
  const N2 = p.N2;
  const name = N2 !== undefined && N2 !== null && String(N2) !== "" ? N2 : N1 || "Admin unit";
  const present = METRICS.filter((m) => p[m.key] != null).length;

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold truncate" style={{ color: atlas.text }}>{name}</div>
          {country && (
            <div className="text-[11px] mt-0.5 flex items-center gap-1.5">
              <span style={{ color: atlas.textMuted }}>{country}</span>
              <span className="text-[10px] font-mono px-1 rounded" style={{ background: atlas.grid, color: atlas.textSub }}>{p.G0}</span>
              {N1 && N2 ? <span className="text-[10px] font-mono" style={{ color: atlas.textMuted }}>{p.G1}</span> : null}
            </div>
          )}
        </div>
        <button
          onClick={() => onFocusCountry(p.G0)}
          className="shrink-0 text-[10px] font-medium uppercase tracking-wide cursor-pointer underline"
          style={{ color: atlas.teal }}
        >
          Focus
        </button>
      </div>
      {(p.G1 || p.G1 === 0) && N1 && N1 !== name ? (
        <div className="text-[10px] mt-0.5" style={{ color: atlas.textMuted }}>{N1}</div>
      ) : null}

      <div className="mt-3 border-t" style={{ borderColor: atlas.grid }} />
      <div className="space-y-1 mt-2">
        {METRICS.map((m) => {
          const isFac = m.key === "facility";
          const effKey = isFac && facilityType ? facKey(facilityType) : m.key;
          const val = p[effKey];
          const isActive = activeMetric.key === m.key;
          const shownOn = isFac && isActive && facilityType;
          return (
            <div
              key={m.key}
              className="flex items-center gap-2 text-[12px] px-1.5 py-1 rounded cursor-pointer"
              style={{ background: isActive ? "#F1F7F6" : "transparent" }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: shownOn ? (p[effKey] != null ? m.color : NO_DATA) : m.color }} />
              <span className="flex-1 truncate" style={{ color: atlas.text, fontWeight: isActive ? 600 : 400 }}>
                {shownOn ? `${m.label} · ${facilityType}` : m.label}
              </span>
              <span className="tabular-nums shrink-0" style={{ fontFamily: "monospace", color: isActive ? atlas.teal : atlas.textSub }}>
                {val != null ? fmtDV(m, val) : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] px-1" style={{ borderTop: `1px solid ${atlas.grid}`, paddingTop: 8, color: atlas.textMuted }}>
        <span>
          Data in <strong style={{ color: atlas.text }}>{present}</strong>/{METRICS.length} layers
        </span>
        {facilityType && <span style={{ color: atlas.teal }}>{facilityType} facet active</span>}
      </div>
    </div>
  );
}