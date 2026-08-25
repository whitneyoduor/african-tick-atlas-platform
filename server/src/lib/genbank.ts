import prisma from "../db.js";

const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const NCBI_EMAIL = process.env.NCBI_EMAIL || "tickatlas@african-tick-atlas.org";
const NCBI_API_KEY = process.env.NCBI_API_KEY || "";
const RETMAX = 200;
const DELAY_MS = NCBI_API_KEY ? 110 : 350;

const GENUS_MAP: Record<string, string> = {
  A: "Amblyomma",
  H: "Hyalomma",
  R: "Rhipicephalus",
  I: "Ixodes",
  D: "Dermacentor",
  Ha: "Haemaphysalis",
  O: "Ornithodoros",
  Ot: "Otobius",
  C: "Carios",
  Ar: "Argas",
};

export interface GenBankRecord {
  id: number;
  accession: string;
  species: string | null;
  organism: string | null;
  gene: string | null;
  sequenceLength: number | null;
  definition: string | null;
  taxonomy: string | null;
  collectionDate: string | null;
  country: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  host: string | null;
}

export interface GenBankMatch {
  record: GenBankRecord;
  distanceKm: number | null;
}

export function normalizeSpecies(raw: string): string {
  let name = raw.trim().replace(/\s+/g, " ");

  const abbrMatch = name.match(/^([A-Z][a-z]?)\.\s+(.+)/);
  if (abbrMatch) {
    const full = GENUS_MAP[abbrMatch[1]];
    if (full) name = `${full} ${abbrMatch[2].trim()}`;
  }

  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    parts[1] = parts[1].toLowerCase();
    name = parts[0] + " " + parts.slice(1).join(" ");
  }

  return name;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseLatLon(raw: string): { lat: number; lon: number } | null {
  const decimal = raw.match(/([-]?\d+\.?\d*)\s*[,/]\s*([-]?\d+\.?\d*)/);
  if (decimal) {
    const lat = parseFloat(decimal[1]);
    const lon = parseFloat(decimal[2]);
    if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { lat, lon };
    }
  }

  const nsDeg = raw.match(/(\d+)[°:](\d+)[′']:?(\d+\.?\d*)?[″"]?\s*([NSns])/);
  const ewDeg = raw.match(/(\d+)[°:](\d+)[′']:?(\d+\.?\d*)?[″"]?\s*([EWew])/);
  if (nsDeg && ewDeg) {
    const lat =
      (parseFloat(nsDeg[1]) + parseFloat(nsDeg[2]) / 60 + parseFloat(nsDeg[3]) / 3600) *
      (nsDeg[4].toUpperCase() === "S" ? -1 : 1);
    const lon =
      (parseFloat(ewDeg[1]) + parseFloat(ewDeg[2]) / 60 + parseFloat(ewDeg[3]) / 3600) *
      (ewDeg[4].toUpperCase() === "W" ? -1 : 1);
    if (!isNaN(lat) && !isNaN(lon)) return { lat, lon };
  }

  return null;
}

function extractXmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<]*)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function extractXmlFeatureQuals(featureXml: string): Record<string, string[]> {
  const quals: Record<string, string[]> = {};
  const qualRegex = /<GBQualifier>\s*<GBQualifier_name>([^<]+)<\/GBQualifier_name>\s*<GBQualifier_value>([^<]*)<\/GBQualifier_value>\s*<\/GBQualifier>/gi;
  let m;
  while ((m = qualRegex.exec(featureXml)) !== null) {
    const name = m[1].trim();
    const val = m[2].trim();
    if (!quals[name]) quals[name] = [];
    quals[name].push(val);
  }
  return quals;
}

function parseGenBankXml(xml: string): Partial<GenBankRecord>[] {
  const records: Partial<GenBankRecord>[] = [];

  const entryRegex = /<GBSeq>[\s\S]*?<\/GBSeq>/gi;
  const entries = xml.match(entryRegex) || [];

  for (const entry of entries) {
    const accession = extractXmlTag(entry, "GBSeq_primary-accession");
    if (!accession) continue;

    const definition = extractXmlTag(entry, "GBSeq_definition") || null;
    const organism = extractXmlTag(entry, "GBSeq_organism") || null;
    const taxonomy = extractXmlTag(entry, "GBSeq_taxonomy") || null;

    const lenStr = extractXmlTag(entry, "GBSeq_length");
    const sequenceLength = lenStr ? parseInt(lenStr, 10) : null;

    const featureBlocks = entry.match(/<GBFeature>[\s\S]*?<\/GBFeature>/gi) || [];

    let gene: string | null = null;
    let country: string | null = null;
    let geoLocName: string | null = null;
    let latLonRaw: string | null = null;
    let collectionDate: string | null = null;
    let host: string | null = null;

    for (const feat of featureBlocks) {
      const q = extractXmlFeatureQuals(feat);

      if (!gene && q.gene) gene = q.gene[0];
      if (!country && q.country) country = q.country[0];
      if (!geoLocName && q.geo_loc_name) geoLocName = q.geo_loc_name[0];
      if (!latLonRaw && q.lat_lon) latLonRaw = q.lat_lon[0];
      if (!collectionDate && q.collection_date) collectionDate = q.collection_date[0];
      if (!host && q.host) host = q.host[0];
    }

    if (!gene && definition) {
      const genePatterns = [
        /cytochrome\s*c\s*oxidase\s*subunit\s*(\w+)/i,
        /\b(cox\d|COX\d|COI|COII|COIII|CO1|cytb|cyt\s*b|12S|rRNA|16S|ITS\d?|28S|EF-?\d|arginine\s*kinase|tubulin|actin|CAD|wgl|23S)\b/i,
      ];
      for (const pat of genePatterns) {
        const m = definition.match(pat);
        if (m) { gene = m[1] || m[0]; break; }
      }
    }

    let latitude: number | null = null;
    let longitude: number | null = null;
    if (latLonRaw) {
      const coords = parseLatLon(latLonRaw);
      if (coords) {
        latitude = coords.lat;
        longitude = coords.lon;
      }
    }

    records.push({
      accession,
      organism,
      gene,
      sequenceLength,
      definition,
      taxonomy,
      collectionDate,
      country: country || geoLocName || null,
      location: country || geoLocName || null,
      latitude,
      longitude,
      host,
    });
  }

  return records;
}

async function ncbiFetch(url: string, retries = 2): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) throw new Error(`NCBI ${res.status} ${res.statusText}`);
      return res.text();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("unreachable");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function apiKeyParam(): string {
  return NCBI_API_KEY ? `&api_key=${NCBI_API_KEY}` : "";
}

export async function fetchAndStoreGenBank(species: string, email?: string): Promise<GenBankRecord[]> {
  const normalized = normalizeSpecies(species);

  const existing = await prisma.genBankRecord.findMany({
    where: { species: normalized },
    orderBy: { id: "asc" },
  });
  if (existing.length > 0) return existing;

  const searchTerm = `${normalized}[Organism]`;
  const esearchUrl = `${NCBI_BASE}/esearch.fcgi?db=nucleotide&term=${encodeURIComponent(searchTerm)}&retmax=${RETMAX}&retmode=json&email=${email || NCBI_EMAIL}${apiKeyParam()}`;

  console.log(`[GenBank] Searching NCBI for "${normalized}"...`);
  const esearchText = await ncbiFetch(esearchUrl);
  const esearchData = JSON.parse(esearchText);
  const ids: string[] = esearchData?.esearchresult?.idlist || [];

  if (ids.length === 0) {
    console.log(`[GenBank] No records found for "${normalized}"`);
    return [];
  }

  console.log(`[GenBank] Found ${ids.length} records, fetching details...`);
  await sleep(DELAY_MS);

  const batchSize = 50;
  const allParsed: Partial<GenBankRecord>[] = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    if (i > 0) await sleep(DELAY_MS);

    const efetchUrl = `${NCBI_BASE}/efetch.fcgi?db=nucleotide&id=${batch.join(",")}&rettype=xml&retmode=xml&email=${email || NCBI_EMAIL}${apiKeyParam()}`;
    const xml = await ncbiFetch(efetchUrl);
    allParsed.push(...parseGenBankXml(xml));
  }

  const stored: GenBankRecord[] = [];
  for (const rec of allParsed) {
    if (!rec.accession) continue;
    try {
      const row = await prisma.genBankRecord.upsert({
        where: { accession: rec.accession },
        update: {
          species: normalized,
          organism: rec.organism || null,
          gene: rec.gene || null,
          sequenceLength: rec.sequenceLength || null,
          definition: rec.definition || null,
          taxonomy: rec.taxonomy || null,
          collectionDate: rec.collectionDate || null,
          country: rec.country || null,
          location: rec.location || null,
          latitude: rec.latitude ?? null,
          longitude: rec.longitude ?? null,
          host: rec.host || null,
        },
        create: {
          accession: rec.accession,
          species: normalized,
          organism: rec.organism || null,
          gene: rec.gene || null,
          sequenceLength: rec.sequenceLength || null,
          definition: rec.definition || null,
          taxonomy: rec.taxonomy || null,
          collectionDate: rec.collectionDate || null,
          country: rec.country || null,
          location: rec.location || null,
          latitude: rec.latitude ?? null,
          longitude: rec.longitude ?? null,
          host: rec.host || null,
        },
      });
      stored.push(row as GenBankRecord);
    } catch (err) {
      console.warn(`[GenBank] Failed to store ${rec.accession}:`, err);
    }
  }

  console.log(`[GenBank] Stored ${stored.length} records for "${normalized}"`);
  return stored;
}

export async function getGenBankRecords(species: string): Promise<GenBankRecord[]> {
  const normalized = normalizeSpecies(species);
  const rows = await prisma.genBankRecord.findMany({
    where: { species: normalized },
    orderBy: { accession: "asc" },
  });
  return rows as GenBankRecord[];
}

export function findClosestRecords(
  records: GenBankRecord[],
  lat: number,
  lon: number,
  radiusKm: number = 5000
): GenBankMatch[] {
  const withDistance: GenBankMatch[] = records.map((record) => {
    let distanceKm: number | null = null;
    if (record.latitude !== null && record.longitude !== null) {
      distanceKm = haversineDistance(lat, lon, record.latitude, record.longitude);
    }
    return { record, distanceKm };
  });

  return withDistance
    .filter((m) => m.distanceKm === null || m.distanceKm <= radiusKm)
    .sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return 0;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });
}

export async function getGenBankStats(species: string) {
  const normalized = normalizeSpecies(species);

  const records = await prisma.genBankRecord.findMany({
    where: { species: normalized },
    select: { gene: true, country: true, host: true, sequenceLength: true },
  });

  const geneCounts: Record<string, number> = {};
  const countryCounts: Record<string, number> = {};
  const hostCounts: Record<string, number> = {};
  const lengths: number[] = [];

  for (const r of records) {
    if (r.gene) geneCounts[r.gene] = (geneCounts[r.gene] || 0) + 1;
    if (r.country) countryCounts[r.country] = (countryCounts[r.country] || 0) + 1;
    if (r.host) hostCounts[r.host] = (hostCounts[r.host] || 0) + 1;
    if (r.sequenceLength) lengths.push(r.sequenceLength);
  }

  return {
    total: records.length,
    genes: Object.entries(geneCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    countries: Object.entries(countryCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    hosts: Object.entries(hostCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count })),
    sequenceLength: lengths.length > 0
      ? {
          min: Math.min(...lengths),
          max: Math.max(...lengths),
          mean: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
        }
      : null,
  };
}
