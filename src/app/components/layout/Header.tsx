import { useLocation, useNavigate } from "react-router";
import { useState } from "react";

const navItems = [
  { path: "/", label: "Maps" },
  { path: "/trends", label: "Trends" },
  { path: "/species", label: "Species" },
  { path: "/diseases", label: "Diseases" },
  { path: "/environmental", label: "Environment" },
  { path: "/downloads", label: "Downloads" },
  { path: "/api", label: "API" },
  { path: "/about", label: "About" },
];

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) navigate(`/species?search=${encodeURIComponent(search.trim())}`);
  };

  return (
    <header
      className="sticky top-0 z-50"
      style={{ background: "#134E4A", height: 44 }}
    >
      <div className="flex items-center justify-between h-full px-5 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-6">
          <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
            <div
              className="w-6 h-6 rounded flex items-center justify-center text-[9px] font-bold"
              style={{ background: "rgba(255,255,255,0.15)", color: "#D1FAE5" }}
            >
              AT
            </div>
            <span className="text-[13px] font-semibold" style={{ color: "#FFFFFF", letterSpacing: "-0.01em" }}>
              African Tick Atlas
            </span>
          </button>
          <nav className="flex items-center gap-0">
            {navItems.map((item) => {
              const active = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="px-2.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap"
                  style={{
                    color: active ? "#FFFFFF" : "rgba(255,255,255,0.55)",
                    borderBottom: active ? "2px solid #D97706" : "2px solid transparent",
                    background: "transparent",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <form onSubmit={handleSearch}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search species..."
              className="border rounded px-2.5 py-1 text-[11px] outline-none"
              style={{ borderColor: "rgba(255,255,255,0.2)", color: "#FFFFFF", background: "rgba(255,255,255,0.1)", width: 180 }}
            />
          </form>
        </div>
      </div>
    </header>
  );
}
