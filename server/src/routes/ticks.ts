import { Router, Request, Response } from "express";
import prisma from "../db.js";

export const tickRouter = Router();

tickRouter.get("/", async (req: Request, res: Response) => {
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
      prisma.tickRecord.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { id: "asc" },
      }),
      prisma.tickRecord.count({ where }),
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
    console.error("Error fetching tick records:", error);
    res.status(500).json({ error: "Failed to fetch tick records" });
  }
});

tickRouter.get("/meta/counts", async (_req: Request, res: Response) => {
  try {
    const [species, countries, hosts, diseases, total, yearStats, incidenceRecords] = await Promise.all([
      prisma.tickRecord.groupBy({ by: ["species"], _count: true, orderBy: { _count: { species: "desc" } } }),
      prisma.tickRecord.groupBy({ by: ["country"], _count: true, orderBy: { _count: { country: "desc" } } }),
      prisma.tickRecord.groupBy({ by: ["relatedHosts"], _count: true, orderBy: { _count: { relatedHosts: "desc" } } }),
      prisma.tickRecord.groupBy({ by: ["epidemiologicalDisease"], _count: true, orderBy: { _count: { epidemiologicalDisease: "desc" } } }),
      prisma.tickRecord.count(),
      prisma.tickRecord.aggregate({ _min: { yearStart: true }, _max: { yearEnd: true } }),
      prisma.tickRecord.findMany({
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
    console.error("Error fetching metadata:", error);
    res.status(500).json({ error: "Failed to fetch metadata" });
  }
});

tickRouter.get("/meta/yearly", async (_req: Request, res: Response) => {
  try {
    const records = await prisma.tickRecord.findMany({
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

tickRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    const record = await prisma.tickRecord.findUnique({ where: { id } });
    if (!record) {
      res.status(404).json({ error: "Record not found" });
      return;
    }
    res.json(record);
  } catch (error) {
    console.error("Error fetching tick record:", error);
    res.status(500).json({ error: "Failed to fetch tick record" });
  }
});
