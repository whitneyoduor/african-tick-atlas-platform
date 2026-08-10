import { Router, Request, Response } from "express";
import prisma from "../db.js";

export const occurrenceRouter = Router();

occurrenceRouter.get("/", async (req: Request, res: Response) => {
  try {
    const {
      species,
      country,
      yearStart,
      yearEnd,
      page = "1",
      limit = "50",
      search,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(200000, Math.max(1, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (species) {
      where.species = { contains: species as string };
    }
    if (country) {
      where.country = { contains: country as string };
    }
    if (yearStart) {
      const ys = parseInt(yearStart as string, 10);
      if (!isNaN(ys)) where.year = { gte: ys };
    }
    if (yearEnd) {
      const ye = parseInt(yearEnd as string, 10);
      if (!isNaN(ye)) where.year = { lte: ye };
    }
    if (search) {
      where.OR = [
        { species: { contains: search as string } },
        { country: { contains: search as string } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.occurrence.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { id: "asc" },
      }),
      prisma.occurrence.count({ where }),
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
    console.error("Error fetching occurrences:", error);
    res.status(500).json({ error: "Failed to fetch occurrences" });
  }
});

occurrenceRouter.get("/meta/counts", async (_req: Request, res: Response) => {
  try {
    const [species, countries, total, yearStats] = await Promise.all([
      prisma.occurrence.groupBy({ by: ["species"], _count: true, orderBy: { _count: { species: "desc" } } }),
      prisma.occurrence.groupBy({ by: ["country"], _count: true, orderBy: { _count: { country: "desc" } } }),
      prisma.occurrence.count(),
      prisma.occurrence.aggregate({ _min: { year: true }, _max: { year: true } }),
    ]);

    res.json({
      totalRecords: total,
      yearRange: {
        min: yearStats._min.year,
        max: yearStats._max.year,
      },
      species: species.filter((s) => s.species).map((s) => ({ name: s.species, count: s._count })),
      countries: countries.filter((c) => c.country).map((c) => ({ name: c.country, count: c._count })),
    });
  } catch (error) {
    console.error("Error fetching occurrence metadata:", error);
    res.status(500).json({ error: "Failed to fetch occurrence metadata" });
  }
});

occurrenceRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ID" });
      return;
    }
    const record = await prisma.occurrence.findUnique({ where: { id } });
    if (!record) {
      res.status(404).json({ error: "Record not found" });
      return;
    }
    res.json(record);
  } catch (error) {
    console.error("Error fetching occurrence:", error);
    res.status(500).json({ error: "Failed to fetch occurrence" });
  }
});
