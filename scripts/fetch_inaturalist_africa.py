#!/usr/bin/env python3
"""
Enriches public/occurrences.json with real iNaturalist observations (Africa) for
the five key species highlighted on the Maps page, deduplicated against the
existing dataset.

Why: the source GBIF download (dl.jve6v3) and the live GBIF Occurrence API are
nearly exhausted for coordinate-bearing African records of these species, but
iNaturalist (a principal GBIF publisher) still holds research-grade and
needs-ID citizen-science observations with coordinates that were not captured
in the download. This merges only genuinely new points (per-species spatial
dedupe within ~0.05 deg) into occurrences.json and regenerates
occurrences-meta.json, so the Maps page can show more real African ticks.

Usage:  python scripts/fetch_inaturalist_africa.py
Output: appends to public/occurrences.json, rewrites public/occurrences-meta.json
"""
import json
import math
import os
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
API = "https://api.inaturalist.org/v1/observations"
UA = {"User-Agent": "AfricanTickAtlas-Research/1.0 (research enrichment; contact via GitHub)"}
AFRICA_BBOX = {"swlat": -40, "swlng": -25, "nelat": 40, "nelng": 55}
DEDUPE_DEG = 0.05  # ~5 km: observations within this radius of an existing record are duplicates

# iNaturalist taxon ids (resolved Sep 2026; names match species.ts KEY_SPECIES).
TAXA = {
    "Rhipicephalus appendiculatus": 687594,
    "Rhipicephalus sanguineus": 229905,
    "Rhipicephalus microplus": 484410,
    "Hyalomma marginatum": 605813,
    "Hyalomma rufipes": 605814,
}

CITATION = (
    "iNaturalist contributors. 2026. Research-grade and needs-ID observations "
    "retrieved via the iNaturalist REST API (https://api.inaturalist.org) "
    "[Accessed 9 September 2026]. iNaturalist observations are aggregated into GBIF."
)

# livestock-countries.geojson labels -> canonical platform country names
# (api.ts AFRICAN_COUNTRIES / occurrences.json country values).
CN_MAP = {
    "DRC": "Congo, Democratic Republic of the",
    "Congo Republic": "Congo",
    "Swaziland": "Eswatini",
    "Côte d'Ivoire": "Côte d'Ivoire",
    "São Tomé and Príncipe": "Sao Tome and Principe",
    "Western Sahara": "Western Sahara",
}


def get_json(url):
    attempt = 0
    while True:
        attempt += 1
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.load(r)
        except Exception as e:
            if attempt >= 3:
                raise
            print(f"    ... retry {attempt}/2 after {type(e).__name__}", flush=True)
            time.sleep(2 * attempt)


# ---- country polygons (for assigning an observation to a country) ----
def load_countries():
    raw = open(os.path.join(PUBLIC, "health", "livestock-countries.geojson"), "rb").read().decode("latin-1")
    fc = json.loads(raw)
    polys = {}
    for feat in fc["features"]:
        code = feat["properties"].get("CN")
        name = CN_MAP.get(code, code)
        if not code or name in polys:
            continue
        geom = feat["geometry"]
        geom_coords = [
            geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
        ][0]
        rings_all = []
        lo_min, lo_max, la_min, la_max = 1e9, -1e9, 1e9, -1e9
        for poly in geom_coords:
            for ring in poly:
                pts = [(p[1], p[0]) for p in ring]
                for la, lo in pts:
                    la_min, la_max = min(la_min, la), max(la_max, la)
                    lo_min, lo_max = min(lo_min, lo), max(lo_max, lo)
                rings_all.append(pts)
        polys[name] = {"lo_min": lo_min, "lo_max": lo_max, "la_min": la_min, "la_max": la_max, "rings": rings_all}
    return polys


def point_in_ring(lat, lon, ring):
    inside = False
    for i in range(len(ring)):
        y1, x1 = ring[i]
        y2, x2 = ring[(i + 1) % len(ring)]
        if (y1 > lat) != (y2 > lat):
            x = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if lon < x:
                inside = not inside
    return inside


def country_of(countries, lat, lon):
    for name, p in countries.items():
        if lat < p["la_min"] or lat > p["la_max"] or lon < p["lo_min"] or lon > p["lo_max"]:
            continue
        for ring in p["rings"]:
            if point_in_ring(lat, lon, ring):
                return name
    return None


def main():
    occ_path = os.path.join(PUBLIC, "occurrences.json")
    with open(occ_path, "r", encoding="utf-8") as f:
        occ = json.load(f)
    records = occ["data"]

    # Existing points, bucketed per species for spatial dedupe.
    seen = {}
    for r in records:
        if r.get("latitude") is None or r.get("longitude") is None:
            continue
        sp = (r.get("species") or "").strip().lower()
        if not sp:
            continue
        key = (round(float(r["latitude"]) / DEDUPE_DEG), round(float(r["longitude"]) / DEDUPE_DEG))
        seen.setdefault(sp, set()).add(key)
    next_id = max((r["id"] for r in records), default=0) + 1

    countries = load_countries()

    added = []
    summary = {}
    for species, taxon_id in TAXA.items():
        sp_key = species.lower()
        page = 0
        summary[species] = {}
        while True:
            page += 1
            params = dict(AFRICA_BBOX)
            params.update(
                {
                    "taxon_id": taxon_id,
                    "captive": "false",
                    "geoprivacy": "open",
                    "taxon_geoprivacy": "open",
                    "per_page": 200,
                    "page": page,
                    "fields": "id,quality_grade,geojson,observed_on",
                }
            )
            d = get_json(f"{API}?{urllib.parse.urlencode(params)}")
            results = d.get("results", [])
            if not results:
                break
            for ob in results:
                if ob.get("quality_grade") == "casual":
                    continue
                geom = ob.get("geojson")
                if not geom or "coordinates" not in geom:
                    continue
                lon, lat = geom["coordinates"]
                country = country_of(countries, lat, lon)
                if not country:
                    continue
                key = (round(lat / DEDUPE_DEG), round(lon / DEDUPE_DEG))
                if key in seen.setdefault(sp_key, set()):
                    continue
                seen[sp_key].add(key)
                year = None
                if ob.get("observed_on"):
                    year = int(str(ob["observed_on"])[:4])
                added.append(
                    {
                        "id": next_id,
                        "gbifId": None,
                        "species": species,
                        "latitude": round(lat, 6),
                        "longitude": round(lon, 6),
                        "country": country,
                        "year": year,
                        "citation": CITATION,
                    }
                )
                summary[species][country] = summary[species].get(country, 0) + 1
                next_id += 1
            if len(results) < 200:
                break
            time.sleep(1.1)

    print(f"NEW RECORDS TO ADD: {len(added)}")
    for sp, cc_map in summary.items():
        print(f"  {sp}: {sum(cc_map.values())} new across {len(cc_map)} countries")
        print("     " + ", ".join(f"{c}={n}" for c, n in sorted(cc_map.items(), key=lambda x: -x[1])))

    if not added:
        print("Nothing to add.")
        return

    records.extend(added)
    occ["data"] = records
    occ["pagination"]["total"] = len(records)
    occ["pagination"]["totalPages"] = (len(records) + occ["pagination"]["limit"] - 1) // occ["pagination"]["limit"]
    with open(occ_path, "w", encoding="utf-8") as f:
        json.dump(occ, f, ensure_ascii=False)
    print(f"occurrences.json now has {len(records)} records")

    # ---- regenerate occurrences-meta.json from the full dataset ----
    species_counts = {}
    country_counts = {}
    years = []
    for r in records:
        sp = (r.get("species") or "").strip()
        if sp:
            species_counts[sp] = species_counts.get(sp, 0) + 1
        c = (r.get("country") or "").strip()
        if c:
            country_counts[c] = country_counts.get(c, 0) + 1
        if r.get("year") is not None:
            years.append(r["year"])
    meta = {
        "totalRecords": len(records),
        "yearRange": {"min": min(years) if years else None, "max": max(years) if years else None},
        "species": [{"name": k, "count": v} for k, v in sorted(species_counts.items(), key=lambda x: -x[1])],
        "countries": [{"name": k, "count": v} for k, v in sorted(country_counts.items(), key=lambda x: -x[1])],
    }
    with open(os.path.join(PUBLIC, "occurrences-meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)
    print("occurrences-meta.json regenerated")


if __name__ == "__main__":
    main()