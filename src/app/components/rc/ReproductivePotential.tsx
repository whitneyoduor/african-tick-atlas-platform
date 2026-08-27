import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { atlas } from "../common/Atlas";

interface SpeciesSummary {
  monthly: number[];
  annual_mean: number;
  annual_max: number;
  seasonal_min: number;
  seasonal_max: number;
  peak_month: string;
  peak_month_n: number;
  persistence_months: number;
  persistence_fraction: number;
  seasonal_index: number;
}

interface Adm2Entry {
  gid_1: string;
  name_1: string;
  gid_2: string;
  name_2: string;
  data: Record<string, SpeciesSummary>;
}

interface CountryData {
  gid: string;
  country: string;
  species_list: string[];
  adm2: Adm2Entry[];
}

interface RcIndex {
  countries: { gid: string; name: string; adm2_count: number; species: string[] }[];
  species: Record<string, string>;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const SPECIES_COLORS: Record<string, string> = {
  Avariegatum: "#2563EB",
  Hmarginatum: "#D97706",
  Rappendiculatus: "#DC2626",
  Rmicroplus: "#0F766E",
};

const RC_COLOR_STOPS = [
  { t: 0.0, r: 0, g: 0, b: 4 },
  { t: 0.1, r: 40, g: 11, b: 81 },
  { t: 0.2, r: 101, g: 21, b: 110 },
  { t: 0.3, r: 159, g: 42, b: 99 },
  { t: 0.4, r: 188, g: 55, b: 84 },
  { t: 0.5, r: 221, g: 81, b: 58 },
  { t: 0.6, r: 243, g: 120, b: 25 },
  { t: 0.7, r: 252, g: 165, b: 10 },
  { t: 0.8, r: 246, g: 215, b: 70 },
  { t: 1.0, r: 252, g: 255, b: 164 },
];

function rcColor(value: number, max = 1000): string {
  const t = Math.max(0, Math.min(1, value / max));
  for (let i = 0; i < RC_COLOR_STOPS.length - 1; i++) {
    const a = RC_COLOR_STOPS[i];
    const b = RC_COLOR_STOPS[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t || 1;
      const f = (t - a.t) / span;
      const r = Math.round(a.r + (b.r - a.r) * f);
      const g = Math.round(a.g + (b.g - a.g) * f);
      const bl = Math.round(a.b + (b.b - a.b) * f);
      return `rgb(${r},${g},${bl})`;
    }
  }
  return `rgb(${RC_COLOR_STOPS[0].r},${RC_COLOR_STOPS[0].g},${RC_COLOR_STOPS[0].b})`;
}

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid #E5E9EF",
  fontSize: 12,
  fontFamily: "monospace",
  background: "#FFFFFF",
  boxShadow: "0 4px 12px rgba(16,24,40,0.08)",
  padding: "8px 12px",
};

export function ReproductivePotential() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<maplibregl.Map | null>(null);

  const [index, setIndex] = useState<RcIndex | null>(null);
  const [country, setCountry] = useState("");
  const [species, setSpecies] = useState("Avariegatum");
  const [month, setMonth] = useState(1);
  const [countryData, setCountryData] = useState<CountryData | null>(null);
  const [geoJson, setGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loadingCountry, setLoadingCountry] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hoverAdm2, setHoverAdm2] = useState<{ name: string; value: number } | null>(null);

  const geoRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const dataRef = useRef<CountryData | null>(null);
  const speciesRef = useRef("");
  const monthRef = useRef(1);
  const fittedRef = useRef<string | null>(null);
  speciesRef.current = species;
  monthRef.current = month;
  geoRef.current = geoJson;
  dataRef.current = countryData;

  useEffect(() => {
    fetch("/rc-data/index.json")
      .then((r) => r.json())
      .catch(() => null)
      .then((idx) => {
        setIndex(idx);
        if (idx && idx.countries.length > 0) {
          setCountry(idx.countries[0].gid);
          loadCountry(idx.countries[0].gid);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadCountry = (gid: string) => {
    setLoadingCountry(true);
    setCountryData(null);
    setGeoJson(null);
    setLoaded(false);
    geoRef.current = null;
    dataRef.current = null;
    setCountry(gid);
    Promise.all([
      fetch(`/rc-data/countries/${gid}.json`).then((r) => r.json()).catch(() => null),
      fetch(`/rc-data/geo/${gid}.json`).then((r) => r.json()).catch(() => null),
    ]).then(([data, geo]) => {
      setCountryData(data);
      setGeoJson(geo);
      geoRef.current = geo;
      dataRef.current = data;
      setLoadingCountry(false);
      setLoaded(true);
    });
  };

  const countryName = useMemo(() => {
    if (!index) return "";
    const c = index.countries.find((c) => c.gid === country);
    return c ? c.name : "";
  }, [index, country]);

  const speciesName = useMemo(() => {
    if (!index || !index.species[species]) return "";
    return index.species[species];
  }, [index, species]);

  // Set up map once the container is mounted (container only exists once index loads)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!containerRef.current || mapObj.current) return;

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [0, 10],
      zoom: 2.5,
      minZoom: 1.5,
      maxZoom: 14,
      attributionControl: false,
    });

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    m.on("mousemove", (e) => {
      const data = dataRef.current;
      const sp = speciesRef.current;
      const mo = monthRef.current;
      if (!data) {
        setHoverAdm2(null);
        return;
      }
      const f = e.features?.[0];
      if (!f) {
        setHoverAdm2(null);
        return;
      }
      if (f.layer && f.layer.id !== "adm2-fill" && f.layer.id !== "adm2-hover") {
        setHoverAdm2(null);
        return;
      }
      const gid = f.properties?.GID_2 as string | undefined;
      const entry = gid ? data.adm2.find((a) => a.gid_2 === gid) : undefined;
      if (entry && entry.data[sp]) {
        const rc = entry.data[sp]!.monthly[mo - 1] ?? 0;
        setHoverAdm2({ name: entry.name_2, value: rc });
        m.getCanvas().style.cursor = "pointer";
      } else {
        setHoverAdm2(null);
        m.getCanvas().style.cursor = "";
      }
    });

    m.on("mouseout", () => setHoverAdm2(null));

    mapObj.current = m;
    return () => {
      m.remove();
      mapObj.current = null;
    };
  }, [index]);

  // Add/update layers whenever country data, species, or month changes
  useEffect(() => {
    const m = mapObj.current;
    const data = dataRef.current;
    const geo = geoRef.current;
    const sp = speciesRef.current;
    const mo = monthRef.current;
    if (!m || !data || !geo) return;

    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: (geo.features as GeoJSON.Feature[]).map((f) => {
        const gid = f.properties?.GID_2 as string | undefined;
        const entry = gid ? data.adm2.find((a) => a.gid_2 === gid) : undefined;
        const rc = entry && entry.data[sp] ? entry.data[sp]!.monthly[mo - 1] ?? 0 : 0;
        return {
          ...f,
          properties: { ...f.properties, __rc_value: rc },
        };
      }),
    };

    const render = () => {
      try {
        try {
          if (m.getLayer("adm2-fill")) m.removeLayer("adm2-fill");
          if (m.getLayer("adm2-outline")) m.removeLayer("adm2-outline");
          if (m.getSource("adm2")) m.removeSource("adm2");
        } catch (_) {}

        m.addSource("adm2", { type: "geojson", data: fc });
        m.addLayer({
          id: "adm2-fill",
          type: "fill",
          source: "adm2",
          paint: {
            "fill-color": [
              "interpolate",
              ["linear"],
              ["coalesce", ["get", "__rc_value"], 0],
              0, rcColor(0),
              200, rcColor(200),
              400, rcColor(400),
              600, rcColor(600),
              800, rcColor(800),
              1000, rcColor(1000),
            ],
            "fill-opacity": 0.92,
          },
        });
        m.addLayer({
          id: "adm2-outline",
          type: "line",
          source: "adm2",
          paint: {
            "line-color": "#ffffff",
            "line-width": 0.6,
            "line-opacity": 0.9,
          },
        });

        const bbox = geoBounds(geo);
        if (bbox && fittedRef.current !== data.gid) {
          fittedRef.current = data.gid;
          m.fitBounds(
            [[bbox[0], bbox[1]], [bbox[2], bbox[3]]] as [[number, number], [number, number]],
            { padding: 30, duration: 400 }
          );
        }
      } catch (_) {}
    };

    if (m.loaded()) {
      render();
    } else {
      m.once("load", render);
    }
  }, [loaded, species, month, countryData, geoJson]);

  const chartData = useMemo(() => {
    if (!countryData) return [];
    const sp = species;
    const totals = new Array(12).fill(0);
    let count = 0;
    for (const adm2 of countryData.adm2) {
      const s = adm2.data[sp];
      if (!s) continue;
      count++;
      for (let i = 0; i < 12; i++) totals[i] += s.monthly[i] ?? 0;
    }
    const avg = totals.map((t) => (count > 0 ? Math.round((t / count) * 10) / 10 : 0));
    return MONTH_ABBR.map((m, i) => ({ month: m, rc: avg[i] }));
  }, [countryData, species]);

  const stats = useMemo(() => {
    if (!countryData) return null;
    const sp = species;
    let total = 0;
    let count = 0;
    let persist = 0;
    let seasonIdx = 0;
    let max = -Infinity;
    const peakVotes = new Array(12).fill(0);
    for (const adm2 of countryData.adm2) {
      const s = adm2.data[sp];
      if (!s) continue;
      count++;
      total += s.annual_mean;
      persist += s.persistence_months;
      seasonIdx += s.seasonal_index;
      max = Math.max(max, s.annual_max);
      if (s.peak_month_n >= 1 && s.peak_month_n <= 12) {
        peakVotes[s.peak_month_n - 1]++;
      }
    }
    if (count === 0) return null;
    let best = 0;
    for (let i = 1; i < 12; i++) if (peakVotes[i] > peakVotes[best]) best = i;
    return {
      annualMean: total / count,
      annualMax: max,
      avgPersistence: Math.round((persist / count) * 10) / 10,
      avgSeasonIdx: Math.round((seasonIdx / count) * 100) / 100,
      peakMonthN: peakVotes[best] > 0 ? best + 1 : null,
      totalAdm2: count,
    };
  }, [countryData, species]);

  if (!index) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <span className="text-[13px]" style={{ color: atlas.textMuted }}>Loading data...</span>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: atlas.text }}>
          Tick Cohort Reproductive Potential
        </h1>
        <p className="text-[13px] mt-1" style={{ color: atlas.textSub }}>
          Cohort reproductive potential (R<sub>c</sub>) for African tick species at ADM2 resolution &middot; model output 2025
        </p>
      </div>

      <div className="flex items-center gap-5 flex-wrap px-4 py-3 mb-5 rounded-lg bg-white" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: atlas.textMuted }}>Country</span>
          <select
            value={country}
            onChange={(e) => loadCountry(e.target.value)}
            className="text-[13px] px-3 py-1.5 outline-none rounded-md cursor-pointer bg-white"
            style={{ border: `1px solid ${atlas.borderStrong}`, color: atlas.text, minWidth: 200 }}
          >
            {index.countries.map((c) => (
              <option key={c.gid} value={c.gid}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: atlas.textMuted }}>Species</span>
          <select
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            className="text-[13px] px-3 py-1.5 outline-none rounded-md cursor-pointer bg-white"
            style={{ border: `1px solid ${atlas.borderStrong}`, color: atlas.text, minWidth: 230 }}
          >
            {Object.entries(index.species).map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: atlas.textMuted }}>Month</span>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="text-[13px] px-3 py-1.5 outline-none rounded-md cursor-pointer bg-white"
            style={{ border: `1px solid ${atlas.borderStrong}`, color: atlas.text, minWidth: 130 }}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 mb-4">
        <div className="rounded-lg bg-white overflow-hidden" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid #EFF1F4" }}>
            <div>
              <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>
                {countryName} &mdash; {MONTHS[month - 1]}
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: atlas.textSub }}>
                {speciesName} &middot; area-weighted cohort reproductive potential (R<sub>c</sub>)
              </p>
            </div>
            {loadingCountry && (
              <div className="text-[11px]" style={{ color: atlas.textMuted }}>Loading&hellip;</div>
            )}
          </div>
          <div className="relative" style={{ height: 520 }}>
            <div ref={containerRef} className="w-full h-full" />
            {hoverAdm2 && (
              <div className="absolute top-3 left-3 z-10 px-3 py-2 rounded-md" style={{ background: "rgba(255,255,255,0.96)", border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
                <div className="text-[11px] font-medium" style={{ color: atlas.text }}>{hoverAdm2.name}</div>
                <div className="text-[11px] mt-0.5 font-mono" style={{ color: atlas.teal }}>
                  R<sub>c</sub> = {hoverAdm2.value.toFixed(1)}
                </div>
              </div>
            )}
            {countryData && !loadingCountry && (
              <div className="absolute bottom-3 left-3 right-3 z-10 px-3 py-2 rounded-md" style={{ background: "rgba(255,255,255,0.96)", border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
                <div className="flex flex-col gap-1">
                  <div className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: atlas.textMuted }}>
                    R<sub>c</sub> scale &middot; 0 &ndash; 1000
                  </div>
                  <div className="w-full rounded-full" style={{ height: 8, background: `linear-gradient(to right, ${RC_COLOR_STOPS.map((s) => `rgb(${s.r},${s.g},${s.b})`).join(",")})` }} />
                  <div className="flex justify-between text-[9px] font-mono" style={{ color: atlas.textMuted }}>
                    <span>0</span><span>200</span><span>400</span><span>600</span><span>800</span><span>1000</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg bg-white overflow-hidden" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
            <div className="px-5 py-3" style={{ borderBottom: "1px solid #EFF1F4" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>Seasonal R<sub>c</sub></h3>
              <p className="text-[11px] mt-0.5" style={{ color: atlas.textSub }}>
                Country mean &middot; {speciesName}
              </p>
            </div>
            <div className="p-4">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F3" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`Rc = ${v}`, ""]} labelFormatter={(l: string) => l} />
                    <ReferenceLine x={MONTH_ABBR[month - 1]} stroke="#FB923C" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="rc" stroke={SPECIES_COLORS[species] || "#2563EB"} strokeWidth={2.5} dot={{ r: 3, fill: SPECIES_COLORS[species] || "#2563EB" }} activeDot={{ r: 5 }} name="Rc" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[240px] flex items-center justify-center">
                  <span className="text-[11px]" style={{ color: atlas.textMuted }}>No data</span>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-white overflow-hidden" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
            <div className="px-5 py-3" style={{ borderBottom: "1px solid #EFF1F4" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>Summary</h3>
              <p className="text-[11px] mt-0.5" style={{ color: atlas.textSub }}>
                {countryName} &middot; {speciesName}
              </p>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <div className="px-3 py-2.5 rounded-md" style={{ background: "#F9FAFB", border: `1px solid ${atlas.border}` }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: atlas.textMuted }}>Peak month</div>
                <div className="text-lg font-semibold mt-0.5" style={{ color: atlas.teal }}>
                  {stats?.peakMonthN ? MONTHS[stats.peakMonthN - 1] : "\u2014"}
                </div>
              </div>
              <div className="px-3 py-2.5 rounded-md" style={{ background: "#F9FAFB", border: `1px solid ${atlas.border}` }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: atlas.textMuted }}>Annual mean</div>
                <div className="text-lg font-semibold mt-0.5 font-mono" style={{ color: atlas.text }}>
                  {stats ? stats.annualMean.toFixed(1) : "\u2014"}
                </div>
              </div>
              <div className="px-3 py-2.5 rounded-md" style={{ background: "#F9FAFB", border: `1px solid ${atlas.border}` }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: atlas.textMuted }}>Persistence</div>
                <div className="text-lg font-semibold mt-0.5 font-mono" style={{ color: atlas.text }}>
                  {stats ? `${stats.avgPersistence}/12` : "\u2014"}
                </div>
              </div>
              <div className="px-3 py-2.5 rounded-md" style={{ background: "#F9FAFB", border: `1px solid ${atlas.border}` }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: atlas.textMuted }}>Peak R<sub>c</sub></div>
                <div className="text-lg font-semibold mt-0.5 font-mono" style={{ color: atlas.amber }}>
                  {stats ? stats.annualMax.toFixed(1) : "\u2014"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white overflow-hidden" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
        <div className="px-5 py-3" style={{ borderBottom: "1px solid #EFF1F4" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>About this model</h3>
        </div>
        <div className="px-5 py-4 text-[11px] leading-relaxed" style={{ color: atlas.textSub }}>
          Cohort reproductive potential (R<sub>c</sub>) is the average number of viable female offspring per tick cohort, estimated
          from climate-driven tick lifecycle models and land-surface temperature data. Values are computed for each ADM2
          administrative region in {countryName || "Africa"} for all twelve months. Higher values indicate greater
          population growth potential and hence greater potential for tick-associated disease transmission. A value of 0
          indicates no cohort persistence in that month.
        </div>
      </div>
    </div>
  );
}

function geoBounds(geo: GeoJSON.FeatureCollection): [number, number, number, number] | null {
  const coords: number[][] = [];
  for (const f of geo.features) {
    collectCoords(f.geometry, coords);
  }
  if (coords.length === 0) return null;
  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

function collectCoords(geom: GeoJSON.Geometry, out: number[][]) {
  if (!geom) return;
  switch (geom.type) {
    case "Point":
      out.push(geom.coordinates as unknown as number[]);
      break;
    case "MultiPoint":
      (geom.coordinates as number[][]).forEach((c) => out.push(c));
      break;
    case "LineString":
      (geom.coordinates as number[][]).forEach((c) => out.push(c));
      break;
    case "MultiLineString":
      (geom.coordinates as number[][][]).forEach((l) => l.forEach((c) => out.push(c)));
      break;
    case "Polygon":
      (geom.coordinates as number[][][]).forEach((ring) => ring.forEach((c) => out.push(c)));
      break;
    case "MultiPolygon":
      (geom.coordinates as number[][][][]).forEach((p) => p.forEach((ring) => ring.forEach((c) => out.push(c))));
      break;
    case "GeometryCollection":
      geom.geometries.forEach((g) => collectCoords(g, out));
      break;
  }
}