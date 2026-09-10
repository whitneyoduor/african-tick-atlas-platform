#!/usr/bin/env python3
"""
Adds the remaining REAL worldwide GBIF occurrence records (with coordinates) for
the five key species highlighted on the Maps page.

African coordinates for these species are already fully captured (see
fetch_gbif_africa.py and fetch_africa_ticks.py), which is why the African map
data does not change. This script merges only the *non-African* GBIF records so
the dataset's global totals (species pages, occurrences-meta.json) reflect the
complete public record for R. appendiculatus, R. sanguineus, R. microplus,
H. marginatum and H. rufipes. Nothing is fabricated: every record is a real GBIF
occurrence with coordinates, deduplicated by GBIF occurrence key.

The Maps page intentionally renders only African-country, on-land points inside
the Africa window (build-map-data.cjs), so none of these global records appear
on the map — they only raise the dataset totals.

Usage:  python scripts/fetch_gbif_global_5.py
Output: appends to public/occurrences.json, rewrites public/occurrences-meta.json
"""
import json
import os
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
API = "https://api.gbif.org/v1/occurrence/search"
UA = {"User-Agent": "AfricanTickAtlas-Research/1.0 (research enrichment; contact via GitHub)"}

SPECIES = {
    "Rhipicephalus appendiculatus": 2183547,
    "Rhipicephalus sanguineus": 2183597,
    "Rhipicephalus microplus": 2183657,
    "Hyalomma marginatum": 4548126,
    "Hyalomma rufipes": 9031792,
}

CITATION = (
    "GBIF.org, 2026. GBIF Occurrence API worldwide sweep for the five key species, "
    "https://api.gbif.org [Accessed 9 September 2026]."
)


def get_json(url):
    attempt = 0
    while True:
        attempt += 1
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.load(r)
        except Exception as e:
            if attempt >= 4:
                raise
            backoff = 3 * attempt
            print(f"    ... retry {attempt}/3 after {type(e).__name__} in {backoff}s", flush=True)
            time.sleep(backoff)


def fetch_all(taxon_key):
    rows = []
    offset = 0
    while True:
        q = urllib.parse.urlencode(
            {
                "taxonKey": taxon_key,
                "hasCoordinate": "true",
                "limit": 300,
                "offset": offset,
            }
        )
        d = get_json(f"{API}?{q}")
        res = d.get("results", [])
        rows.extend(res)
        offset += len(res)
        if not d.get("endOfRecords", False):
            break
        if not res:
            break
        time.sleep(0.4)
    return rows


def main():
    occ_path = os.path.join(PUBLIC, "occurrences.json")
    with open(occ_path, "r", encoding="utf-8") as f:
        occ = json.load(f)
    records = occ["data"]
    existing = {str(r["gbifId"]) for r in records if r.get("gbifId")}
    next_id = max((r["id"] for r in records), default=0) + 1

    added = []
    summary = {}
    for species, taxon_key in SPECIES.items():
        try:
            rows = fetch_all(taxon_key)
        except Exception as e:
            print(f"  ! {species}: fetch failed: {e}", file=sys.stderr, flush=True)
            continue
        fresh = 0
        for r in rows:
            gid = str(r.get("key"))
            if gid in existing:
                continue
            lat, lng = r.get("decimalLatitude"), r.get("decimalLongitude")
            if lat is None or lng is None:
                continue
            existing.add(gid)
            added.append(
                {
                    "id": next_id,
                    "gbifId": gid,
                    "species": species,
                    "latitude": lat,
                    "longitude": lng,
                    "country": r.get("country") or r.get("countryCode") or "Unknown",
                    "year": r.get("year"),
                    "citation": CITATION,
                }
            )
            next_id += 1
            fresh += 1
        summary[species] = fresh
        print(f"  {species}: +{fresh} new (of {len(rows)} worldwide)", flush=True)

    print(f"\nNEW WORLDWIDE RECORDS TO ADD: {len(added)}")
    for sp, n in summary.items():
        print(f"  {sp}: {n}")

    if not added:
        print("Nothing to add.")
        return

    records.extend(added)
    occ["data"] = records
    occ["pagination"]["total"] = len(records)
    occ["pagination"]["totalPages"] = (len(records) + occ["pagination"]["limit"] - 1) // occ["pagination"]["limit"]
    with open(occ_path, "w", encoding="utf-8") as f:
        json.dump(occ, f, ensure_ascii=False)

    from collections import Counter
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
    print("note: Maps page point count is unchanged (Africa-only render filter).")


if __name__ == "__main__":
    main()