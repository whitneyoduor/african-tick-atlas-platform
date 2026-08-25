import { Router, Request, Response } from "express";
import {
  searchGenBank,
  findClosestRecords,
  getCachedSpecies,
  normalizeSpecies,
} from "../lib/genbank.js";

export const genbankRouter = Router();

genbankRouter.get("/cached", (_req: Request, res: Response) => {
  const species = getCachedSpecies();
  res.json({
    species,
    count: species.length,
  });
});

genbankRouter.get("/:species", async (req: Request, res: Response) => {
  try {
    const rawSpecies = req.params.species as string;
    const species = normalizeSpecies(rawSpecies);

    const lat = req.query.lat ? parseFloat(req.query.lat as string) : null;
    const lon = req.query.lng ? parseFloat(req.query.lng as string) : null;
    const radiusKm = req.query.radius
      ? parseFloat(req.query.radius as string)
      : 5000;

    const records = await searchGenBank(species);

    if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
      const matched = findClosestRecords(records, lat, lon, radiusKm);
      res.json({
        species,
        query: { lat, lon, radiusKm },
        total: records.length,
        matched: matched.length,
        records: matched,
      });
    } else {
      res.json({
        species,
        query: null,
        total: records.length,
        matched: records.length,
        records: records.map((r) => ({ record: r, distanceKm: null })),
      });
    }
  } catch (error) {
    console.error("GenBank error:", error);
    res.status(500).json({
      error: "Failed to fetch GenBank records",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
