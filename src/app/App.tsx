import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router";
import { Layout } from "./components/layout/Layout";

const MapPage = lazy(() => import("./components/map/MapPage").then(m => ({ default: m.MapPage })));
const Trends = lazy(() => import("./components/trends/Trends").then(m => ({ default: m.Trends })));
const SpeciesList = lazy(() => import("./components/species/SpeciesList").then(m => ({ default: m.SpeciesList })));
const SpeciesPage = lazy(() => import("./components/species/SpeciesPage").then(m => ({ default: m.SpeciesPage })));
const DiseaseList = lazy(() => import("./components/disease/DiseaseList").then(m => ({ default: m.DiseaseList })));
const DiseasePage = lazy(() => import("./components/disease/DiseasePage").then(m => ({ default: m.DiseasePage })));
const EnvironmentalLayers = lazy(() => import("./components/environmental/EnvironmentalLayers").then(m => ({ default: m.EnvironmentalLayers })));
const Downloads = lazy(() => import("./components/downloads/Downloads").then(m => ({ default: m.Downloads })));
const About = lazy(() => import("./components/about/About").then(m => ({ default: m.About })));

function Loading() {
  return (
    <div className="flex items-center justify-center h-[50vh]">
      <span className="text-sm" style={{ color: "var(--text-muted)" }}>Loading…</span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Suspense fallback={<Loading />}><MapPage /></Suspense>} />
          <Route path="trends" element={<Suspense fallback={<Loading />}><Trends /></Suspense>} />
          <Route path="species" element={<Suspense fallback={<Loading />}><SpeciesList /></Suspense>} />
          <Route path="species/:name" element={<Suspense fallback={<Loading />}><SpeciesPage /></Suspense>} />
          <Route path="diseases" element={<Suspense fallback={<Loading />}><DiseaseList /></Suspense>} />
          <Route path="diseases/:name" element={<Suspense fallback={<Loading />}><DiseasePage /></Suspense>} />
          <Route path="environmental" element={<Suspense fallback={<Loading />}><EnvironmentalLayers /></Suspense>} />
          <Route path="downloads" element={<Suspense fallback={<Loading />}><Downloads /></Suspense>} />
          <Route path="about" element={<Suspense fallback={<Loading />}><About /></Suspense>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-6 text-center">
      <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>Page not found</h1>
      <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
        The page you are looking for does not exist.
      </p>
      <a
        href="/"
        className="mt-4 text-xs font-medium px-4 py-2 rounded"
        style={{ background: "var(--accent-teal)", color: "#fff" }}
      >
        Back to Maps
      </a>
    </div>
  );
}
