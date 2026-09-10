import json
import math
import random
import sys

from shapely.geometry import Point
from shapely.prepared import prep
from shapely.geometry import shape

OCC = "public/occurrences.json"
COUNTRIES = "public/health/livestock-countries.geojson"


def canon(country: str) -> str:
    c = (country or "").strip()
    m = {
        "Congo, Democratic Republic of the": "Democratic Republic of the Congo",
        "Tanzania, United Republic of": "United Republic of Tanzania",
        "Tanzania": "United Republic of Tanzania",
        "C\u00f4te d'Ivoire": "Ivory Coast",
        "Swaziland": "Eswatini",
        "Reunion": "R\u00e9union",
    }
    return m.get(c, c)


NORTH = {"Morocco", "Algeria", "Tunisia", "Libya", "Egypt", "Western Sahara"}

MADAGASCAR_ONLY = {
    "Ixodes nesomys",
    "Ixodes domerguei",
    "Ixodes randrianasoloi",
    "Ixodes lemuris",
    "Ixodes albignaci",
    "Haemaphysalis nesomys",
    "Carios madagascariensis",
    "Amblyomma astrion",
}

RANGES = {
    "Hyalomma marginatum": {
        "Morocco", "Algeria", "Tunisia", "Libya", "Egypt", "Western Sahara",
        "Mauritania", "Senegal", "Gambia", "Guinea-Bissau", "Mali", "Burkina Faso",
        "Niger", "Chad", "Sudan", "Nigeria", "Ghana", "Togo", "Benin", "Ivory Coast",
        "Cameroon", "Central African Republic", "Cabo Verde",
    },
    "Hyalomma rufipes": {
        "Mauritania", "Western Sahara", "Senegal", "Gambia", "Guinea-Bissau", "Mali",
        "Burkina Faso", "Niger", "Chad", "Sudan", "South Sudan", "Ethiopia", "Somalia",
        "Djibouti", "Kenya", "Uganda", "United Republic of Tanzania", "Rwanda", "Burundi",
        "Malawi", "Mozambique", "Zambia", "Zimbabwe", "Botswana", "Namibia", "South Africa",
        "Eswatini", "Angola", "Nigeria", "Benin", "Togo", "Ghana", "Ivory Coast",
        "Cameroon", "Central African Republic", "Democratic Republic of the Congo", "Congo",
    },
    "Rhipicephalus microplus": {
        "Senegal", "Gambia", "Guinea-Bissau", "Guinea", "Sierra Leone", "Liberia",
        "Ivory Coast", "Ghana", "Togo", "Benin", "Nigeria", "Burkina Faso", "Cameroon",
        "Central African Republic", "Chad", "South Sudan", "Ethiopia", "Kenya", "Uganda",
        "United Republic of Tanzania", "Rwanda", "Burundi", "South Africa", "Eswatini",
        "Lesotho", "Mozambique", "Zambia", "Zimbabwe", "Malawi", "Botswana", "Namibia",
        "Angola", "Democratic Republic of the Congo", "Congo", "Gabon", "Equatorial Guinea",
        "Madagascar", "Comoros", "Mauritius", "Mayotte", "R\u00e9union", "Seychelles",
        "Sao Tome and Principe", "Cabo Verde",
    },
    "Rhipicephalus appendiculatus": {
        "Angola", "Botswana", "Burundi", "Democratic Republic of the Congo", "Eswatini",
        "Ethiopia", "Kenya", "Malawi", "Mozambique", "Namibia", "Rwanda", "South Africa",
        "South Sudan", "United Republic of Tanzania", "Uganda", "Zambia", "Zimbabwe",
    },
    "Rhipicephalus simus": {
        "Mauritania", "Senegal", "Gambia", "Guinea-Bissau", "Guinea", "Sierra Leone",
        "Liberia", "Ivory Coast", "Ghana", "Togo", "Benin", "Nigeria", "Burkina Faso",
        "Cameroon", "Central African Republic", "Chad", "Sudan", "South Sudan", "Ethiopia",
        "Eritrea", "Djibouti", "Somalia", "Kenya", "Uganda", "United Republic of Tanzania",
        "Rwanda", "Burundi", "South Africa", "Eswatini", "Lesotho", "Mozambique", "Zambia",
        "Zimbabwe", "Malawi", "Botswana", "Namibia", "Angola", "Democratic Republic of the Congo",
        "Congo", "Gabon", "Equatorial Guinea",
    },
    "Hyalomma aegyptium": set(NORTH),
    "Hyalomma detritum": set(NORTH),
    "Dermacentor marginatus": {"Morocco", "Algeria", "Tunisia"},
    "Ixodes ricinus": {"Morocco", "Algeria", "Tunisia"},
    "Haemaphysalis punctata": {"Morocco", "Algeria", "Tunisia"},
    "Rhipicephalus pusillus": {"Morocco", "Algeria", "Tunisia"},
    "Hyalomma lusitanicum": {"Morocco", "Algeria", "Tunisia"},
    "Hyalomma scupense": {"Morocco", "Algeria", "Tunisia"},
}

for sp in MADAGASCAR_ONLY:
    RANGES[sp] = {"Madagascar"}


def load_country_polygons():
    with open(COUNTRIES, "r", encoding="utf-8") as f:
        fc = json.load(f)
    by_name = {}
    for feat in fc["features"]:
        p = feat["properties"]
        geom = shape(feat["geometry"])
        names = {p.get("CN"), p.get("name")}
        for n in names:
            if n:
                by_name[n] = geom
        by_name[p.get("G0")] = geom
    return by_name


def sample_point_in(geom_prepared, geom, rng):
    minx, miny, maxx, maxy = geom.bounds
    for _ in range(400):
        lon = rng.uniform(minx, maxx)
        lat = rng.uniform(miny, maxy)
        pt = Point(lon, lat)
        if geom_prepared.contains(pt):
            return (lon, lat)
    cx, cy = geom.representative_point().x, geom.representative_point().y
    return (cx, cy)


def main() -> None:
    rng = random.Random(20260910)

    with open(OCC, "r", encoding="utf-8") as f:
        occ = json.load(f)

    polygons = load_country_polygons()

    species_counts = {}
    for r in occ["data"]:
        sp = r.get("species") or ""
        species_counts[sp] = species_counts.get(sp, 0) + 1

    prepared = {name: prep(g) for name, g in polygons.items()}

    moved = 0
    per_species = {}

    # First pass: collect in-range synthetic records per species to weight targets.
    for r in occ["data"]:
        sp = (r.get("species") or "").strip()
        allowed = RANGES.get(sp)
        if allowed is None:
            continue
        c = canon(r.get("country"))
        if c in allowed:
            species_counts.setdefault(sp, {})
    weights = {}
    for r in occ["data"]:
        sp = (r.get("species") or "").strip()
        allowed = RANGES.get(sp)
        if allowed is None:
            continue
        c = canon(r.get("country"))
        if c in allowed:
            w = weights.setdefault(sp, {})
            w[c] = w.get(c, 0) + 1

    target_cache = {}

    for r in occ["data"]:
        sp = (r.get("species") or "").strip()
        allowed = RANGES.get(sp)
        if allowed is None:
            continue
        if not str(r.get("gbifId") or "").startswith("synth_"):
            continue
        c = canon(r.get("country"))
        if c in allowed:
            continue

        if sp not in target_cache:
            w = weights.get(sp, {})
            keys = sorted(allowed)
            wts = [0.5 + w.get(k, 0) for k in keys]
            target_cache[sp] = (keys, wts)
        keys, wts = target_cache[sp]
        tc = rng.choices(keys, weights=wts)[0]

        geom = polygons.get(tc)
        if geom is None:
            # country not covered by polygon source -> skip to a covered one
            covered = [k for k in keys if k in polygons]
            if not covered:
                print(f"  WARN no polygon target for {sp}; leaving in place")
                continue
            gc = rng.choices(covered, weights=[0.5 + w.get(k, 0) for k in covered])[0]
            geom = polygons[gc]
            tc = gc
        lon, lat = sample_point_in(prepared[tc], geom, rng)
        r["latitude"] = round(lat, 5)
        r["longitude"] = round(lon, 5)
        r["country"] = tc
        moved += 1
        per_species[sp] = per_species.get(sp, 0) + 1

    with open(OCC, "w", encoding="utf-8") as f:
        json.dump(occ, f, ensure_ascii=False, separators=(",", ":"))

    print(f"relocated {moved} out-of-range synthetic records into species ranges")
    for sp, n in sorted(per_species.items(), key=lambda x: -x[1]):
        print(f"  {sp}: {n}")
    print("total records unchanged:", len(occ["data"]))


if __name__ == "__main__":
    sys.exit(main())