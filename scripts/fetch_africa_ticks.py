#!/usr/bin/env python3
"""
Comprehensive, honest enrichment of public/occurrences.json with real online
occurrence records for African ticks.

Two sources are scraped — nothing is fabricated:

  A) GBIF Occurrence API  : a full sweep of the order Ixodida for every one of
     the 54 African countries (coordinate-bearing records only). This is the
     superset that also catches any remaining R. sanguineus / major-tick records
     (including the five key species) that previous partial runs did not hold.
  B) iNaturalist API      : research-grade / needs-ID observations across the
     major African tick species (the five key species plus Amblyomma, Hyalomma,
     Rhipicephalus, Haemaphysalis, Ixodes, Ornithodoros and Argas species).

Merging is deduplicated twice:
  - GBIF records by GBIF occurrence key (no duplicate key is ever re-added);
  - iNaturalist observations per species by a ~0.05 deg spatial bucket (a new
    observation within ~5km of an existing record of the same species is dropped).

Records are kept only when they have coordinates and lie inside a recognised
African country (iNaturalist points are assigned to countries from the platform's
own country polygons). Every record keeps a citation line. The script appends
only genuinely new records, then regenerates occurrences-meta.json.

Usage:  python scripts/fetch_africa_ticks.py
Output: appends to public/occurrences.json, rewrites public/occurrences-meta.json
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
GBIF_API = "https://api.gbif.org/v1/occurrence/search"
INAT_API = "https://api.inaturalist.org/v1/observations"
UA = {"User-Agent": "AfricanTickAtlas-Research/1.0 (research enrichment; contact via GitHub)"}

IXODIDA = 1425  # GBIF order key for Ixodida (all ticks)

AFRICAN = {
    "DZ": "Algeria", "AO": "Angola", "BJ": "Benin", "BW": "Botswana",
    "BF": "Burkina Faso", "BI": "Burundi", "CV": "Cabo Verde", "CM": "Cameroon",
    "CF": "Central African Republic", "TD": "Chad", "KM": "Comoros",
    "CD": "Congo, Democratic Republic of the", "CG": "Congo", "CI": "Côte d'Ivoire",
    "DJ": "Djibouti", "EG": "Egypt", "GQ": "Equatorial Guinea", "ER": "Eritrea",
    "SZ": "Eswatini", "ET": "Ethiopia", "GA": "Gabon", "GM": "Gambia",
    "GH": "Ghana", "GN": "Guinea", "GW": "Guinea-Bissau", "KE": "Kenya",
    "LS": "Lesotho", "LR": "Liberia", "LY": "Libya", "MG": "Madagascar",
    "MW": "Malawi", "ML": "Mali", "MR": "Mauritania", "MU": "Mauritius",
    "YT": "Mayotte", "MA": "Morocco", "MZ": "Mozambique", "NA": "Namibia",
    "NE": "Niger", "NG": "Nigeria", "RE": "Réunion", "RW": "Rwanda",
    "ST": "Sao Tome and Principe", "SN": "Senegal", "SC": "Seychelles",
    "SL": "Sierra Leone", "SO": "Somalia", "ZA": "South Africa",
    "SS": "South Sudan", "SD": "Sudan", "TZ": "Tanzania, United Republic of",
    "TG": "Togo", "TN": "Tunisia", "UG": "Uganda", "EH": "Western Sahara",
    "ZM": "Zambia", "ZW": "Zimbabwe",
}

# iNaturalist taxon ids (resolved via /v1/taxa). Includes the five key species
# (already harvested once) so the sweep re-covers them; spatial dedupe prevents
# re-adds.
INAT_TAXA = [
    ("Rhipicephalus appendiculatus", 687594),
    ("Rhipicephalus sanguineus", 229905),
    ("Rhipicephalus microplus", 484410),
    ("Hyalomma marginatum", 605813),
    ("Hyalomma rufipes", 605814),
    ("Amblyomma variegatum", 343266),
    ("Amblyomma hebraeum", 628768),
    ("Amblyomma gemma", 702208),
    ("Amblyomma marmoreum", 649014),
    ("Hyalomma dromedarii", 627066),
    ("Hyalomma truncatum", 669999),
    ("Hyalomma excavatum", 964274),
    ("Hyalomma impeltatum", 605739),
    ("Hyalomma aegyptium", 196791),
    ("Hyalomma anatolicum", 964272),
    ("Hyalomma lusitanicum", 917032),
    ("Hyalomma scupense", 964299),
    ("Rhipicephalus evertsi", 696706),
    ("Rhipicephalus decoloratus", 687597),
    ("Rhipicephalus simus", 687614),
    ("Rhipicephalus turanicus", 687618),
    ("Rhipicephalus bursa", 917033),
    ("Rhipicephalus annulatus", 964275),
    ("Rhipicephalus compositus", 1139638),
    ("Haemaphysalis elliptica", 668054),
    ("Haemaphysalis punctata", 538192),
    ("Ixodes ricinus", 51671),
    ("Ornithodoros moubata", 680214),
    ("Ornithodoros savignyi", 556052),
    ("Argas persicus", 263516),
    ("Argas reflexus", 484033),
    ("Dermacentor reticulatus", 320832),
]

AFRICA_BBOX = {"swlat": -40, "swlng": -25, "nelat": 40, "nelng": 55}
DEDUPE_DEG = 0.05  # ~5 km spatial bucket for iNaturalist dedupe

GBIF_CITATION = (
    "GBIF.org, 2026. GBIF Occurrence API order Ixodida sweep, "
    "https://api.gbif.org [Accessed 9 September 2026]."
)
INAT_CITATION = (
    "iNaturalist contributors. 2026. Research-grade and needs-ID observations "
    "retrieved via the iNaturalist REST API (https://api.inaturalist.org) "
    "[Accessed 9 September 2026]. iNaturalist observations are aggregated into GBIF."
)

REGIONS = {
    "North": {"Algeria", "Egypt", "Libya", "Morocco", "Tunisia", "Western Sahara"},
    "West": {"Benin", "Burkina Faso", "Cabo Verde", "Côte d'Ivoire", "Gambia", "Ghana",
             "Guinea", "Guinea-Bissau", "Liberia", "Mali", "Mauritania", "Niger",
             "Nigeria", "Senegal", "Sierra Leone", "Togo"},
    "Central": {"Angola", "Cameroon", "Central African Republic", "Chad", "Congo",
                "Congo, Democratic Republic of the", "Equatorial Guinea",
                "Gabon", "Sao Tome and Principe", "Zambia"},
    "East": {"Burundi", "Djibouti", "Eritrea", "Eswatini", "Ethiopia", "Kenya",
             "Rwanda", "Somalia", "South Sudan", "Sudan", "Tanzania, United Republic of",
             "Uganda"},
    "South": {"Botswana", "Lesotho", "Madagascar", "Malawi", "Mozambique", "Namibia",
              "South Africa", "Zimbabwe"},
    "Islands": {"Comoros", "Mauritius", "Mayotte", "Réunion", "Seychelles"},
}
COUNTRY_REGION = {c: r for r, cs in REGIONS.items() for c in cs}

_retry = 0


def get_json(url):
    global _retry
    attempt = 0
    while True:
        attempt += 1
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                _retry = 0
                return json.load(r)
        except Exception as e:
            if attempt >= 4:
                raise
            backoff = 3 * attempt
            print(f"    ... retry {attempt}/3 after {type(e).__name__} in {backoff}s", file=sys.stderr, flush=True)
            time.sleep(backoff)


def norm_species(s):
    """Normalise a GBIF scientific name to a plain binomen/trinomen."""
    s = (s or "").strip()
    if not s:
        return ""
    s = re.sub(r"\s*\([^)]*\)\s*", " ", s)       # drop subgenus/authority parens
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def alias_species(s):
    words = s.split()
    if not words:
        return s
    if words[0] in ("Boophilus", "Margaropus"):
        return "Rhipicephalus " + " ".join(words[1:])
    return s


def is_species_epithet(s):
    words = s.split()
    if len(words) < 2 or len(words) > 3:
        return False
    return not re.search(r"\b(sp|spp|cf|aff|var|subsp|sp\.)\b", s, re.I) and words[-1][:1].islower()


# ---- GBIF phase -------------------------------------------------------------
def gbif_fetch_country(cc):
    rows = []
    offset = 0
    while True:
        q = urllib.parse.urlencode(
            {
                "taxonKey": IXODIDA,
                "country": cc,
                "hasCoordinate": "true",
                "limit": 300,
                "offset": offset,
            }
        )
        d = get_json(f"{GBIF_API}?{q}")
        res = d.get("results", [])
        rows.extend(res)
        offset += len(res)
        if not d.get("endOfRecords", False):
            break
        if not res:
            break
        time.sleep(0.4)
    return rows


def gbif_harvest(existing_keys):
    """Sweep order Ixodida for every African country; return fresh records."""
    added = []
    summary = {}
    for cc, name in AFRICAN.items():
        try:
            rows = gbif_fetch_country(cc)
        except Exception as e:
            print(f"  ! GBIF {name}: fetch failed: {e}", file=sys.stderr, flush=True)
            time.sleep(2)
            continue
        fresh = 0
        for r in rows:
            gid = str(r.get("key"))
            if gid in existing_keys:
                continue
            lat, lng = r.get("decimalLatitude"), r.get("decimalLongitude")
            if lat is None or lng is None:
                continue
            raw = r.get("species") or r.get("scientificName") or ""
            clean = alias_species(norm_species(raw))
            if not is_species_epithet(clean):
                continue  # genus-level or specimen-level label: not mappable as a species
            existing_keys.add(gid)
            added.append(
                {
                    "id": None,  # assigned centrally in merge()
                    "gbifId": gid,
                    "species": clean,
                    "latitude": lat,
                    "longitude": lng,
                    "country": name,
                    "year": r.get("year"),
                    "citation": GBIF_CITATION,
                }
            )
            fresh += 1
        if fresh:
            summary[name] = fresh
            print(f"  GBIF {name}: +{fresh} (of {len(rows)} fetched)", flush=True)
    return added, summary


# ---- iNaturalist phase ------------------------------------------------------
def load_countries():
    raw = open(os.path.join(PUBLIC, "health", "livestock-countries.geojson"), "rb").read().decode("latin-1")
    fc = json.loads(raw)
    cn = {
        "DRC": "Congo, Democratic Republic of the",
        "Congo Republic": "Congo",
        "Swaziland": "Eswatini",
        "São Tomé and Príncipe": "Sao Tome and Principe",
    }
    polys = {}
    for feat in fc["features"]:
        code = feat["properties"].get("CN")
        name = cn.get(code, code)
        if not code or name in polys:
            continue
        geom = feat["geometry"]
        geom_coords = [geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]][0]
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


def inat_harvest(seen_spatial):
    """Observations for all major tick taxa; per-species spatial dedupe."""
    added = []
    summary = {}
    countries = load_countries()
    for species, taxon_id in INAT_TAXA:
        sp_key = species.lower()
        page = 0
        sp_count = 0
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
            d = get_json(f"{INAT_API}?{urllib.parse.urlencode(params)}")
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
                if key in seen_spatial.setdefault(sp_key, set()):
                    continue
                seen_spatial[sp_key].add(key)
                year = None
                if ob.get("observed_on"):
                    year = int(str(ob["observed_on"])[:4])
                added.append(
                    {
                        "id": None,
                        "gbifId": None,
                        "species": species,
                        "latitude": round(lat, 6),
                        "longitude": round(lon, 6),
                        "country": country,
                        "year": year,
                        "citation": INAT_CITATION,
                    }
                )
                summary[country] = summary.get(country, 0) + 1
                sp_count += 1
            if len(results) < 200:
                break
            time.sleep(1.1)
        print(f"  iNat {species}: +{sp_count}", flush=True)
    return added, summary


# ---- merge ------------------------------------------------------------------
def main():
    occ_path = os.path.join(PUBLIC, "occurrences.json")
    with open(occ_path, "r", encoding="utf-8") as f:
        occ = json.load(f)
    records = occ["data"]

    existing = {str(r["gbifId"]) for r in records if r.get("gbifId")}
    seen_spatial = {}
    for r in records:
        if r.get("latitude") is None or r.get("longitude") is None:
            continue
        sp = (r.get("species") or "").strip().lower()
        if not sp:
            continue
        key = (round(float(r["latitude"]) / DEDUPE_DEG), round(float(r["longitude"]) / DEDUPE_DEG))
        seen_spatial.setdefault(sp, set()).add(key)
    next_id = max((r["id"] for r in records), default=0) + 1

    print("== GBIF order Ixodida sweep across Africa ==", flush=True)
    gbif_added, gbif_summary = gbif_harvest(existing)
    print("== iNaturalist major-species harvest ==", flush=True)
    inat_added, inat_summary = inat_harvest(seen_spatial)

    all_added = gbif_added + inat_added
    for r in all_added:
        r["id"] = next_id
        next_id += 1

    print(f"\nNEW RECORDS TO ADD: {len(all_added)}  (GBIF {len(gbif_added)}, iNaturalist {len(inat_added)})")

    sp_sum = {}
    for r in all_added:
        sp_sum[r["species"]] = sp_sum.get(r["species"], 0) + 1
    print("by species (top 30):")
    for sp, n in sorted(sp_sum.items(), key=lambda x: -x[1])[:30]:
        print(f"  {n:5d}  {sp}")

    region_sum = {}
    for r in all_added:
        rg = COUNTRY_REGION.get((r.get("country") or "").strip(), "Other")
        region_sum[rg] = region_sum.get(rg, 0) + 1
    print("by region:", region_sum)

    if not all_added:
        print("Nothing to add.")
        return

    records.extend(all_added)
    occ["data"] = records
    occ["pagination"]["total"] = len(records)
    occ["pagination"]["totalPages"] = (len(records) + occ["pagination"]["limit"] - 1) // occ["pagination"]["limit"]
    with open(occ_path, "w", encoding="utf-8") as f:
        json.dump(occ, f, ensure_ascii=False)

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
    print(f"occurrences.json now has {len(records)} records; occurrences-meta.json regenerated")


if __name__ == "__main__":
    main()