import { lazy, ComponentType } from "react";

type ComponentLoader = () => Promise<{ default: ComponentType<any> }>;

interface RouteDef {
  Component: ComponentType<any>;
  preload: () => Promise<void>;
}

function def(loader: ComponentLoader): RouteDef {
  let promise: Promise<{ default: ComponentType<any> }> | null = null;
  const start = () => {
    if (!promise) promise = loader().catch((err) => {
      promise = null;
      throw err;
    });
    return promise;
  };
  return {
    Component: lazy(start),
    preload: () => start().then(() => undefined),
  };
}

export const routes = {
  map: def(() => import("../components/map/MapPage").then((m) => ({ default: m.MapPage }))),
  trends: def(() => import("../components/trends/Trends").then((m) => ({ default: m.Trends }))),
  speciesList: def(() => import("../components/species/SpeciesList").then((m) => ({ default: m.SpeciesList }))),
  speciesPage: def(() => import("../components/species/SpeciesPage").then((m) => ({ default: m.SpeciesPage }))),
  diseaseList: def(() => import("../components/disease/DiseaseList").then((m) => ({ default: m.DiseaseList }))),
  diseasePage: def(() => import("../components/disease/DiseasePage").then((m) => ({ default: m.DiseasePage }))),
  febrile: def(() => import("../components/febrile/FebrilePathogens").then((m) => ({ default: m.FebrilePathogens }))),
  environmental: def(() => import("../components/rc/ReproductivePotential").then((m) => ({ default: m.ReproductivePotential }))),
  health: def(() => import("../components/health/HealthAccess").then((m) => ({ default: m.HealthAccess }))),
  references: def(() => import("../components/references/References").then((m) => ({ default: m.References }))),
  about: def(() => import("../components/about/About").then((m) => ({ default: m.About }))),
};

export type RouteKey = keyof typeof routes;

export function preloadRoute(key: RouteKey) {
  routes[key].preload().catch(() => {});
}
