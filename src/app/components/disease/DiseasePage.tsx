import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router";
import {
  fetchEpidemiological,
  fetchDiseaseCoordinates,
  type EpidemiologicalRecord,
  type DiseaseCoordinatesMap,
  filterAfricanRecords,
} from "../../lib/api";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { atlas, tooltipStyle } from "../common/Atlas";
import { EvidenceMap } from "../common/EvidenceMap";

const COLORS = [
  "#0F766E", "#D97706", "#DC2626", "#2563EB", "#7C3AED",
  "#DB2777", "#059669", "#EA580C", "#4F46E5", "#9333EA",
  "#0891B2", "#B45309", "#14B8A6", "#BE185D", "#6D28D9",
];

function ChartPie({
  data,
  size = 200,
}: {
  data: { name: string; count: number }[];
  size?: number;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.22}
            outerRadius={size * 0.42}
            paddingAngle={2}
            dataKey="count"
            nameKey="name"
            strokeWidth={0}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value: number, name: string) => {
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
              return [`${value} (${pct}%)`, name];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function Legend({
  data,
  max = 12,
}: {
  data: { name: string; count: number }[];
  max?: number;
}) {
  const total = data.reduce((s, d) => s + d.count, 0);
  const shown = data.slice(0, max);
  const hidden = data.length - max;
  return (
    <div className="min-w-0 space-y-1">
      {shown.map((d, i) => {
        const pct = total > 0 ? ((d.count / total) * 100).toFixed(1) : "0";
        return (
          <div key={d.name} className="flex items-center gap-2 text-[11px]">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span
              className="truncate flex-1"
              style={{ color: atlas.text }}
            >
              {d.name}
            </span>
            <span
              className="shrink-0 font-medium tabular-nums"
              style={{
                color: atlas.textMuted,
                fontFamily: "monospace",
              }}
            >
              {d.count}
            </span>
            <span
              className="shrink-0 tabular-nums"
              style={{
                color: atlas.textMuted,
                fontFamily: "monospace",
                fontSize: 10,
              }}
            >
              {pct}%
            </span>
          </div>
        );
      })}
      {hidden > 0 && (
        <div className="text-[10px]" style={{ color: atlas.textMuted }}>
          +{hidden} more
        </div>
      )}
    </div>
  );
}

function PieCard({
  title,
  subtitle,
  data,
  pieSize,
  legendMax,
}: {
  title: string;
  subtitle?: string;
  data: { name: string; count: number }[];
  pieSize?: number;
  legendMax?: number;
}) {
  if (data.length === 0) return null;
  return (
    <div
      className="rounded-lg bg-white"
      style={{
        border: `1px solid ${atlas.border}`,
        boxShadow: atlas.shadow,
      }}
    >
      <div
        className="px-5 py-3"
        style={{ borderBottom: `1px solid ${atlas.border}` }}
      >
        <h3
          className="text-[13px] font-semibold"
          style={{ color: atlas.text }}
        >
          {title}
        </h3>
        {subtitle && (
          <p
            className="text-[11px] mt-0.5"
            style={{ color: atlas.textMuted }}
          >
            {subtitle}
          </p>
        )}
      </div>
      <div className="p-5">
        <div className="flex items-start gap-5">
          <ChartPie data={data} size={pieSize || 200} />
          <div className="flex-1 min-w-0 overflow-y-auto" style={{ maxHeight: 300 }}>
            <Legend data={data} max={legendMax || 12} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DiseaseHeatmap({
  records,
  diseaseName,
  diseaseCoords,
}: {
  records: EpidemiologicalRecord[];
  diseaseName: string;
  diseaseCoords: DiseaseCoordinatesMap;
}) {
  return <EvidenceMap entry={diseaseCoords[diseaseName]} diseaseName={diseaseName} />;
}

function TimelineHeatmap({
  records,
}: {
  records: EpidemiologicalRecord[];
}) {
  const { grid, years } = useMemo(() => {
    const cy: Record<string, Record<number, number>> = {};
    const ys = new Set<number>();
    records.forEach((r) => {
      if (!r.country || r.yearStart == null) return;
      if (!cy[r.country]) cy[r.country] = {};
      cy[r.country][r.yearStart] =
        (cy[r.country][r.yearStart] || 0) + 1;
      ys.add(r.yearStart);
    });

    const countries = Object.keys(cy).sort();
    const years = Array.from(ys).sort((a, b) => a - b);

    let max = 0;
    for (const c of Object.values(cy))
      for (const v of Object.values(c)) if (v > max) max = v;

    const grid = countries.map((country) => ({
      country,
      years: years.map((year) => ({
        year,
        count: cy[country]?.[year] || 0,
        intensity:
          max > 0 ? (cy[country]?.[year] || 0) / max : 0,
      })),
    }));

    return { grid: grid.slice(0, 15), years };
  }, [records]);

  if (grid.length === 0 || years.length === 0) return null;

  const cell = Math.max(
    14,
    Math.min(22, 600 / years.length)
  );

  return (
    <div className="overflow-x-auto">
      <div
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          className="flex items-center"
          style={{ marginLeft: 140 }}
        >
          {years.map((y) => (
            <div
              key={y}
              className="text-center shrink-0"
              style={{
                width: cell,
                fontSize: 9,
                color: atlas.textMuted,
                fontFamily: "monospace",
              }}
            >
              {y % 5 === 0 ||
              y === years[0] ||
              y === years[years.length - 1]
                ? y
                : ""}
            </div>
          ))}
        </div>
        {grid.map((row) => (
          <div
            key={row.country}
            className="flex items-center"
            style={{ height: cell + 2 }}
          >
            <div
              className="text-right pr-2 shrink-0 truncate"
              style={{
                width: 138,
                fontSize: 11,
                color: atlas.text,
              }}
              title={row.country}
            >
              {row.country}
            </div>
            {row.years.map((c) => (
              <div
                key={c.year}
                className="shrink-0 rounded-sm"
                style={{
                  width: cell - 1,
                  height: cell - 1,
                  marginRight: 1,
                  background:
                    c.count === 0
                      ? atlas.grid
                      : `rgba(15, 118, 110, ${0.15 + c.intensity * 0.85})`,
                }}
                title={`${row.country} ${c.year}: ${c.count}`}
              />
            ))}
          </div>
        ))}
        <div
          className="flex items-center gap-2 mt-2"
          style={{ marginLeft: 140 }}
        >
          <span
            style={{ fontSize: 10, color: atlas.textMuted }}
          >
            Less
          </span>
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
            <div
              key={v}
              className="rounded-sm"
              style={{
                width: 12,
                height: 12,
                background:
                  v === 0
                    ? atlas.grid
                    : `rgba(15, 118, 110, ${0.15 + v * 0.85})`,
              }}
            />
          ))}
          <span
            style={{ fontSize: 10, color: atlas.textMuted }}
          >
            More
          </span>
        </div>
      </div>
    </div>
  );
}

export function DiseasePage() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const disease = decodeURIComponent(name || "");
  const [records, setRecords] = useState<EpidemiologicalRecord[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [diseaseCoords, setDiseaseCoords] =
    useState<DiseaseCoordinatesMap>({});

  useEffect(() => {
    fetchDiseaseCoordinates()
      .then(setDiseaseCoords)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!disease) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    fetchEpidemiological({ disease, limit: 50000 })
      .then((res) => {
        if (active) {
          setRecords(filterAfricanRecords(res.data));
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [disease]);

  const data = useMemo(() => {
    const sp: Record<string, number> = {};
    const ho: Record<string, number> = {};
    const co: Record<string, number> = {};
    records.forEach((r) => {
      if (r.species) sp[r.species] = (sp[r.species] || 0) + 1;
      if (r.relatedHosts)
        ho[r.relatedHosts] = (ho[r.relatedHosts] || 0) + 1;
      if (r.country)
        co[r.country] = (co[r.country] || 0) + 1;
    });
    const sort = (m: Record<string, number>) =>
      Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([n, c]) => ({ name: n, count: c }));
    return {
      species: sort(sp),
      hosts: sort(ho),
      countries: sort(co),
      speciesCount: Object.keys(sp).length,
      hostCount: Object.keys(ho).length,
      countryCount: Object.keys(co).length,
    };
  }, [records]);

  const yearlyData = useMemo(() => {
    const yc: Record<number, number> = {};
    records.forEach((r) => {
      if (r.yearStart != null)
        yc[r.yearStart] = (yc[r.yearStart] || 0) + 1;
    });
    return Object.entries(yc)
      .sort(([a], [b]) => +a - +b)
      .map(([y, c]) => ({ name: y, count: c }));
  }, [records]);

  if (loading)
    return (
      <div
        className="flex items-center justify-center"
        style={{ minHeight: "60vh" }}
      >
        <span
          className="text-sm"
          style={{ color: atlas.textMuted }}
        >
          Loading...
        </span>
      </div>
    );

  if (!disease || records.length === 0) {
    return (
      <div
        className="max-w-7xl mx-auto px-6 py-6"
        style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
      >
        <button
          onClick={() => navigate("/diseases")}
          className="text-sm mb-4 hover:underline"
          style={{ color: atlas.teal }}
        >
          &larr; Back to Diseases
        </button>
        <h1
          className="text-2xl font-semibold"
          style={{ color: atlas.text }}
        >
          {disease || "Disease"}
        </h1>
        <div
          className="mt-4 px-5 py-8 text-center rounded-lg"
          style={{
            background: atlas.card,
            border: `1px solid ${atlas.border}`,
          }}
        >
          <p
            className="text-sm"
            style={{ color: atlas.textSub }}
          >
            No records found for this disease.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="max-w-7xl mx-auto px-6 py-6"
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      <div className="mb-6">
        <button
          onClick={() => navigate("/diseases")}
          className="text-sm mb-1 hover:underline"
          style={{ color: atlas.teal }}
        >
          &larr; Back to Diseases
        </button>
        <h1
          className="text-2xl font-semibold"
          style={{ color: atlas.text }}
        >
          {disease}
        </h1>
        <p
          className="text-sm mt-1"
          style={{ color: atlas.textSub }}
        >
          {records.length.toLocaleString()} records &middot;{" "}
          {data.speciesCount} tick vectors &middot;{" "}
          {data.countryCount} countries &middot;{" "}
          {data.hostCount} hosts
        </p>
      </div>

      <div
        className="grid grid-cols-4 gap-px mb-6"
        style={{ background: atlas.border }}
      >
        {[
          { label: "Records", value: records.length, color: atlas.teal },
          { label: "Tick Vectors", value: data.speciesCount, color: atlas.red },
          { label: "Countries", value: data.countryCount, color: atlas.blue },
          { label: "Hosts", value: data.hostCount, color: atlas.amber },
        ].map((m) => (
          <div
            key={m.label}
            className="px-5 py-4"
            style={{ background: atlas.card }}
          >
            <div
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: atlas.textMuted }}
            >
              {m.label}
            </div>
            <div
              className="text-3xl font-semibold mt-1"
              style={{ color: m.color, fontFamily: "monospace" }}
            >
              {m.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div
        className="mb-6 rounded-lg bg-white"
        style={{
          border: `1px solid ${atlas.border}`,
          boxShadow: atlas.shadow,
        }}
      >
        <div
          className="px-5 py-3"
          style={{ borderBottom: `1px solid ${atlas.border}` }}
        >
          <h3
            className="text-[13px] font-semibold"
            style={{ color: atlas.text }}
          >
            Geographic Distribution
          </h3>
          <p
            className="text-[11px] mt-0.5"
            style={{ color: atlas.textMuted }}
          >
            Tick occurrence points linked to {disease} &middot; sized by
            concentration, colored by species, hover for details
          </p>
        </div>
        <div style={{ height: 380 }}>
          <DiseaseHeatmap
            records={records}
            diseaseName={disease}
            diseaseCoords={diseaseCoords}
          />
        </div>
      </div>

      {(() => {
        const ys = new Set<number>();
        records.forEach((r) => {
          if (r.yearStart != null) ys.add(r.yearStart);
        });
        return ys.size > 1;
      })() && (
        <div
          className="mb-6 rounded-lg bg-white"
          style={{
            border: `1px solid ${atlas.border}`,
            boxShadow: atlas.shadow,
          }}
        >
          <div
            className="px-5 py-3"
            style={{
              borderBottom: `1px solid ${atlas.border}`,
            }}
          >
            <h3
              className="text-[13px] font-semibold"
              style={{ color: atlas.text }}
            >
              Timeline Heatmap
            </h3>
            <p
              className="text-[11px] mt-0.5"
              style={{ color: atlas.textMuted }}
            >
              Country x Year record density
            </p>
          </div>
          <div className="p-4">
            <TimelineHeatmap records={records} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <PieCard
          title="Associated Tick Vectors"
          subtitle="Species linked to this disease"
          data={data.species}
          pieSize={200}
          legendMax={10}
        />
        <PieCard
          title="Records by Country"
          subtitle="Geographic distribution"
          data={data.countries}
          pieSize={200}
          legendMax={10}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <PieCard
          title="Animal Hosts"
          subtitle="Known and suspected hosts"
          data={data.hosts}
          pieSize={220}
          legendMax={12}
        />
        <PieCard
          title="Records Over Time"
          subtitle="Publication timeline"
          data={yearlyData}
          pieSize={220}
          legendMax={15}
        />
      </div>
    </div>
  );
}
