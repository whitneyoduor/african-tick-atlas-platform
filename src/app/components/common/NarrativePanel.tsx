interface NarrativePoint {
  title: string;
  text: string;
}

export function NarrativePanel({
  kicker,
  headline,
  points,
  takeaway,
}: {
  kicker?: string;
  headline: string;
  points: NarrativePoint[];
  takeaway?: string;
}) {
  return (
    <div
      className="mb-6 rounded-lg p-6"
      style={{ border: "1px solid #CFE3E0", background: "linear-gradient(135deg, #F0FDFA 0%, #FFFFFF 55%)", boxShadow: "0 1px 2px rgba(16,24,40,0.05)" }}
    >
      {kicker && (
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#0F766E" }}>
          {kicker}
        </div>
      )}
      <h3 className="text-base font-semibold leading-snug" style={{ color: "#111827" }}>{headline}</h3>
      <div className="mt-4 space-y-3">
        {points.map((p) => (
          <div key={p.title} className="flex gap-3">
            <div className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#D97706" }} />
            <p className="text-[13px] leading-relaxed" style={{ color: "#4B5563" }}>
              <strong style={{ color: "#111827" }}>{p.title}: </strong>
              {p.text}
            </p>
          </div>
        ))}
      </div>
      {takeaway && (
        <div className="mt-4 pl-4 border-l-2 text-[13px] italic leading-relaxed" style={{ borderColor: "#D97706", color: "#6B7280" }}>
          {takeaway}
        </div>
      )}
    </div>
  );
}
