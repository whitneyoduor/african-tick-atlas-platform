import type { ReactNode } from "react";

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

export function Chip({ children, tone = "teal" }: { children: ReactNode; tone?: "teal" | "amber" }) {
  const colors = tone === "amber" ? { bg: "#FEF3E2", fg: "#B45309", border: "#F5D9AC" } : { bg: "#ECF6F4", fg: "#0F766E", border: "#CFE3E0" };
  return (
    <span className="text-[12px] font-medium rounded-full px-3 py-1" style={{ background: colors.bg, color: colors.fg, border: `1px solid ${colors.border}` }}>
      {children}
    </span>
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
