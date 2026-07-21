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
const ApiExplorer = lazy(() => import("./components/api/ApiExplorer").then(m => ({ default: m.ApiExplorer })));
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
          <Route path="api" element={<Suspense fallback={<Loading />}><ApiExplorer /></Suspense>} />
          <Route path="about" element={<Suspense fallback={<Loading />}><About /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
