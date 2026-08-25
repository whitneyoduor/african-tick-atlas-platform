const NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const NCBI_EMAIL = process.env.NCBI_EMAIL || "tickatlas@african-tick-atlas.org";
const NCBI_API_KEY = process.env.NCBI_API_KEY || "";
const RETMAX = 20;
const DELAY_MS = NCBI_API_KEY ? 110 : 350;

const cache = new Map<string, GenBankRecord[]>();

const GENUS_ABBREVIATIONS: Record<string, string> = {
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
  accession: string;
  organism: string | null;
  sequenceLength: number | null;
  gene: string | null;
  definition: string | null;
  taxonomy: string[];
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

  const abbrMatch = name.match(/^([A-Z])\.\s+(.+)/i);
  if (abbrMatch) {
    const abbr = abbrMatch[1];
    const epithet = abbrMatch[2].trim();
    const fullGenus = GENUS_ABBREVIATIONS[abbr];
    if (fullGenus) {
      name = `${fullGenus} ${epithet}`;
    }
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
  const decimalMatch = raw.match(
    /([-]?\d+\.?\d*)\s*[,/]\s*([-]?\d+\.?\d*)/
  );
  if (decimalMatch) {
    const lat = parseFloat(decimalMatch[1]);
    const lon = parseFloat(decimalMatch[2]);
    if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { lat, lon };
    }
  }

  const nsDeg = raw.match(/(\d+)[°:](\d+)['′:]?(\d+\.?\d*)?[\"″]?\s*([NSns])/);
  const ewDeg = raw.match(/(\d+)[°:](\d+)['′:]?(\d+\.?\d*)?[\"″]?\s*([EWew])/);
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

function extractFeatureValues(featuresSection: string, tag: string): string[] {
  const regex = new RegExp(`/${tag}="([^"]+)"`, "g");
  const results: string[] = [];
  let m;
  while ((m = regex.exec(featuresSection)) !== null) {
    results.push(m[1]);
  }
  return results;
}

function parseGenBankFlatFile(flatFile: string): GenBankRecord[] {
  const records: GenBankRecord[] = [];
  const entries = flatFile.split(/^LOCUS\s+/m).slice(1);

  for (const entry of entries) {
    const lines = entry.split("\n");

    const accessionLine = lines[0]?.trim() || "";
    const accession = accessionLine.split(/\s+/)[0]?.split(".")[0] || null;
    if (!accession) continue;

    let definition: string | null = null;
    let organism: string | null = null;
    let sourceLine = "";
    let featuresSection = "";
    let originReached = false;
    let inFeatures = false;
    let inTaxonomy = false;
    let taxonomyLines: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      if (originReached) break;

      const topTag = line.match(/^([A-Z][A-Z_ ]{2,})\s{2,}(.*)/);
      const indentedTag = line.match(/^  ([A-Z][A-Z_]{2,})\s{2,}(.*)/);
      const taxonomyContinuation = /^\s{12,}\S/.test(line);

      if (topTag) {
        const tag = topTag[1].trim();
        const value = topTag[2]?.trim() || "";

        if (tag === "DEFINITION") { definition = value; inTaxonomy = false; }
        else if (tag === "SOURCE") { sourceLine = value; inTaxonomy = false; }
        else if (tag === "KEYWORDS" || tag === "REFERENCE" || tag === "COMMENT") {
          inTaxonomy = false;
          inFeatures = false;
        }
        else if (tag === "FEATURES") { inFeatures = true; inTaxonomy = false; }
        else if (tag === "ORIGIN") { inFeatures = false; originReached = true; }
      } else if (indentedTag) {
        const tag = indentedTag[1].trim();
        const value = indentedTag[2]?.trim() || "";

        if (tag === "ORGANISM") {
          organism = value;
          inTaxonomy = true;
          inFeatures = false;
        } else {
          inTaxonomy = false;
        }
      } else if (taxonomyContinuation && inTaxonomy) {
        taxonomyLines.push(line.trim());
      }

      if (inFeatures) {
        featuresSection += line + "\n";
      }
    }

    if (sourceLine) {
      taxonomyLines.unshift(sourceLine);
    }

    const rawTaxonomy = taxonomyLines.join(" ").replace(/\.\s*$/, "");
    const taxonomy = rawTaxonomy
      .split(/;\s*/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !t.includes("REFERENCE") && !t.includes("AUTHORS"));

    const gene = extractFeatureValues(featuresSection, "gene")[0] || null;
    const country =
      extractFeatureValues(featuresSection, "country")[0] || null;
    const geoLocName =
      extractFeatureValues(featuresSection, "geo_loc_name")[0] || null;
    const latLonRaw =
      extractFeatureValues(featuresSection, "lat_lon")[0] || null;
    const collectionDate =
      extractFeatureValues(featuresSection, "collection_date")[0] || null;
    const host = extractFeatureValues(featuresSection, "host")[0] || null;

    const orgFromFeatures = extractFeatureValues(featuresSection, "organism")[0];
    organism = orgFromFeatures || organism || null;

    let latitude: number | null = null;
    let longitude: number | null = null;
    if (latLonRaw) {
      const coords = parseLatLon(latLonRaw);
      if (coords) {
        latitude = coords.lat;
        longitude = coords.lon;
      }
    }

    const locusLine = lines[0] || "";
    const lengthMatch = locusLine.match(/(\d+)\s+bp/);
    const sequenceLength = lengthMatch ? parseInt(lengthMatch[1]) : null;

    const location = country || geoLocName || null;

    records.push({
      accession,
      organism,
      sequenceLength,
      gene,
      definition: definition ? definition.replace(/\s+/g, " ") : null,
      taxonomy,
      collectionDate,
      country,
      location,
      latitude,
      longitude,
      host,
    });
  }

  return records;
}

async function ncbiFetch(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`NCBI API error: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchGenBank(species: string): Promise<GenBankRecord[]> {
  const normalized = normalizeSpecies(species);

  const cached = cache.get(normalized);
  if (cached) return cached;

  const searchTerm = `${normalized}[Organism]`;
  const esearchUrl = `${NCBI_BASE}/esearch.fcgi?db=nucleotide&term=${encodeURIComponent(searchTerm)}&retmax=${RETMAX}&retmode=json&email=${NCBI_EMAIL}${NCBI_API_KEY ? "&api_key=" + NCBI_API_KEY : ""}`;

  console.log(`[GenBank] Searching: ${normalized}`);
  const esearchText = await ncbiFetch(esearchUrl);
  const esearchData = JSON.parse(esearchText);
  const ids: string[] = esearchData?.esearchresult?.idlist || [];

  if (ids.length === 0) {
    console.log(`[GenBank] No records found for "${normalized}"`);
    cache.set(normalized, []);
    return [];
  }

  console.log(`[GenBank] Found ${ids.length} records for "${normalized}"`);

  await sleep(DELAY_MS);

  const efetchUrl = `${NCBI_BASE}/efetch.fcgi?db=nucleotide&id=${ids.join(",")}&rettype=gb&retmode=text&email=${NCBI_EMAIL}${NCBI_API_KEY ? "&api_key=" + NCBI_API_KEY : ""}`;
  const flatFile = await ncbiFetch(efetchUrl);

  const records = parseGenBankFlatFile(flatFile);
  console.log(`[GenBank] Parsed ${records.length} records for "${normalized}"`);

  cache.set(normalized, records);
  return records;
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

export function getCachedSpecies(): string[] {
  return Array.from(cache.keys());
}
