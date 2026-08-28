import { useEffect, useMemo, useState } from "react";
import {
  fetchEpidemiological,
  type EpidemiologicalRecord,
  filterAfricanRecords,
} from "../../lib/api";
import {
  FEBRILE_CATEGORIES,
  FEBRILE_GENERA,
  FEBRILE_GENERA_MAP,
  singleFebrileGenusOfRecord,
} from "../../lib/febrile";
import { atlas, PageHeader, StatCards, Panel, FilterBar, FilterGroup, Select, Chip, SourceNote, PageLoader } from "../common/Atlas";
import { ChoroplethMap, fetchChoroplethData, type ChoroplethData } from "./ChoroplethMap";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const GENUS_COLORS = FEBRILE_GENERA.map((g) => g.color);

function DonutLegend({
  data,
  colors,
}: {
  data: { name: string; count: number }[];
  colors: string[];
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="w-full space-y-1.5 min-w-0">
      {data.map((d, i) => {
        const pct = total > 0 ? ((d.count / total) * 100).toFixed(1) : "0";
        return (
          <div key={d.name} className="flex items-center gap-2 text-[12px]">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: colors[i % colors.length] }}
            />
            <span className="truncate flex-1" style={{ color: atlas.text }}>
              {d.name}
            </span>
            <span
              className="shrink-0 font-medium tabular-nums"
              style={{ color: atlas.textMuted, fontFamily: "monospace" }}
            >
              {d.count}
            </span>
            <span
              className="shrink-0 tabular-nums"
              style={{ color: atlas.textMuted, fontFamily: "monospace", fontSize: 10 }}
            >
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function FebrilePathogens() {
  const [records, setRecords] = useState<EpidemiologicalRecord[]>([]);
  const [choropleth, setChoropleth] = useState<ChoroplethData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapFilter, setMapFilter] = useState("all");

  useEffect(() => {
    let active = true;
    fetchEpidemiological({ limit: 50000 })
      .then((res) => {
        if (active) {
          setRecords(filterAfricanRecords(res.data));
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    fetchChoroplethData()
      .then((d) => { if (active) setChoropleth(d); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const classified = useMemo(() => {
    const buckets: Record<
      string,
      { genusKey: string; records: EpidemiologicalRecord[]; species: Map<string, number>; countries: Map<string, number> }
    > = {};
    for (const g of FEBRILE_GENERA) {
      buckets[g.key] = { genusKey: g.key, records: [], species: new Map(), countries: new Map() };
    }
    const matched: EpidemiologicalRecord[] = [];
    let coreCount = 0;
    let otherCount = 0;

    for (const r of records) {
      const gk = singleFebrileGenusOfRecord(r);
      if (!gk) continue;
      matched.push(r);
      const bucket = buckets[gk];
      const genus = FEBRILE_GENERA_MAP[gk];
      bucket.records.push(r);
      if (r.species) {
        const k = r.species.trim();
        if (k) bucket.species.set(k, (bucket.species.get(k) || 0) + 1);
      }
      if (r.country) bucket.countries.set(r.country, (bucket.countries.get(r.country) || 0) + 1);
      if (genus.category === "core") coreCount++;
      else otherCount++;
    }

    const speciesSet = new Set<string>();
    const countrySet = new Set<string>();
    for (const g of FEBRILE_GENERA) {
      const b = buckets[g.key];
      b.records.forEach((r) => { if (r.species) speciesSet.add(r.species.trim()); if (r.country) countrySet.add(r.country!); });
      b.records = b.records.slice(0, 5000);
    }

    const genusRows = FEBRILE_GENERA.map((g) => {
      const b = buckets[g.key];
      const species = [...b.species.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
      const countries = [...b.countries.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
      return { genus: g, records: b.records.length, species, countries };
    });

    return {
      buckets,
      genusRows,
      totalMatched: matched.length,
      coreCount,
      otherCount,
      speciesTotal: speciesSet.size,
      countryTotal: countrySet.size,
    };
  }, [records]);

  const mapKeys = useMemo(() => {
    if (mapFilter === "all") return FEBRILE_GENERA.map((g) => g.key);
    if (mapFilter === "core" || mapFilter === "other") {
      return FEBRILE_GENERA.filter((g) => g.category === mapFilter).map((g) => g.key);
    }
    return [mapFilter];
  }, [mapFilter]);

  const mapLabel = useMemo(() => {
    if (mapFilter === "all") return "Human febrile pathogens";
    if (mapFilter === "core") return FEBRILE_CATEGORIES.find((c) => c.key === "core")!.label;
    if (mapFilter === "other") return FEBRILE_CATEGORIES.find((c) => c.key === "other")!.label;
    return FEBRILE_GENERA_MAP[mapFilter]?.label || "Febrile pathogens";
  }, [mapFilter]);

  const choroTotals = useMemo(() => {
    if (!choropleth) return { points: 0, total: 0, mapped: 0, unmapped: 0 };
    const isTotal = mapKeys.length >= FEBRILE_GENERA.length;
    const points = choropleth.features.reduce((sum, f) => {
      const p = f.properties as Record<string, number>;
      if (isTotal) return sum + (p.d_total || 0);
      return sum + mapKeys.reduce((s, k) => s + (p[`d_${k}`] || 0), 0);
    }, 0);
    return {
      points,
      total: choropleth.meta.total,
      mapped: choropleth.meta.mapped,
      unmapped: choropleth.meta.total - choropleth.meta.mapped,
    };
  }, [choropleth, mapKeys]);

  const genusPieData = useMemo(
    () => classified.genusRows.map((r) => ({ name: r.genus.label, count: r.records })),
    [classified]
  );

  const categoryPieData = useMemo(() => {
    const core = classified.genusRows.filter((r) => r.genus.category === "core").reduce((s, r) => s + r.records, 0);
    const other = classified.genusRows.filter((r) => r.genus.category === "other").reduce((s, r) => s + r.records, 0);
    return [
      { name: FEBRILE_CATEGORIES[0].label, count: core },
      { name: FEBRILE_CATEGORIES[1].label, count: other },
    ];
  }, [classified]);

  if (loading) return <PageLoader />;

  return (
    <div style={{ minHeight: "100vh", background: atlas.bg }}>
      <div className="max-w-7xl mx-auto px-6 py-8" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <PageHeader
          title="Human Febrile Pathogens"
          subtitle={
            <>
              Tick-borne pathogens that present like malaria —{" "}
              <span style={{ fontWeight: 600, color: atlas.text }}>mapped by genus</span>.
            </>
          }
        />

        <div
          className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6"
          style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
        >
          {FEBRILE_CATEGORIES.map((c, ci) => {
            const count = ci === 0 ? classified.coreCount : classified.otherCount;
            const genera = FEBRILE_GENERA.filter((g) => g.category === c.key);
            const totalGenusRecords = genera.reduce((s, g) => s + (classified.genusRows.find((r) => r.genus.key === g.key)?.records || 0), 0);
            return (
              <div
                key={c.key}
                className="rounded-lg bg-white overflow-hidden"
                style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}
              >
                <div
                  className="h-1.5"
                  style={{
                    background: `linear-gradient(90deg, ${genera[0].color}, ${genera[genera.length - 1].color})`,
                  }}
                />
                <div className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[14px] font-semibold truncate" style={{ color: atlas.text }}>
                      {c.label}
                    </h3>
                    <span
                      className="shrink-0 text-[22px] font-bold tabular-nums leading-none"
                      style={{ color: genera[0].color, fontFamily: "monospace" }}
                    >
                      {count.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[12px] mt-1 leading-snug" style={{ color: atlas.textSub }}>
                    {c.description}
                  </p>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {genera.map((g) => {
                      const recs = classified.genusRows.find((r) => r.genus.key === g.key)?.records || 0;
                      return (
                        <Chip key={g.key}>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full inline-block" style={{ background: g.color }} />
                            {g.label} &middot; {recs.toLocaleString()}
                          </span>
                        </Chip>
                      );
                    })}
                  </div>
                  <div className="text-[11px] mt-3" style={{ color: atlas.textMuted }} key={c.key + "-sum"}>
                    {totalGenusRecords.toLocaleString()} records &middot; {genera.length} genera
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <StatCards
          className="grid-cols-2 lg:grid-cols-5"
          items={[
            { label: "Core Records", value: classified.coreCount, hint: "Rickettsia + Borrelia + Babesia" },
            { label: "Other Records", value: classified.otherCount, hint: "Coxiella + Anaplasma + Ehrlichia" },
            { label: "Total Records", value: classified.totalMatched, hint: "All six genera" },
            { label: "Tick Vectors", value: classified.speciesTotal, hint: "Rolled up by genus" },
            { label: "Countries", value: classified.countryTotal, hint: "Across Africa" },
          ]}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <Panel title="Records by Genus" className="h-full">
            <div className="flex items-center gap-5">
              <div style={{ width: 180, height: 180, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={genusPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={76}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="name"
                      strokeWidth={0}
                    >
                      {genusPieData.map((_, i) => (
                        <Cell key={i} fill={GENUS_COLORS[i % GENUS_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #E5E9EF",
                        fontSize: 12,
                        fontFamily: "monospace",
                        background: "#FFFFFF",
                        padding: "8px 12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 min-w-0">
                <DonutLegend data={genusPieData} colors={GENUS_COLORS} />
              </div>
            </div>
          </Panel>

          <Panel title="Category Split" className="h-full">
            <div className="flex items-center gap-5">
              <div style={{ width: 180, height: 180, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={76}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="name"
                      strokeWidth={0}
                    >
                      {categoryPieData.map((_, i) => (
                        <Cell key={i} fill={i === 0 ? "#DC2626" : "#7C3AED"} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #E5E9EF",
                        fontSize: 12,
                        fontFamily: "monospace",
                        background: "#FFFFFF",
                        padding: "8px 12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 min-w-0">
                <DonutLegend
                  data={categoryPieData}
                  colors={["#DC2626", "#7C3AED"]}
                />
              </div>
            </div>
          </Panel>

          <Panel title="Genera Covered" className="h-full">
            <div className="space-y-2">
              {classified.genusRows.map((r) => (
                <div
                  key={r.genus.key}
                  className="flex items-center gap-2.5 text-[12px]"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: r.genus.color }}
                  />
                  <span className="truncate flex-1 font-medium" style={{ color: atlas.text }}>
                    {r.genus.label}
                  </span>
                  <span className="shrink-0 tabular-nums" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>
                    {r.species.length} species
                  </span>
                  <span className="shrink-0 w-16 text-right tabular-nums" style={{ color: atlas.text, fontFamily: "monospace" }}>
                    {r.records.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div
          className="mb-6 rounded-lg bg-white"
          style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}
        >
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: `1px solid ${atlas.border}` }}
          >
            <div>
              <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>
                Geographic Distribution
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: atlas.textMuted }}>
                Occurrence points per admin region, coloured by pathogen layer
              </p>
            </div>
            <span className="text-[11px] tabular-nums" style={{ color: atlas.textMuted, fontFamily: "monospace" }}>
              {choroTotals.points.toLocaleString()} points in mapped regions
            </span>
          </div>
          <FilterBar>
            <FilterGroup label="Layer">
              <Select value={mapFilter} onChange={setMapFilter} minWidth={230}>
                <option value="all">All human febrile genera</option>
                <option value="core">{FEBRILE_CATEGORIES[0].label}</option>
                <option value="other">{FEBRILE_CATEGORIES[1].label}</option>
                {FEBRILE_GENERA.map((g) => (
                  <option key={g.key} value={g.key}>{g.label}</option>
                ))}
              </Select>
            </FilterGroup>
            {mapFilter !== "all" && (
              <Chip tone="amber">
                {mapLabel} &middot; {choroTotals.points.toLocaleString()} points
              </Chip>
            )}
          </FilterBar>
          <ChoroplethMap data={choropleth} keys={mapKeys} />
          {choropleth && choroTotals.unmapped > 0 && (
            <div className="text-[10px] px-5 py-2" style={{ color: atlas.textMuted, borderTop: `1px solid ${atlas.grid}` }}>
              {choroTotals.unmapped.toLocaleString()} of {choroTotals.total.toLocaleString()} febrile occurrence points fall outside mapped admin regions
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {classified.genusRows.map((r) => (
            <button
              key={r.genus.key}
              onClick={() => setMapFilter(r.genus.key)}
              className="text-left rounded-lg transition-all hover:shadow-md cursor-pointer"
              style={{
                border: `1px solid ${r.genus.color}40`,
                boxShadow: atlas.shadow,
                background: `linear-gradient(180deg, ${r.genus.color}14, #FFFFFF 45%)`,
              }}
            >
              <div className="p-4 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.genus.color }} />
                  <div className="text-[13px] font-semibold truncate" style={{ color: atlas.text }}>
                    {r.genus.label}
                  </div>
                </div>
                <div className="mt-2 text-[20px] font-bold leading-none tabular-nums" style={{ color: r.genus.color, fontFamily: "monospace" }}>
                  {r.records.toLocaleString()}
                </div>
                <div className="text-[10px] mt-1" style={{ color: atlas.textMuted }}>
                  {r.species.length} species
                </div>
              </div>
              <div className="mx-3 mb-3 rounded-md px-2.5 py-2 text-[10px] min-h-[34px] bg-white" style={{ border: `1px solid ${atlas.grid}` }}>
                {r.species.slice(0, 2).map((s) => (
                  <div key={s.name} className="truncate" style={{ color: atlas.textSub }}>{s.name}</div>
                ))}
                {r.species.length > 2 && <div style={{ color: atlas.textMuted }}>+{r.species.length - 2} more</div>}
                {r.species.length === 0 && <div style={{ color: atlas.textMuted }}>&mdash;</div>}
              </div>
            </button>
          ))}
        </div>

        <SourceNote>
          Epidemiological records (African Tick Atlas) classified by genus — Rickettsia, Borrelia, Babesia, Coxiella,
          Anaplasma, Ehrlichia — for the differential diagnosis of febrile illness in malaria-endemic Africa. Records
          that mention several pathogens (single-tick screening results) are counted once, under the first-listed genus.
        </SourceNote>
      </div>
    </div>
  );
}