import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { atlas, PageHeader } from "../common/Atlas";
import {
  fetchSpeciesByCountry,
  SpeciesByCountryData,
  fetchOccurrences,
} from "../../lib/api";
import type { Occurrence } from "../../lib/api";

export function LocationQuery() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState<SpeciesByCountryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState(
    searchParams.get("country") || ""
  );
  const [mapPoints, setMapPoints] = useState<
    { lat: number; lng: number; species: string }[]
  >([]);

  useEffect(() => {
    fetchSpeciesByCountry().then((d) => {
      setData(d);
      setLoading(false);
      if (!selectedCountry && d.allCountries.length > 0) {
        const saved = searchParams.get("country");
        if (saved && d.allCountries.includes(saved)) {
          setSelectedCountry(saved);
        }
      }
    });
  }, []);

  const speciesList = useMemo(() => {
    if (!data || !selectedCountry) return [];
    return data.countries[selectedCountry] || [];
  }, [data, selectedCountry]);

  useEffect(() => {
    if (!selectedCountry || speciesList.length === 0) {
      setMapPoints([]);
      return;
    }
    const allSpecies = speciesList.map((s) => s.species);
    fetchOccurrences({
      country: selectedCountry,
      limit: 1000,
    }).then((res) => {
      setMapPoints(
        res.data
          .filter(
            (r): r is Occurrence & { latitude: number; longitude: number } =>
              r.latitude !== null && r.longitude !== null
          )
          .map((r) => ({
            lat: r.latitude,
            lng: r.longitude,
            species: r.species || "Unknown",
          }))
      );
    });
  }, [selectedCountry, speciesList.length]);

  const handleCountryChange = (country: string) => {
    setSelectedCountry(country);
    if (country) {
      setSearchParams({ country });
    } else {
      setSearchParams({});
    }
  };

  const totalSpecies = speciesList.length;
  const totalOcc = speciesList.reduce((s, r) => s + r.occurrences, 0);
  const totalEpi = speciesList.reduce((s, r) => s + r.epiRecords, 0);

  if (loading) {
    return (
      <div className="p-6" style={{ background: atlas.bg, minHeight: "100vh" }}>
        <div className="flex items-center justify-center h-[50vh]">
          <span className="text-sm" style={{ color: atlas.textMuted }}>
            Loading location data...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6" style={{ background: atlas.bg, minHeight: "100vh" }}>
      <PageHeader
        title="Species by Location"
        subtitle="Query which tick species have been recorded in a specific African country"
      />

      <div
        className="rounded-lg bg-white mb-6"
        style={{
          border: `1px solid ${atlas.border}`,
          boxShadow: atlas.shadow,
        }}
      >
        <div className="px-6 py-5">
          <label
            className="block text-xs font-medium mb-2"
            style={{ color: atlas.textSub }}
          >
            Select Country
          </label>
          <div className="flex items-center gap-4">
            <select
              value={selectedCountry}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="rounded-lg px-4 py-2.5 text-sm outline-none transition-colors"
              style={{
                border: `1px solid ${atlas.borderStrong}`,
                color: atlas.text,
                background: "#fff",
                minWidth: 280,
              }}
            >
              <option value="">— Choose a country —</option>
              {data!.allCountries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {selectedCountry && (
              <div className="flex items-center gap-6 text-xs">
                <div>
                  <span style={{ color: atlas.textMuted }}>Species: </span>
                  <span className="font-semibold" style={{ color: atlas.text }}>
                    {totalSpecies}
                  </span>
                </div>
                <div>
                  <span style={{ color: atlas.textMuted }}>Occurrences: </span>
                  <span className="font-semibold" style={{ color: atlas.text }}>
                    {totalOcc.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span style={{ color: atlas.textMuted }}>
                    Epi. Records:{" "}
                  </span>
                  <span className="font-semibold" style={{ color: atlas.text }}>
                    {totalEpi.toLocaleString()}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!selectedCountry && (
        <div
          className="rounded-lg bg-white p-8 text-center"
          style={{
            border: `1px solid ${atlas.border}`,
            boxShadow: atlas.shadow,
          }}
        >
          <div
            className="text-sm mb-2"
            style={{ color: atlas.text, fontWeight: 500 }}
          >
            Select a country above to explore its tick species
          </div>
          <div className="text-xs" style={{ color: atlas.textMuted }}>
            {data!.allCountries.length} African countries available in the
            database
          </div>
        </div>
      )}

      {selectedCountry && speciesList.length > 0 && (
        <>
          <div
            className="rounded-lg bg-white"
            style={{
              border: `1px solid ${atlas.border}`,
              boxShadow: atlas.shadow,
            }}
          >
            <div className="px-6 py-4 border-b" style={{ borderColor: atlas.border }}>
              <h2
                className="text-sm font-semibold"
                style={{ color: atlas.text }}
              >
                Species in {selectedCountry}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${atlas.border}` }}>
                    <th
                      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider"
                      style={{ color: atlas.textSub }}
                    >
                      Species
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider"
                      style={{ color: atlas.textSub }}
                    >
                      Occurrences
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider"
                      style={{ color: atlas.textSub }}
                    >
                      Epi. Records
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider"
                      style={{ color: atlas.textSub }}
                    >
                      Total
                    </th>
                    <th
                      className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider"
                      style={{ color: atlas.textSub }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {speciesList.map((row, i) => (
                    <tr
                      key={row.species}
                      style={{
                        borderBottom:
                          i < speciesList.length - 1
                            ? `1px solid ${atlas.border}`
                            : "none",
                        background:
                          i % 2 === 0 ? "transparent" : atlas.grid,
                      }}
                    >
                      <td className="px-6 py-3">
                        <span
                          className="font-medium"
                          style={{ color: atlas.text }}
                        >
                          {row.species}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-right tabular-nums"
                        style={{ color: atlas.textSub }}
                      >
                        {row.occurrences.toLocaleString()}
                      </td>
                      <td
                        className="px-4 py-3 text-right tabular-nums"
                        style={{ color: atlas.textSub }}
                      >
                        {row.epiRecords.toLocaleString()}
                      </td>
                      <td
                        className="px-4 py-3 text-right font-medium tabular-nums"
                        style={{ color: atlas.text }}
                      >
                        {row.totalRecords.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() =>
                            navigate(
                              `/species?search=${encodeURIComponent(row.species)}`
                            )
                          }
                          className="text-xs font-medium px-3 py-1 rounded transition-colors"
                          style={{
                            color: atlas.teal,
                            background: "rgba(15,118,110,0.08)",
                          }}
                        >
                          View Species →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {mapPoints.length > 0 && (
            <div
              className="rounded-lg bg-white mt-6"
              style={{
                border: `1px solid ${atlas.border}`,
                boxShadow: atlas.shadow,
              }}
            >
              <div
                className="px-6 py-4 border-b"
                style={{ borderColor: atlas.border }}
              >
                <h2
                  className="text-sm font-semibold"
                  style={{ color: atlas.text }}
                >
                  Occurrence Map — {selectedCountry}
                </h2>
                <div
                  className="text-xs mt-1"
                  style={{ color: atlas.textMuted }}
                >
                  {mapPoints.length.toLocaleString()} occurrence points across{" "}
                  {new Set(mapPoints.map((p) => p.species)).size} species
                </div>
              </div>
              <div className="p-4">
                <div
                  className="rounded-lg overflow-hidden"
                  style={{
                    height: 400,
                    background: atlas.grid,
                    position: "relative",
                  }}
                >
                  <MapVisualization points={mapPoints} />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {selectedCountry && speciesList.length === 0 && (
        <div
          className="rounded-lg bg-white p-8 text-center"
          style={{
            border: `1px solid ${atlas.border}`,
            boxShadow: atlas.shadow,
          }}
        >
          <div className="text-sm" style={{ color: atlas.textMuted }}>
            No tick species recorded in {selectedCountry}
          </div>
        </div>
      )}
    </div>
  );
}

const PALETTE = [
  "#0F766E",
  "#D97706",
  "#DC2626",
  "#2563EB",
  "#7C3AED",
  "#DB2777",
  "#059669",
  "#EA580C",
  "#4F46E5",
  "#9333EA",
  "#0891B2",
  "#B45309",
];

function MapVisualization({
  points,
}: {
  points: { lat: number; lng: number; species: string }[];
}) {
  const speciesList = useMemo(() => {
    const s = new Set(points.map((p) => p.species));
    return Array.from(s).sort();
  }, [points]);

  const colorMap = useMemo(() => {
    const m: Record<string, string> = {};
    speciesList.forEach((sp, i) => {
      m[sp] = PALETTE[i % PALETTE.length];
    });
    return m;
  }, [speciesList]);

  const bounds = useMemo(() => {
    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity;
    for (const p of points) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    }
    const pad = 0.05;
    return {
      minLat: minLat - pad,
      maxLat: maxLat + pad,
      minLng: minLng - pad,
      maxLng: maxLng + pad,
    };
  }, [points]);

  const latRange = bounds.maxLat - bounds.minLat;
  const lngRange = bounds.maxLng - bounds.minLng;

  return (
    <div className="relative w-full h-full">
      <svg viewBox="0 0 800 400" className="w-full h-full">
        <rect width="800" height="400" fill="#EEF0F3" rx={8} />
        {points.map((p, i) => {
          const x =
            ((p.lng - bounds.minLng) / lngRange) * 760 + 20;
          const y =
            ((bounds.maxLat - p.lat) / latRange) * 360 + 20;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={3}
              fill={colorMap[p.species]}
              opacity={0.7}
            />
          );
        })}
      </svg>
      {speciesList.length <= 12 && (
        <div
          className="absolute bottom-3 right-3 rounded-lg p-3"
          style={{
            background: "rgba(255,255,255,0.95)",
            border: `1px solid ${atlas.border}`,
            fontSize: 10,
          }}
        >
          {speciesList.map((sp) => (
            <div key={sp} className="flex items-center gap-2 mb-1 last:mb-0">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: colorMap[sp] }}
              />
              <span style={{ color: atlas.text }}>{sp}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
