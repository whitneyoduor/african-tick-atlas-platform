import { useNavigate } from "react-router";

export function Footer() {
  const navigate = useNavigate();

  return (
    <footer style={{ background: "#134E4A", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
      <div className="max-w-7xl mx-auto px-6 py-3">
        <div className="flex justify-between items-center text-[10px]">
          <span style={{ color: "rgba(255,255,255,0.4)" }}>&copy; {new Date().getFullYear()} African Tick Surveillance Atlas. ICIPE.</span>
          <div className="flex gap-4">
            <button onClick={() => navigate("/about")} style={{ color: "rgba(255,255,255,0.4)" }} className="hover:underline">About</button>
            <button onClick={() => navigate("/downloads")} style={{ color: "rgba(255,255,255,0.4)" }} className="hover:underline">Downloads</button>
            <button onClick={() => navigate("/api")} style={{ color: "rgba(255,255,255,0.4)" }} className="hover:underline">API</button>
          </div>
        </div>
      </div>
    </footer>
  );
}
