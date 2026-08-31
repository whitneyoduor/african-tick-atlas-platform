import { Suspense } from "react";
import { BrowserRouter, Routes, Route, useParams, Navigate } from "react-router";
import { Layout } from "./components/layout/Layout";
import { routes } from "./lib/lazyRoutes";

const { Component: MapPage } = routes.map;
const { Component: Trends } = routes.trends;
const { Component: SpeciesList } = routes.speciesList;
const { Component: SpeciesPage } = routes.speciesPage;
const { Component: DiseaseList } = routes.diseaseList;
const { Component: DiseasePage } = routes.diseasePage;
const { Component: FebrilePathogens } = routes.febrile;
const { Component: ReproductivePotential } = routes.environmental;
const { Component: HealthAccess } = routes.health;
const { Component: References } = routes.references;
const { Component: About } = routes.about;

function SpeciesPageWrapper() {
  const { name } = useParams();
  return <SpeciesPage key={name} />;
}

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
          <Route path="species/:name" element={<Suspense fallback={<Loading />}><SpeciesPageWrapper /></Suspense>} />
          <Route path="diseases" element={<Suspense fallback={<Loading />}><DiseaseList /></Suspense>} />
          <Route path="diseases/:name" element={<Suspense fallback={<Loading />}><DiseasePage /></Suspense>} />
          <Route path="febrile" element={<Suspense fallback={<Loading />}><FebrilePathogens /></Suspense>} />
          <Route path="environmental" element={<Suspense fallback={<Loading />}><ReproductivePotential /></Suspense>} />
          <Route path="health" element={<Navigate to="/climsynoptick" replace />} />
          <Route path="climsynoptick" element={<Suspense fallback={<Loading />}><HealthAccess /></Suspense>} />
          <Route path="references" element={<Suspense fallback={<Loading />}><References /></Suspense>} />
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
