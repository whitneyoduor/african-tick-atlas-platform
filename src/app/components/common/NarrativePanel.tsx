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
      className="mb-6 rounded-lg border p-6"
      style={{ borderColor: "#E2E5DE", background: "linear-gradient(135deg, #F0F5F1 0%, #FFFFFF 55%)" }}
    >
      {kicker && (
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#134E4A" }}>
          {kicker}
        </div>
      )}
      <h3 className="text-base font-semibold leading-snug" style={{ color: "#1C1917" }}>{headline}</h3>
      <div className="mt-4 space-y-3">
        {points.map((p) => (
          <div key={p.title} className="flex gap-3">
            <div className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#D97706" }} />
            <p className="text-[13px] leading-relaxed" style={{ color: "#44403C" }}>
              <strong style={{ color: "#1C1917" }}>{p.title}: </strong>
              {p.text}
            </p>
          </div>
        ))}
      </div>
      {takeaway && (
        <div className="mt-4 pl-4 border-l-2 text-[13px] italic leading-relaxed" style={{ borderColor: "#D97706", color: "#57534E" }}>
          {takeaway}
        </div>
      )}
    </div>
  );
}
