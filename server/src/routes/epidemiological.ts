import { Router, Request, Response } from "express";
import prisma from "../db.js";

export const epidemiologicalRouter = Router();

epidemiologicalRouter.get("/", async (req: Request, res: Response) => {
  try {
    const {
      species,
      country,
      host,
      disease,
      yearStart,
      yearEnd,
      page = "1",
      limit = "50",
      search,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(50000, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (species) {
      where.species = { contains: species as string };
    }
    if (country) {
      where.country = { contains: country as string };
    }
    if (host) {
      where.relatedHosts = { contains: host as string };
    }
    if (disease) {
      where.epidemiologicalDisease = { contains: disease as string };
    }
    if (yearStart) {
      const ys = parseInt(yearStart as string, 10);
      if (!isNaN(ys)) where.yearStart = { gte: ys };
    }
    if (yearEnd) {
      const ye = parseInt(yearEnd as string, 10);
      if (!isNaN(ye)) where.yearEnd = { lte: ye };
    }
    if (search) {
      where.OR = [
        { species: { contains: search as string } },
        { country: { contains: search as string } },
        { relatedHosts: { contains: search as string } },
        { epidemiologicalDisease: { contains: search as string } },
        { title: { contains: search as string } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.epidemiologicalRecord.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { id: "asc" },
      }),
      prisma.epidemiologicalRecord.count({ where }),
    ]);

    res.json({
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching epidemiological records:", error);
    res.status(500).json({ error: "Failed to fetch epidemiological records" });
  }
});

epidemiologicalRouter.get("/meta/counts", async (_req: Request, res: Response) => {
  try {
    const [species, countries, hosts, diseases, total, yearStats, incidenceRecords] = await Promise.all([
      prisma.epidemiologicalRecord.groupBy({ by: ["species"], _count: true, orderBy: { _count: { species: "desc" } } }),
      prisma.epidemiologicalRecord.groupBy({ by: ["country"], _count: true, orderBy: { _count: { country: "desc" } } }),
      prisma.epidemiologicalRecord.groupBy({ by: ["relatedHosts"], _count: true, orderBy: { _count: { relatedHosts: "desc" } } }),
      prisma.epidemiologicalRecord.groupBy({ by: ["epidemiologicalDisease"], _count: true, orderBy: { _count: { epidemiologicalDisease: "desc" } } }),
      prisma.epidemiologicalRecord.count(),
      prisma.epidemiologicalRecord.aggregate({ _min: { yearStart: true }, _max: { yearEnd: true } }),
      prisma.epidemiologicalRecord.findMany({
        where: { epidemiologicalIncidences: { not: null } },
        select: { epidemiologicalIncidences: true },
      }),
    ]);

    let totalIncidence = 0;
    let incidenceCount = 0;
    for (const r of incidenceRecords) {
      if (r.epidemiologicalIncidences) {
        const val = parseInt(r.epidemiologicalIncidences, 10);
        if (!isNaN(val)) {
          totalIncidence += val;
          incidenceCount++;
        }
      }
    }
    const incidenceRate = incidenceCount > 0 ? parseFloat(((totalIncidence / incidenceCount) * 1000).toFixed(1)) : null;

    res.json({
      totalRecords: total,
      yearRange: {
        min: yearStats._min.yearStart,
        max: yearStats._max.yearEnd,
      },
      incidence: {
        total: totalIncidence,
        count: incidenceCount,
        ratePer1k: incidenceRate,
      },
      species: species.filter((s) => s.species).map((s) => ({ name: s.species, count: s._count })),
      countries: countries.filter((c) => c.country).map((c) => ({ name: c.country, count: c._count })),
      hosts: hosts.filter((h) => h.relatedHosts).map((h) => ({ name: h.relatedHosts, count: h._count })),
      diseases: diseases.filter((d) => d.epidemiologicalDisease).map((d) => ({ name: d.epidemiologicalDisease, count: d._count })),
    });
  } catch (error) {
    console.error("Error fetching epidemiological metadata:", error);
    res.status(500).json({ error: "Failed to fetch epidemiological metadata" });
  }
});

epidemiologicalRouter.get("/meta/yearly", async (_req: Request, res: Response) => {
  try {
    const records = await prisma.epidemiologicalRecord.findMany({
      where: { yearStart: { not: null } },
      select: { yearStart: true, yearEnd: true, id: true },
    });

    const yearlyCounts: Record<number, number> = {};
    for (const r of records) {
      const start = r.yearStart ?? 0;
      const end = r.yearEnd ?? start;
      for (let y = start; y <= end; y++) {
        yearlyCounts[y] = (yearlyCounts[y] || 0) + 1;
      }
    }

    const years = Object.entries(yearlyCounts)
      .map(([year, count]) => ({ year: parseInt(year), count }))
      .sort((a, b) => a.year - b.year);

    res.json({ data: years });
  } catch (error) {
    console.error("Error fetching yearly data:", error);
    res.status(500).json({ error: "Failed to fetch yearly data" });
  }
});

epidemiologicalRouter.get("/meta/species-detail", async (_req: Request, res: Response) => {
  try {
    const records = await prisma.epidemiologicalRecord.findMany({
      where: { species: { not: null } },
      select: { species: true, epidemiologicalDisease: true, relatedHosts: true, methodOfExtraction: true },
    });

    const isEmpty = (v: string | null) => {
      if (!v) return true;
      const t = v.trim().toLowerCase();
      return t === "" || t === "none" || t === "n/a" || t === "na" || t === "unknown";
    };

    const agg: Record<string, { disease: Record<string, number>; host: Record<string, number>; method: Record<string, number> }> = {};
    for (const r of records) {
      if (!r.species) continue;
      const key = r.species.trim().toLowerCase();
      if (!key) continue;
      const e = (agg[key] ||= { disease: {}, host: {}, method: {} });
      if (!isEmpty(r.epidemiologicalDisease)) {
        const v = r.epidemiologicalDisease!.trim();
        e.disease[v] = (e.disease[v] || 0) + 1;
      }
      if (!isEmpty(r.relatedHosts)) {
        const v = r.relatedHosts!.trim();
        e.host[v] = (e.host[v] || 0) + 1;
      }
      if (!isEmpty(r.methodOfExtraction)) {
        const v = r.methodOfExtraction!.trim();
        e.method[v] = (e.method[v] || 0) + 1;
      }
    }

    const best = (m: Record<string, number>) => {
      let top = "";
      let topN = 0;
      for (const [k, n] of Object.entries(m)) {
        if (n > topN) {
          top = k;
          topN = n;
        }
      }
      return top;
    };

    const speciesMap: Record<string, { disease: string; host: string; method: string }> = {};
    for (const [key, e] of Object.entries(agg)) {
      speciesMap[key] = { disease: best(e.disease), host: best(e.host), method: best(e.method) };
    }
    res.json({ data: speciesMap });
  } catch (error) {
    console.error("Error building species-detail map:", error);
    res.status(500).json({ error: "Failed to build species-detail map" });
  }
});

epidemiologicalRouter.get("/meta/disease-coordinates", async (_req: Request, res: Response) => {
  try {
    const epiRecords = await prisma.epidemiologicalRecord.findMany({
      where: {
        epidemiologicalDisease: { not: null },
        species: { not: null },
      },
      select: { epidemiologicalDisease: true, species: true },
    });

    const diseaseSpeciesMap = new Map<string, Set<string>>();
    for (const r of epiRecords) {
      const disease = r.epidemiologicalDisease!.trim();
      const species = r.species!.trim();
      if (!diseaseSpeciesMap.has(disease)) {
        diseaseSpeciesMap.set(disease, new Set());
      }
      diseaseSpeciesMap.get(disease)!.add(species);
    }

    const allSpecies = [...new Set(epiRecords.map(r => r.species!.trim()))];
    const occurrences = await prisma.occurrence.findMany({
      where: {
        species: { in: allSpecies },
        latitude: { not: null },
        longitude: { not: null },
      },
      select: { species: true, latitude: true, longitude: true },
    });

    const speciesCoordsMap = new Map<string, { lat: number; lng: number }[]>();
    for (const o of occurrences) {
      const sp = o.species!.trim();
      if (!speciesCoordsMap.has(sp)) {
        speciesCoordsMap.set(sp, []);
      }
      speciesCoordsMap.get(sp)!.push({ lat: o.latitude!, lng: o.longitude! });
    }

    const result: Record<string, { points: { lat: number; lng: number }[]; species: string[]; totalPoints: number }> = {};
    for (const [disease, speciesSet] of diseaseSpeciesMap) {
      const allPoints: { lat: number; lng: number }[] = [];
      const speciesList: string[] = [];
      for (const sp of speciesSet) {
        const coords = speciesCoordsMap.get(sp);
        if (coords && coords.length > 0) {
          allPoints.push(...coords);
          speciesList.push(sp);
        }
      }
      if (allPoints.length > 0) {
        result[disease] = {
          points: allPoints,
          species: speciesList,
          totalPoints: allPoints.length,
        };
      }
    }

    res.json({ data: result });
  } catch (error) {
    console.error("Error building disease coordinates:", error);
    res.status(500).json({ error: "Failed to build disease coordinates" });
  }
});

epidemiologicalRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    const record = await prisma.epidemiologicalRecord.findUnique({ where: { id } });
    if (!record) {
      res.status(404).json({ error: "Record not found" });
      return;
    }
    res.json(record);
  } catch (error) {
    console.error("Error fetching epidemiological record:", error);
    res.status(500).json({ error: "Failed to fetch epidemiological record" });
  }
});
