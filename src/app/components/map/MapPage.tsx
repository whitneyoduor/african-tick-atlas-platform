import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { TickMap } from "./TickMap";
import { fetchMetaCounts, fetchTicks, type TickRecord, type MetaCounts } from "../../lib/api";

type Layer = "occurrence" | "richness" | "hosts" | "disease" | "prevalence" | "density";

interface Filters {
  species: string;
  country: string;
  host: string;
  disease: string;
  method: string;
  yearFrom: string;
  yearTo: string;
}

const EMPTY_FILTERS: Filters = { species: "", country: "", host: "", disease: "", method: "", yearFrom: "", yearTo: "" };

function SearchableSelect({ value, options, placeholder, label, onChange }: {
  value: string;
  options: { name: string; count?: number }[];
  placeholder: string;
  label?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  const handleFocus = useCallback(() => { setOpen(true); setQuery(""); }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const displayText = value || "";

  return (
    <div ref={wrapRef} className="relative">
      {label && <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>{label}</label>}
      <input
        ref={inputRef}
        type="text"
        value={open ? query : displayText}
        placeholder={placeholder}
        readOnly={!open}
        onFocus={handleFocus}
        onClick={handleFocus}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full text-xs border rounded px-3 py-2"
        style={{ borderColor: "var(--border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded shadow-lg" style={{ background: "var(--card-bg)", border: "1px solid var(--border)" }}>
          {value && (
            <div
              className="px-3 py-1.5 text-xs cursor-pointer font-medium"
              style={{ color: "var(--text-muted)" }}
              onMouseDown={(e) => { e.preventDefault(); onChange(""); setOpen(false); setQuery(""); }}
            >
              Clear selection
            </div>
          )}
          {filtered.length === 0 && (
            <div className="px-3 py-1.5 text-xs" style={{ color: "var(--text-muted)" }}>No matches</div>
          )}
          {filtered.map((o) => (
            <div
              key={o.name}
              className="px-3 py-1.5 text-xs cursor-pointer"
              style={{
                background: value === o.name ? "var(--accent-teal-light)" : "transparent",
                color: value === o.name ? "var(--accent-teal)" : "var(--text-primary)",
              }}
              onMouseDown={(e) => { e.preventDefault(); onChange(o.name); setOpen(false); setQuery(""); }}
            >
              {o.name}{o.count != null ? ` (${o.count})` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MapPage() {
  const [activeLayer, setActiveLayer] = useState<Layer>("occurrence");
  const [geoLevel, setGeoLevel] = useState<"points" | "country" | "region">("points");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [meta, setMeta] = useState<MetaCounts | null>(null);
  const [allRecords, setAllRecords] = useState<TickRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<TickRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    Promise.all([
      fetchMetaCounts(ctrl.signal),
      fetchTicks({ limit: 50000, signal: ctrl.signal }),
    ])
      .then(([m, r]) => {
        setMeta(m);
        setAllRecords(r.data);
        setFilteredRecords(r.data);
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    const hasFilters = filters.species || filters.country || filters.host || filters.disease || filters.method || filters.yearFrom || filters.yearTo;
    if (!hasFilters) {
      setFilteredRecords(allRecords);
      return;
    }
    const ctrl = new AbortController();
    fetchTicks({
      species: filters.species || undefined,
      country: filters.country || undefined,
      host: filters.host || undefined,
      disease: filters.disease || undefined,
      yearStart: filters.yearFrom ? Number(filters.yearFrom) : undefined,
      yearEnd: filters.yearTo ? Number(filters.yearTo) : undefined,
      limit: 50000,
      signal: ctrl.signal,
    })
      .then((r) => {
        let rows = r.data;
        if (filters.method) rows = rows.filter((rec) => rec.methodOfExtraction === filters.method);
        setFilteredRecords(rows);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [filters.species, filters.country, filters.host, filters.disease, filters.method, filters.yearFrom, filters.yearTo, allRecords]);

  const methods = useMemo(() => {
    const s = new Set<string>();
    allRecords.forEach((r) => { if (r.methodOfExtraction) s.add(r.methodOfExtraction); });
    return Array.from(s).sort();
  }, [allRecords]);

  const yearRange = useMemo(() => {
    if (!meta) return { min: "", max: "" };
    return {
      min: meta.yearRange.min ? String(meta.yearRange.min) : "",
      max: meta.yearRange.max ? String(meta.yearRange.max) : "",
    };
  }, [meta]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const layers: { id: Layer; label: string; color: string; activeBg: string; activeText: string; activeRing: string }[] = [
    { id: "occurrence", label: "Tick Occurrence", color: "var(--accent-teal)", activeBg: "var(--accent-teal-light)", activeText: "var(--accent-teal)", activeRing: "var(--accent-teal-light)" },
    { id: "richness", label: "Species Richness", color: "var(--accent-indigo)", activeBg: "#EEF2FF", activeText: "#4338CA", activeRing: "#EEF2FF" },
    { id: "hosts", label: "Host Diversity", color: "var(--accent-amber)", activeBg: "var(--accent-amber-light)", activeText: "#B45309", activeRing: "var(--accent-amber-light)" },
    { id: "disease", label: "Associated diseases", color: "var(--accent-red)", activeBg: "var(--accent-red-light)", activeText: "var(--accent-red)", activeRing: "var(--accent-red-light)" },
    { id: "prevalence", label: "Prevalence", color: "var(--accent-blue)", activeBg: "#FDF2F8", activeText: "#BE185D", activeRing: "#FDF2F8" },
    { id: "density", label: "Density", color: "var(--accent-red)", activeBg: "#FFF1F2", activeText: "#BE123C", activeRing: "#FFF1F2" },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-[calc(100vh-120px)]" style={{ background: "var(--page-bg)" }}>
      <div className="animate-spin rounded-full h-5 w-5 border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent-teal)" }} />
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-120px)]">
      {/* Left panel - Layer controls */}
      <div className="w-56 flex flex-col overflow-y-auto" style={{ background: "var(--card-bg)", borderRight: "1px solid var(--border)" }}>
        <div className="p-4 border-b" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-primary)" }}>Map Layers</h3>
        </div>
        <div className="p-3 space-y-1">
          {layers.map((layer) => (
            <button
              key={layer.id}
              onClick={() => setActiveLayer(layer.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-xs font-medium transition-colors"
              style={{
                color: activeLayer === layer.id ? layer.activeText : "var(--text-muted)",
                background: activeLayer === layer.id ? layer.activeBg : "transparent",
                boxShadow: activeLayer === layer.id ? `inset 0 0 0 1px ${layer.activeRing}` : "none",
              }}
            >
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: layer.color }} />
              <span>{layer.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-auto p-4 border-t" style={{ borderColor: "var(--border)" }}>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Geography</h4>
          <div className="flex flex-col gap-1">
            {(["points", "country", "region"] as const).map((level) => (
              <button
                key={level}
                onClick={() => setGeoLevel(level)}
                className="text-xs px-3 py-1.5 rounded font-medium transition-colors"
                style={{
                  color: geoLevel === level ? "var(--text-primary)" : "var(--text-muted)",
                  background: geoLevel === level ? "var(--page-bg)" : "transparent",
                }}
              >
                {level === "points" ? "Point Data" : level === "country" ? "By Country" : "By Region"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Center - Map */}
      <div className="flex-1 relative">
        <TickMap activeLayer={activeLayer} records={filteredRecords} />

        <div className="absolute top-3 left-3 flex gap-2">
          <SearchableSelect
            value={filters.species}
            options={meta?.species || []}
            placeholder="All Species"
            onChange={(v) => setFilter("species", v)}
          />
          <select
            value={filters.country}
            onChange={(e) => setFilter("country", e.target.value)}
            className="text-xs border rounded px-2.5 py-1.5 shadow-sm"
            style={{ borderColor: "var(--border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
          >
            <option value="">All Countries</option>
            {meta?.countries.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <select
            value={filters.yearFrom}
            onChange={(e) => setFilter("yearFrom", e.target.value)}
            className="text-xs border rounded px-2.5 py-1.5 shadow-sm"
            style={{ borderColor: "var(--border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
          >
            <option value="">All Years</option>
            {yearRange.min && yearRange.max && Array.from(
              { length: Number(yearRange.max) - Number(yearRange.min) + 1 },
              (_, i) => Number(yearRange.min) + i
            ).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Result count */}
        <div className="absolute bottom-3 left-3 text-[11px] px-2.5 py-1 rounded" style={{ background: "var(--card-bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
          {filteredRecords.length.toLocaleString()} of {meta?.totalRecords.toLocaleString() || allRecords.length.toLocaleString()} records
        </div>

        {activeLayer === "disease" && (
          <div className="absolute bottom-3 right-3 z-10 px-3 py-2.5 rounded" style={{ background: "rgba(255,255,255,0.97)", border: "1px solid var(--border)" }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>Associated Diseases</div>
            <div className="flex flex-col gap-1">
              {([
                ["Rickettsia spp.", "#DC2626"],
                ["Anaplasma spp.", "#EA580C"],
                ["Ehrlichia spp.", "#D97706"],
                ["CCHFV", "#7C3AED"],
                ["Coxiella burnetii", "#2563EB"],
                ["Babesia spp.", "#059669"],
                ["Theileria spp.", "#0891B2"],
                ["Borrelia spp.", "#4F46E5"],
                ["Other", "#6B7280"],
              ] as [string, string][]).map(([label, color]) => (
                <div key={label} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                  <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right panel - Filters */}
      <div className="w-64 overflow-y-auto" style={{ background: "var(--card-bg)", borderLeft: "1px solid var(--border)" }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-primary)" }}>Filters</h3>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-[10px] underline" style={{ color: "var(--accent-teal)" }}>
              Clear all
            </button>
          )}
        </div>
        <div className="p-4 space-y-4">
          <div>
            <SearchableSelect
              value={filters.species}
              options={meta?.species || []}
              placeholder={`All species (${meta?.species.length || 0})`}
              label="Species"
              onChange={(v) => setFilter("species", v)}
            />
          </div>

          <div>
            <SearchableSelect
              value={filters.disease}
              options={meta?.diseases || []}
              placeholder={`All diseases (${meta?.diseases.length || 0})`}
              label="Associated diseases"
              onChange={(v) => setFilter("disease", v)}
            />
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>Country</label>
            <select
              value={filters.country}
              onChange={(e) => setFilter("country", e.target.value)}
              className="w-full text-xs border rounded px-3 py-2"
              style={{ borderColor: "var(--border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
            >
              <option value="">All countries ({meta?.countries.length || 0})</option>
              {meta?.countries.map((c) => <option key={c.name} value={c.name}>{c.name} ({c.count})</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>Host</label>
            <select
              value={filters.host}
              onChange={(e) => setFilter("host", e.target.value)}
              className="w-full text-xs border rounded px-3 py-2"
              style={{ borderColor: "var(--border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
            >
              <option value="">All hosts ({meta?.hosts.length || 0})</option>
              {meta?.hosts.map((h) => <option key={h.name} value={h.name}>{h.name} ({h.count})</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>Collection Method</label>
            <select
              value={filters.method}
              onChange={(e) => setFilter("method", e.target.value)}
              className="w-full text-xs border rounded px-3 py-2"
              style={{ borderColor: "var(--border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
            >
              <option value="">All methods ({methods.length})</option>
              {methods.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>Year Range</label>
            <div className="flex gap-2">
              <input
                type="number"
                placeholder={yearRange.min || "From"}
                value={filters.yearFrom}
                onChange={(e) => setFilter("yearFrom", e.target.value)}
                className="w-full text-xs border rounded px-3 py-2"
                style={{ borderColor: "var(--border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
              />
              <input
                type="number"
                placeholder={yearRange.max || "To"}
                value={filters.yearTo}
                onChange={(e) => setFilter("yearTo", e.target.value)}
                className="w-full text-xs border rounded px-3 py-2"
                style={{ borderColor: "var(--border)", background: "var(--card-bg)", color: "var(--text-primary)" }}
              />
            </div>
          </div>

          {activeFilterCount > 0 && (
            <div className="pt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <h4 className="text-xs font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Active Filters</h4>
              <div className="flex flex-wrap gap-1.5">
                {filters.species && (
                  <span className="text-[10px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "var(--accent-teal-light)", color: "var(--accent-teal)" }}>
                    {filters.species}
                    <button onClick={() => setFilter("species", "")} className="font-bold ml-0.5">&times;</button>
                  </span>
                )}
                {filters.country && (
                  <span className="text-[10px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "var(--accent-teal-light)", color: "var(--accent-teal)" }}>
                    {filters.country}
                    <button onClick={() => setFilter("country", "")} className="font-bold ml-0.5">&times;</button>
                  </span>
                )}
                {filters.host && (
                  <span className="text-[10px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "var(--accent-amber-light)", color: "var(--accent-amber)" }}>
                    {filters.host}
                    <button onClick={() => setFilter("host", "")} className="font-bold ml-0.5">&times;</button>
                  </span>
                )}
                {filters.disease && (
                  <span className="text-[10px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "var(--accent-red-light)", color: "var(--accent-red)" }}>
                    {filters.disease}
                    <button onClick={() => setFilter("disease", "")} className="font-bold ml-0.5">&times;</button>
                  </span>
                )}
                {filters.method && (
                  <span className="text-[10px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "#EEF2FF", color: "var(--accent-indigo)" }}>
                    {filters.method}
                    <button onClick={() => setFilter("method", "")} className="font-bold ml-0.5">&times;</button>
                  </span>
                )}
                {filters.yearFrom && (
                  <span className="text-[10px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "var(--page-bg)", color: "var(--text-secondary)" }}>
                    From {filters.yearFrom}
                    <button onClick={() => setFilter("yearFrom", "")} className="font-bold ml-0.5">&times;</button>
                  </span>
                )}
                {filters.yearTo && (
                  <span className="text-[10px] px-2 py-0.5 rounded flex items-center gap-1" style={{ background: "var(--page-bg)", color: "var(--text-secondary)" }}>
                    To {filters.yearTo}
                    <button onClick={() => setFilter("yearTo", "")} className="font-bold ml-0.5">&times;</button>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
