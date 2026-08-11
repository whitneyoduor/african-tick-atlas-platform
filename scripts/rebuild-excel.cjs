// Rebuilds the source Excel files from the canonical public/*.json data.
const fs = require("fs");
const path = require("path");
const XLSX = require("../server/node_modules/xlsx");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "server", "data");

const CITATION =
  "GBIF.org, 2026. GBIF Occurrence Download. Available at: https://doi.org/10.15468/dl.jve6v3 [Accessed 3 August 2026].";

const occ = JSON.parse(fs.readFileSync(path.join(PUBLIC, "occurrences.json"), "utf8")).data;
const epi = JSON.parse(fs.readFileSync(path.join(PUBLIC, "epidemiological.json"), "utf8")).data;

const occRows = occ.map((r) => ({
  Species: r.species, Latitude: r.latitude, Longitude: r.longitude,
  Country: r.country, Year: r.year, "GBIF occurrence ID": r.gbifId, Citation: CITATION,
}));
const occWs = XLSX.utils.json_to_sheet(occRows);
const occWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(occWb, occWs, "Occurrences");
XLSX.writeFile(occWb, path.join(DATA_DIR, "tick_occurrence_simple.xlsx"));

const epiRows = epi.map((r) => ({
  Species: r.species, "Year of study": r.yearOfStudy, Country: r.country, Title: r.title,
  Links: r.links, "epidemiological disease": r.epidemiologicalDisease,
  "method of Extraction": r.methodOfExtraction, "related hosts": r.relatedHosts,
  "epidemiological incidences": r.epidemiologicalIncidences,
}));
const epiWs = XLSX.utils.json_to_sheet(epiRows);
const epiWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(epiWb, epiWs, "Other data");
XLSX.writeFile(epiWb, path.join(DATA_DIR, "ticks_epidemiological_data.xlsx"));

console.log("Rebuilt Excel from JSON -> occurrences:", occRows.length, "| epidemiological:", epiRows.length);
