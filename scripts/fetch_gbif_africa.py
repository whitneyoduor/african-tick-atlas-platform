#!/usr/bin/env python3
"""
Enriches public/occurrences.json with real GBIF occurrence records for the five
key species highlighted on the Maps page (R. appendiculatus, R. sanguineus,
R. microplus, H. marginatum, H. rufipes), filtered to African countries.

Purpose: the source GBIF download spreadsheet (tick_occurrence_simple.xlsx) only
captured a subset of the records GBIF actually holds for these species in many
African countries (e.g. R. sanguineus in Tunisia, Chad, Ghana, Niger, Western
Sahara were entirely absent). This script pulls the live GBIF Occurrence API for
every African country that has any record for these taxa and merges only the
brand-new ones (deduplicated by GBIF occurrence key) into occurrences.json,
then regenerates occurrences-meta.json.

Usage:  python scripts/fetch_gbif_africa.py
Output: appends to public/occurrences.json, rewrites public/occurrences-meta.json
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
API = "https://api.gbif.org/v1/occurrence/search"
UA = {"User-Agent": "AfricanTickAtlas-Research/1.0 (research enrichment; contact via GitHub)"}

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

# Exact accepted species as labelled on the platform (matching species.ts KEY_SPECIES).
SPECIES = {
    "Rhipicephalus appendiculatus": 2183547,
    "Rhipicephalus sanguineus": 2183597,
    "Rhipicephalus microplus": 2183657,
    "Hyalomma marginatum": 4548126,
    "Hyalomma rufipes": 9031792,
}

CITATION = (
    "GBIF.org, 2026. GBIF Occurrence API, retrieved via https://api.gbif.org "
    "(supplements the original download https://doi.org/10.15468/dl.jve6v3) "
    "[Accessed 9 September 2026]."
)

_retry = 0


def get_json(url):
    global _retry
    attempt = 0
    while True:
        attempt += 1
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=15) as r:
                _retry = 0
                return json.load(r)
        except Exception as e:
            if attempt >= 3:
                raise
            backoff = 2 * attempt
            print(f"    ... retry {attempt}/2 after {type(e).__name__} in {backoff}s", file=sys.stderr, flush=True)
            time.sleep(backoff)
    return None


def fetch_country(taxon_key, cc):
    """All coordinate-bearing occurrences for one taxon in one country."""
    import socket

    socket.setdefaulttimeout(15)
    rows = []
    offset = 0
    stall = 0
    while True:
        q = urllib.parse.urlencode(
            {
                "taxonKey": taxon_key,
                "country": cc,
                "hasCoordinate": "true",
                "limit": 300,
                "offset": offset,
            }
        )
        d = get_json(f"{API}?{q}")
        for r in d.get("results", []):
            if r.get("decimalLatitude") is None or r.get("decimalLongitude") is None:
                continue
            rows.append(r)
        n = len(d.get("results", []))
        offset += n
        if not d.get("endOfRecords", False):
            break
        if n == 0:
            stall += 1
            if stall > 3:
                break
        time.sleep(1)
    return rows


def canonical(record):
    """Best-guess platform name for a GBIF record (should already match)."""
    sn = record.get("scientificName") or record.get("species") or ""
    for name in SPECIES:
        if name.split() and name.lower() in (sn.lower().split(" (")[0].split("(")[0].strip()):
            return name
    return (sn or "").split("(")[0].strip()


def main():
    occ_path = os.path.join(PUBLIC, "occurrences.json")
    checkpoint_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".gbif-cache", "fetched.json")
    os.makedirs(os.path.dirname(checkpoint_path), exist_ok=True)
    done = set()
    if os.path.exists(checkpoint_path):
        with open(checkpoint_path, "r", encoding="utf-8") as f:
            done = set(json.load(f))

    with open(occ_path, "r", encoding="utf-8") as f:
        occ = json.load(f)
    records = occ["data"]
    existing = {str(r["gbifId"]) for r in records if r.get("gbifId")}
    next_id = max((r["id"] for r in records), default=0) + 1

    # Only query country/taxon combinations GBIF actually has records for
    # (facet counts collected ahead of time), to keep the request count low.
    facets_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".gbif-cache", "facets.json")
    with open(facets_path, "r", encoding="utf-8") as f:
        facets = json.load(f)
    facet_key = {
        "Rhipicephalus appendiculatus": "appendiculatus",
        "Rhipicephalus sanguineus": "sanguineus",
        "Rhipicephalus microplus": "microplus",
        "Hyalomma marginatum": "marginatum",
        "Hyalomma rufipes": "rufipes",
    }
    combos = 0
    for sp in SPECIES:
        for cc in facets[facet_key[sp]]["have_cc"]:
            combos += 1
    print(f"fetching {combos} country x species combos", flush=True)

    added = []      # [record, ...]
    summary = {}    # species -> {country: count_added}
    done_here = 0
    import threading

    heartbeat_stop = threading.Event()

    def heartbeat():
        while not heartbeat_stop.is_set():
            print(f"    ... heartbeat: {done_here}/{combos} combos done, {len(added)} records staged", flush=True)
            heartbeat_stop.wait(25)

    threading.Thread(target=heartbeat, daemon=True).start()
    for species, taxon_key in SPECIES.items():
        summary[species] = {}
        cc_list = facets[facet_key[species]]["have_cc"]
        for cc in cc_list:
            name = AFRICAN.get(cc, cc)
            if f"{species}|{cc}" in done:
                continue
            try:
                rows = fetch_country(taxon_key, cc)
            except Exception as e:
                print(f"  ! {species} {name}: fetch failed: {e}", file=sys.stderr, flush=True)
                time.sleep(2)
                continue
            done_here += 1
            done.add(f"{species}|{cc}")
            with open(checkpoint_path, "w", encoding="utf-8") as f:
                json.dump(sorted(done), f)
            print(f"  [{done_here}/{combos}] {species} · {name}: {len(rows)} coords", flush=True)
            fresh = []
            for r in rows:
                gid = str(r.get("key"))
                if gid in existing:
                    continue
                existing.add(gid)
                fresh.append(
                    {
                        "id": next_id,
                        "gbifId": gid,
                        "species": canonical(r),
                        "latitude": r["decimalLatitude"],
                        "longitude": r["decimalLongitude"],
                        "country": name,
                        "year": r.get("year"),
                        "citation": CITATION,
                    }
                )
                next_id += 1
            if fresh:
                summary[species][name] = len(fresh)
                added.extend(fresh)
            time.sleep(0.4)

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