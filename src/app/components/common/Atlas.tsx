import type { ReactNode } from "react";
import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { downloadFigurePng } from "../../lib/exportFigure";

export const atlas = {
  bg: "#F4F6F8",
  card: "#FFFFFF",
  border: "#E5E9EF",
  borderStrong: "#D7DCE3",
  grid: "#EEF0F3",
  text: "#111827",
  textSub: "#6B7280",
  textMuted: "#9CA3AF",
  teal: "#0F766E",
  amber: "#D97706",
  red: "#DC2626",
  blue: "#2563EB",
  shadow: "0 1px 2px rgba(16,24,40,0.05)",
};

export const tooltipStyle = {
  borderRadius: 8,
  border: "1px solid #E5E9EF",
  fontSize: 12,
  fontFamily: "monospace",
  background: "#FFFFFF",
  boxShadow: "0 4px 12px rgba(16,24,40,0.08)",
  padding: "8px 12px",
};

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: atlas.text }}>{title}</h1>
        {subtitle && <div className="text-[13px] mt-1" style={{ color: atlas.textSub }}>{subtitle}</div>}
      </div>
      {right && <div className="flex items-center gap-3">{right}</div>}
    </div>
  );
}

export interface StatItem {
  label: string;
  value: string | number;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
}

export function StatCards({ items, className = "grid-cols-2 lg:grid-cols-4" }: { items: StatItem[]; className?: string }) {
  return (
    <div className={`grid gap-3 mb-6 ${className}`}>
      {items.map((s) => (
        <div
          key={s.label}
          className={"rounded-lg bg-white px-5 py-4 " + (s.onClick ? "cursor-pointer transition-shadow hover:shadow-md " : "")}
          style={{
            border: "1px solid " + (s.active ? "#8FBDB7" : atlas.border),
            boxShadow: s.active ? `0 0 0 1px ${atlas.teal} inset` : atlas.shadow,
          }}
          onClick={s.onClick}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: s.active ? atlas.teal : atlas.textMuted }}>
            {s.label}
          </div>
          <div className="text-2xl font-semibold mt-1" style={{ color: atlas.text, fontFamily: "monospace" }}>
            {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
          </div>
          {s.hint && <div className="text-[11px] mt-1" style={{ color: atlas.textSub }}>{s.hint}</div>}
        </div>
      ))}
    </div>
  );
}

export function Panel({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={"rounded-lg bg-white overflow-hidden " + className} style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
      {title && (
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid #EFF1F4" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: atlas.text }}>{title}</h3>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-5 flex-wrap px-4 py-3 mb-6 rounded-lg bg-white" style={{ border: `1px solid ${atlas.border}`, boxShadow: atlas.shadow }}>
      {children}
    </div>
  );
}

export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: atlas.textMuted }}>{label}</span>
      {children}
    </div>
  );
}

export function Select({ value, onChange, children, minWidth = 150 }: { value: string; onChange: (v: string) => void; children: ReactNode; minWidth?: number }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[13px] px-3 py-1.5 outline-none rounded-md cursor-pointer bg-white"
      style={{ border: `1px solid ${atlas.borderStrong}`, color: atlas.text, minWidth }}
    >
      {children}
    </select>
  );
}

export interface MenuOption {
  value: string;
  label: string;
  sub?: string;
  dot?: string;
}

/** Polished combobox (right-click friendly): click the trigger to type, arrow-key
 *  to move, Enter to select, Esc to close, click outside to dismiss. */
export function MenuSelect({
  value,
  options,
  onChange,
  placeholder = "Select…",
  searchable = false,
  minWidth = 180,
  includeClear = false,
}: {
  value: string;
  options: MenuOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  searchable?: boolean;
  minWidth?: number;
  includeClear?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!searchable || !query) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => (o.label + " " + (o.sub ?? "")).toLowerCase().includes(q));
  }, [options, searchable, query]);

  const selected = options.find((o) => o.value === value);

  const openMenu = useCallback(() => {
    setQuery("");
    setHi(0);
    setOpen(true);
    if (searchable) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [searchable]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${hi}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, hi, filtered]);

  const choose = useCallback((v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  }, [onChange]);

  const listLen = filtered.length;

  return (
    <div ref={wrapRef} className="relative inline-block align-top">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) { openMenu(); return; }
            setHi((h) => e.key === "ArrowDown" ? Math.min(listLen - 1, h + 1) : Math.max(0, h - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (!open) { openMenu(); return; }
            const o = filtered[hi];
            if (o) choose(o.value);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="flex items-center justify-between gap-2 text-[13px] px-3 py-1.5 outline-none rounded-md cursor-pointer bg-white"
        style={{
          border: `1px solid ${open ? atlas.teal : atlas.borderStrong}`,
          color: atlas.text,
          minWidth,
          boxShadow: open ? `0 0 0 2px rgba(15,118,110,0.12)` : "none",
          transition: "border-color 120ms ease",
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate" style={{ color: selected ? atlas.text : atlas.textMuted }}>
          {selected ? selected.label : placeholder}
        </span>
        <svg width="12" height="12" viewBox="0 0 16 16" style={{ color: atlas.textMuted, transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms ease" }}>
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 overflow-hidden rounded-lg shadow-lg"
          style={{ left: 0, right: 0, minWidth, background: "#FFFFFF", border: `1px solid ${atlas.borderStrong}`, boxShadow: "0 8px 24px rgba(16,24,40,0.12)" }}
          role="listbox"
        >
          {searchable && (
            <div className="p-1.5" style={{ borderBottom: `1px solid ${atlas.grid}` }}>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHi(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(listLen - 1, h + 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
                  else if (e.key === "Enter") { e.preventDefault(); const o = filtered[hi]; if (o) choose(o.value); }
                }}
                placeholder="Type to filter…"
                className="w-full text-[12px] px-2 py-1.5 outline-none rounded-[6px]"
                style={{ border: `1px solid ${atlas.border}`, color: atlas.text, background: atlas.bg }}
              />
            </div>
          )}
          <div ref={listRef} className="max-h-56 overflow-y-auto py-1" onMouseMove={(e) => {
            const t = (e.target as HTMLElement).closest("[data-idx]") as HTMLElement | null;
            if (t) setHi(Number(t.dataset.idx));
          }}>
            {includeClear && (
              <div
                data-idx={-1}
                className="flex items-center gap-2 px-3 py-1.5 text-[12px] cursor-pointer font-medium"
                style={{ color: atlas.textSub, background: value ? "transparent" : "#ECF6F4" }}
                onClick={() => choose("")}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: atlas.borderStrong }} />
                All
              </div>
            )}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-[12px]" style={{ color: atlas.textMuted }}>No matches</div>
            )}
            {filtered.map((o, i) => {
              const on = o.value === value;
              return (
                <div
                  key={o.value}
                  data-idx={i}
                  className="flex items-center gap-2 px-3 py-1.5 text-[12px] cursor-pointer select-none"
                  style={{
                    background: hi === i ? "#F1F7F6" : "transparent",
                    color: on ? atlas.teal : atlas.text,
                    fontWeight: on ? 600 : 400,
                  }}
                  onClick={() => choose(o.value)}
                >
                  {o.dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.dot }} />}
                  <span className="truncate flex-1">{o.label}{o.sub ? <span className="ml-1.5" style={{ color: atlas.textMuted, fontWeight: 400 }}>{o.sub}</span> : null}</span>
                  {on && (
                    <svg width="12" height="12" viewBox="0 0 16 16" style={{ color: atlas.teal }}>
                      <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function Chip({ children, tone = "teal" }: { children: ReactNode; tone?: "teal" | "amber" }) {
  const colors = tone === "amber" ? { bg: "#FEF3E2", fg: "#B45309", border: "#F5D9AC" } : { bg: "#ECF6F4", fg: "#0F766E", border: "#CFE3E0" };
  return (
    <span className="text-[12px] font-medium rounded-full px-3 py-1" style={{ background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}` }}>
      {children}
    </span>
  );
}

export function FigureExportButton({ targetRef, captureFn, filename = "figure.png" }: { targetRef?: React.RefObject<HTMLElement>; captureFn?: () => HTMLCanvasElement; filename?: string }) {
  const [exporting, setExporting] = useState(false);
  const handleClick = async () => {
    setExporting(true);
    try {
      if (captureFn) {
        await downloadFigurePng(captureFn, filename);
      } else if (targetRef?.current) {
        await downloadFigurePng(targetRef.current, filename);
      }
    } finally {
      setExporting(false);
    }
  };
  return (
    <button
      onClick={handleClick}
      disabled={exporting}
      className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1.5"
      style={{
        borderColor: atlas.border,
        background: atlas.card,
        color: atlas.textSub,
        cursor: exporting ? "not-allowed" : "pointer",
        opacity: exporting ? 0.6 : 1,
      }}
      title="Download figure as PNG"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <span>{exporting ? "Saving..." : "PNG"}</span>
    </button>
  );
}

export function SourceNote({ children }: { children?: ReactNode }) {
  return (
    <p className="text-[11px] mt-5" style={{ color: atlas.textMuted }}>
      {children ?? "Source: African Tick Atlas — GBIF occurrence records combined with a systematic review of tick-borne disease literature across Africa."}
    </p>
  );
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[55vh]">
      <span className="text-[12px]" style={{ color: atlas.textMuted }}>Loading data...</span>
    </div>
  );
}
