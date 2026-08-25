import { Router, Request, Response } from "express";
import {
  fetchAndStoreGenBank,
  getGenBankRecords,
  findClosestRecords,
  getGenBankStats,
  normalizeSpecies,
} from "../lib/genbank.js";

export const genbankRouter = Router();

genbankRouter.get("/stats/:species", async (req: Request, res: Response) => {
  try {
    const species = normalizeSpecies(req.params.species as string);
    let stats = await getGenBankStats(species);
    if (stats.total === 0) {
      await fetchAndStoreGenBank(species);
      stats = await getGenBankStats(species);
    }
    res.json(stats);
  } catch (error) {
    console.error("GenBank stats error:", error);
    res.status(500).json({ error: "Failed to fetch GenBank stats" });
  }
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
    const gene = req.query.gene as string | undefined;
    const search = req.query.search as string | undefined;
    const sortBy = (req.query.sortBy as string) || "accession";
    const sortDir = (req.query.sortDir as string) === "desc" ? "desc" : "asc";
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string, 10) || 50));

    let records = await getGenBankRecords(species);

    if (records.length === 0) {
      records = await fetchAndStoreGenBank(species);
    }

    if (gene) {
      records = records.filter((r) => r.gene === gene);
    }

    if (search) {
      const q = search.toLowerCase();
      records = records.filter(
        (r) =>
          (r.accession && r.accession.toLowerCase().includes(q)) ||
          (r.definition && r.definition.toLowerCase().includes(q)) ||
          (r.host && r.host.toLowerCase().includes(q)) ||
          (r.location && r.location.toLowerCase().includes(q))
      );
    }

    let matched = records;
    if (lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
      matched = findClosestRecords(records, lat, lon, radiusKm).map((m) => m.record);
    }

    const sortField = ["accession", "gene", "sequenceLength", "country", "host", "collectionDate"].includes(sortBy)
      ? sortBy
      : "accession";
    matched.sort((a, b) => {
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "desc" ? bv - av : av - bv;
      }
      const cmp = String(av).localeCompare(String(bv));
      return sortDir === "desc" ? -cmp : cmp;
    });

    const total = matched.length;
    const start = (page - 1) * limit;
    const paged = matched.slice(start, start + limit);

    const withDistance = lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)
      ? findClosestRecords(records, lat, lon, radiusKm)
          .filter((m) => paged.some((p) => p.accession === m.record.accession))
      : paged.map((r) => ({ record: r, distanceKm: null }));

    const ordered = paged.map((r) => {
      const match = withDistance.find((m) => m.record.accession === r.accession);
      return match || { record: r, distanceKm: null };
    });

    res.json({
      species,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      records: ordered,
    });
  } catch (error) {
    console.error("GenBank error:", error);
    res.status(500).json({
      error: "Failed to fetch GenBank records",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
