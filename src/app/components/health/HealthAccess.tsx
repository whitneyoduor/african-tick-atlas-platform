import { useEffect, useState } from "react";
import { atlas, PageHeader, StatCards, Panel, FilterBar, Chip, SourceNote, PageLoader } from "../common/Atlas";
import { fetchHealthMeta, fetchFacilities, HealthMap, FAC_CLASSES, type HealthMeta, type HealthLayer } from "./HealthMap";

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

function fmtHrs(mins: number): string {
  const h = mins / 60;
  return h >= 24 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(1)} h`;
}

export function HealthAccess() {
  const [meta, setMeta] = useState<HealthMeta | null>(null);
  const [facCount, setFacCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string>("gt");
  const [showFacilities, setShowFacilities] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([fetchHealthMeta(), fetchFacilities()])
      .then(([m, gj]) => {
        if (!active) return;
        setMeta(m);
        setFacCount(gj.features ? gj.features.length : null);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  if (loading) return <PageLoader />;

  const layers: HealthLayer[] = meta?.layers || [];
  const activeLayer = layers.find((l) => l.id === activeId) || (layers[0] as HealthLayer | undefined);
  const stats = activeLayer?.stats;
  const facMeta = meta?.facilities;

  const layerCards = layers.map((l) => ({
    layer: l,
    value: fmtPct(l.stats.within_60_pct),
    hint: `${fmtPct(l.stats.within_120_pct)} within 2 h · median ${fmtHrs(l.stats.median_min)}`,
  }));

  return (
    <div style={{ minHeight: "100vh", background: atlas.bg }}>
      <div className="max-w-7xl mx-auto px-6 py-8" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <PageHeader
          title="Health Access"
          subtitle={
            <>
              {facCount ? facCount.toLocaleString() : facMeta?.mapped.toLocaleString()} mapped health facilities and{" "}
              <span style={{ fontWeight: 600, color: atlas.text }}>modelled 2015 travel time to care</span> across Africa.
            </>
          }
        />

        <StatCards
          className="grid-cols-2 lg:grid-cols-4"
          items={[
            {
              label: "Health facilities",
              value: facCount ?? facMeta?.mapped ?? 0,
              hint: `mapped · ${facMeta?.countries ?? 0} countries`,
              active: false,
            },
            ...layerCards.map((c) => ({
              label: `Within 1 h · ${c.layer.title}`,
              value: c.value,
              hint: c.hint,
              active: c.layer.id === activeLayer?.id,
              onClick: () => setActiveId(c.layer.id),
            })),
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
                {(facMeta?.classes?.[c.key] ?? 0).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-white overflow-hidden" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${atlas.border}` }}>
            <div>
              <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>
                Access & Facilities
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: atlas.textMuted }}>
                {activeLayer?.detail || ""}
              </p>
            </div>
            {activeLayer && (
              <Chip tone="amber">
                {activeLayer.title} · {fmtPct(activeLayer.stats.within_60_pct)} within 1 h
              </Chip>
            )}
          </div>
          <FilterBar>
            <div className="flex items-center gap-2">
              {layers.map((l) => {
                const active = l.id === activeId;
                return (
                  <button
                    key={l.id}
                    onClick={() => setActiveId(l.id)}
                    className="text-[12px] font-medium rounded-full px-3.5 py-1.5 transition-colors"
                    style={{
                      background: active ? atlas.teal : "#FFFFFF",
                      color: active ? "#FFFFFF" : atlas.textSub,
                      border: `1px solid ${active ? atlas.teal : atlas.borderStrong}`,
                    }}
                  >
                    {l.title}
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
              {stats ? `${fmtPct(stats.within_60_pct)} of modelled cells within 1 h · median ${fmtHrs(stats.median_min)}` : ""}
            </span>
          </FilterBar>
          <HealthMap layers={layers} activeId={activeId} showFacilities={showFacilities} />
          {facMeta && (
            <div className="text-[10px] px-5 py-2" style={{ color: atlas.textMuted, borderTop: `1px solid ${atlas.grid}` }}>
              {facMeta.mapped.toLocaleString()} facilities mapped · {facMeta.dropped.toLocaleString()} records without valid coordinates excluded ·
              travel-time cells mark minutes to the nearest facility of each tier
            </div>
          )}
        </div>

        <Panel title="About this map" className="mt-6">
          <div className="text-[12px] leading-relaxed" style={{ color: atlas.textSub }}>
            Facility locations come from a 2015 census of sub-Saharan health facilities (98,745 records; 96,395 with valid
            coordinates), typed and colour-coded by service tier. Travel-time surfaces show the modelled shortest travel time
            (minutes) to the nearest facility of the selected tier per ~8 km cell, using motorised road, rail and water transport
            (Weiss et al. 2020, Nature Medicine). Cells containing a facility read 0.
          </div>
        </Panel>

        <SourceNote>
          Facility census compiled per country, validated against national registries; travel time: Weiss D.J. et al. — Global
          maps of travel time to healthcare facilities, Nature Medicine 2020 (2015 release).
        </SourceNote>
      </div>
    </div>
  );
}