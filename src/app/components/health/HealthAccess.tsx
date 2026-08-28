import { useEffect, useMemo, useState } from "react";
import { atlas, PageHeader, StatCards, Panel, FilterBar, Chip, SourceNote, PageLoader } from "../common/Atlas";
import {
  fetchLivestock,
  fetchFacilities,
  HealthMap,
  METRICS,
  FAC_CLASSES,
  type MetricKey,
  type LivestockData,
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
  const [facilities, setFacilities] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<MetricKey>("cattle");
  const [showFacilities, setShowFacilities] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([fetchLivestock(), fetchFacilities()])
      .then(([lv, fc]) => {
        if (!active) return;
        setData(lv);
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

  if (loading) return <PageLoader />;

  const activeMetric = METRICS.find((m) => m.key === metric) || METRICS[0];

  return (
    <div style={{ minHeight: "100vh", background: atlas.bg }}>
      <div className="max-w-7xl mx-auto px-6 py-8" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <PageHeader
          title="Health Access"
          subtitle={
            <>
              {facCount ? facCount.toLocaleString() : ""} mapped health facilities and{" "}
              <span style={{ fontWeight: 600, color: atlas.text }}>modelled 2015 cattle, goat &amp; sheep density</span>{" "}
              summarised by district.
            </>
          }
        />

        <StatCards
          className="grid-cols-2 lg:grid-cols-5"
          items={[
            {
              label: "Health facilities",
              value: facCount ?? 0,
              hint: `mapped · ${facCountries} countries`,
              active: false,
            },
            ...METRICS.map((m) => ({
              label: `${m.label} density`,
              value: africa ? fmtD(africa[m.key]) : "—",
              hint: "Africa mean · heads/km²",
              active: m.key === metric,
              onClick: () => setMetric(m.key),
            })),
            {
              label: "Districts",
              value: data?.meta?.regions ?? 0,
              hint: "GADM ADM2 · zonal means",
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
                Livestock density by district
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: atlas.textMuted }}>
                Zonal statistics of 2015 cattle, goat and sheep counts per {data?.meta?.resolution || "~8 km"} cell, averaged and summed per GADM district.
              </p>
            </div>
            {africa && (
              <Chip tone="amber">
                {activeMetric.label} · {africa[metric].toLocaleString(undefined, { maximumFractionDigits: 1 })} heads/km² mean
              </Chip>
            )}
          </div>
          <FilterBar>
            <div className="flex items-center gap-2">
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
            <button
              onClick={() => setShowFacilities((s) => !s)}
              className="text-[12px] font-medium rounded-full px-3.5 py-1.5 transition-colors"
              style={{
                background: showFacilities ? "#ECF6F4" : "#FFFFFF",
                color: showFacilities ? atlas.teal : atlas.textSub,
                border: `1px solid ${showFacilities ? "#8FBDB7" : atlas.borderStrong}`,
              }}
            >
              Facilities {showFacilities ? "on" : "off"}
            </button>
            <span className="text-[11px]" style={{ color: atlas.textMuted }}>
              Hover a district for its {activeMetric.label.toLowerCase()} density and total heads
            </span>
          </FilterBar>
          <HealthMap data={data} facilities={facilities} metric={metric} showFacilities={showFacilities} />
          {data && (
            <div className="text-[10px] px-5 py-2" style={{ color: atlas.textMuted, borderTop: `1px solid ${atlas.grid}` }}>
              {data.meta.regions.toLocaleString()} districts · {data.meta.countries.length} countries · {data.meta.resolution} · {data.meta.years}
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
                  <th className="text-right px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>Total heads</th>
                  <th className="text-right px-3 py-1.5 font-medium" style={{ color: atlas.textMuted }}>Mean density</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((c, i) => (
                  <tr key={c.gid} className="border-b" style={{ borderColor: atlas.grid }}>
                    <td className="px-3 py-1.5 tabular-nums" style={{ color: atlas.textMuted }}>{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium" style={{ color: atlas.text }}>{c.name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: atlas.text, fontFamily: "monospace" }}>
                      {fmtH(c[`${metric}_tot`] || 0)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: atlas.textSub, fontFamily: "monospace" }}>
                      {fmtD(c[metric] || 0)} /km²
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="About this map" className="mt-6">
          <div className="text-[12px] leading-relaxed" style={{ color: atlas.textSub }}>
            Livestock counts come from the 2015 Gridded Livestock of the World layers: cattle, goat and sheep heads per ~8 km grid
            cell, derived from national censuses and remote-sensed land use. Zonal statistics re-aggregate those cells to the
            boundaries you see — the GADM level-2 districts used across the atlas. Each district stores a mean density (total
            heads ÷ district area, in heads/km²) and the summed herd size, so every country is identifiable on hover. Facility
            locations come from a 2015 census of sub-Saharan health facilities (98,745 records; 96,395 with valid coordinates),
            typed by service tier.
          </div>
        </Panel>

        <SourceNote>
          Livestock: FAO Gridded Livestock of the World (cattle, goat, sheep), 2015 release, zonal statistics per GADM district.
          Facilities: sub-Saharan health-facility census 2015. Density units are heads/km²; cell values are modelled estimates.
        </SourceNote>
      </div>
    </div>
  );
}