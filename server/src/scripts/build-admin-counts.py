# -*- coding: utf-8 -*-
"""Adds per-district occurrence counts to the Health page choropleth.

Three point datasets are aggregated to GADM ADM2 districts (admin-unit level) so
the Health page can render every layer as a district choropleth rather than as
clustered points:

    facilities   public/health/facilities.geojson        (mapped health facilities)
    tick         public/tick_occurrences.geojson         (GBIF tick occurrences)
    pathogen     public/genbank/disease-coordinates.json (disease/pathogen records)

Each point is mapped to a country code via its country name (normalised /
alias-corrected) and then assigned to the district whose polygon contains it
(bbox-pruned point-in-polygon). Points outside the 48 atlas countries, with no
country, or falling in no district are dropped.

Output (augmented in place):
    public/health/livestock-choropleth.geojson  (+ facility, tick, pathogen counts)
    public/health/livestock-countries.geojson   (+ country totals + meta)

Run:  python server/src/scripts/build-admin-counts.py
"""
import io
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PUB = os.path.join(ROOT, "public", "health")
CHORO = os.path.join(PUB, "livestock-choropleth.geojson")
COUNTRIES = os.path.join(PUB, "livestock-countries.geojson")
FACILITIES = os.path.join(PUB, "facilities.geojson")
TICK = os.path.join(ROOT, "public", "tick_occurrences.geojson")
DISEASE = os.path.join(ROOT, "public", "genbank", "disease-coordinates.json")


def norm(s):
    s = (s or "").strip().lower()
    s = s.replace("’", "'").replace("'", "").replace(".", "")
    for a, b in [("é", "e"), ("è", "e"), ("ê", "e"), ("ë", "e"), ("ï", "i"), ("ô", "o"),
                 ("û", "u"), ("ç", "c"), ("ã", "a"), ("õ", "o"), ("ñ", "n"), ("ü", "u"),
                 ("ö", "o"), ("à", "a"), ("á", "a"), ("í", "i"), ("ó", "o"), ("ú", "u"),
                 ("ä", "a"), ("å", "a"), ("ø", "o")]:
        s = s.replace(a, b)
    return " ".join(s.split())


# canonical short names used in the geo CN -> G0
CN_COUNTRIES = {
    "angola": "AGO", "burundi": "BDI", "benin": "BEN", "burkina faso": "BFA",
    "botswana": "BWA", "central african republic": "CAF", "cote d ivoire": "CIV",
    "cameroon": "CMR", "drc": "COD", "congo republic": "COG", "djibouti": "DJI",
    "algeria": "DZA", "egypt": "EGY", "eritrea": "ERI", "ethiopia": "ETH",
    "gabon": "GAB", "ghana": "GHA", "guinea": "GIN", "gambia": "GMB",
    "guinea bissau": "GNB", "equatorial guinea": "GNQ", "kenya": "KEN",
    "liberia": "LBR", "morocco": "MAR", "madagascar": "MDG", "mali": "MLI",
    "mozambique": "MOZ", "mauritania": "MRT", "malawi": "MWI", "namibia": "NAM",
    "niger": "NER", "nigeria": "NGA", "rwanda": "RWA", "sudan": "SDN",
    "senegal": "SEN", "sierra leone": "SLE", "somalia": "SOM",
    "south sudan": "SSD", "sao tome and principe": "STP", "swaziland": "SWZ",
    "chad": "TCD", "togo": "TGO", "tunisia": "TUN", "tanzania": "TZA",
    "uganda": "UGA", "south africa": "ZAF", "zambia": "ZMB", "zimbabwe": "ZWE",
}

# point-data country name (normalised) -> canonical CN
POINT_ALIASES = {
    "democratic republic of the congo": "drc",
    "congo democratic republic of the": "drc",
    "congo": "congo republic",
    "congo republic of the": "congo republic",
    "republic of the congo": "congo republic",
    "swaziland": "swaziland",
    "eswatini": "swaziland",
    "cape verde": "cabo verde",
    "cabo verde": "cabo verde",
    "sao tome and principe": "sao tome and principe",
    "tanzania united republic of": "tanzania",
    "united republic of tanzania": "tanzania",
    "cote d ivoire": "cote d ivoire",
}


def country_to_g0(name):
    if not name:
        return None
    key = norm(name)
    canon = POINT_ALIASES.get(key) or key
    return CN_COUNTRIES.get(canon)


def in_ring(pt, ring):
    x, y = pt
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def point_in_geometry(pt, geom):
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    for poly in polys:
        if not in_ring(pt, poly[0]):
            continue
        for ring in poly[1:]:
            if in_ring(pt, ring):
                return False
        return True
    return False


def geom_bbox(geom):
    minx = miny = float("inf")
    maxx = maxy = -float("inf")
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    for poly in polys:
        for ring in poly:
            for c in ring:
                if c[0] < minx: minx = c[0]
                if c[0] > maxx: maxx = c[0]
                if c[1] < miny: miny = c[1]
                if c[1] > maxy: maxy = c[1]
    return minx, miny, maxx, maxy


def main():
    print("loading choropleth + country features...")
    choro = json.load(io.open(CHORO, encoding="utf-8"))
    features = choro["features"]
    n = len(features)

    by_country = {}
    for idx, feat in enumerate(features):
        g0 = feat["properties"]["G0"]
        by_country.setdefault(g0, []).append((idx, geom_bbox(feat["geometry"]), feat["geometry"]))

    counts = {"facility": [0] * n, "tick": [0] * n, "pathogen": [0] * n}
    mapped = {"facility": 0, "tick": 0, "pathogen": 0}

    point_sources = {
        "facility": (FACILITIES, lambda f: (f["properties"]["co"], f["geometry"]["coordinates"])),
        "tick": (TICK, lambda f: (f["properties"]["country"], f["geometry"]["coordinates"])),
    }
    for key, (path, acc) in point_sources.items():
        print("  aggregating", key, "from", os.path.basename(path), "...")
        fc = json.load(io.open(path, encoding="utf-8"))
        for f in fc["features"]:
            try:
                cname, coords = acc(f)
            except Exception:
                continue
            if not coords or len(coords) != 2:
                continue
            lng, lat = coords[0], coords[1]
            if lat is None or lng is None:
                continue
            g0 = country_to_g0(cname)
            if not g0:
                continue
            for (idx, b, geom) in by_country.get(g0, []):
                if not (b[0] <= lng <= b[2] and b[1] <= lat <= b[3]):
                    continue
                if point_in_geometry((lng, lat), geom):
                    counts[key][idx] += 1
                    mapped[key] += 1
                    break

    print("  aggregating pathogen from disease-coordinates.json ...")
    dm = json.load(io.open(DISEASE, encoding="utf-8"))
    for di, (dname, obj) in enumerate(dm.items(), 1):
        for pt in obj.get("points", []):
            lat, lng = pt.get("lat"), pt.get("lng")
            if lat is None or lng is None:
                continue
            g0 = country_to_g0(pt.get("country"))
            if not g0:
                continue
            for (idx, b, geom) in by_country.get(g0, []):
                if not (b[0] <= lng <= b[2] and b[1] <= lat <= b[3]):
                    continue
                if point_in_geometry((lng, lat), geom):
                    counts["pathogen"][idx] += 1
                    mapped["pathogen"] += 1
                    break

    for key, arr in counts.items():
        for idx in range(n):
            c = arr[idx]
            if c > 0:
                features[idx]["properties"][key] = c
                features[idx]["properties"][key + "_tot"] = c

    country_agg = {}
    for idx, feat in enumerate(features):
        g0 = feat["properties"]["G0"]
        ca = country_agg.setdefault(g0, {"facility": 0, "tick": 0, "pathogen": 0})
        for key in counts:
            ca[key] += counts[key][idx]

    countries = json.load(io.open(COUNTRIES, encoding="utf-8"))
    for feat in countries["features"]:
        p = feat["properties"]
        ca = country_agg.get(p["G0"])
        if not ca:
            continue
        for key in counts:
            tot = ca[key]
            if tot > 0:
                p[key] = tot
                p[key + "_tot"] = tot

    meta = choro.setdefault("meta", {})
    africa = meta.setdefault("africa", {})
    sources = {
        "facility": "sub-Saharan health-facility census 2015, counted per GADM district",
        "tick": "GBIF tick occurrences, counted per GADM district",
        "pathogen": "tick-borne disease / pathogen records (disease-coordinates.json), counted per GADM district",
    }
    for key in counts:
        africa[key] = sum(ca[key] for ca in country_agg.values())
        meta[key + "_source"] = sources[key]

    with open(COUNTRIES, "w", encoding="utf-8") as fh:
        json.dump(countries, fh, ensure_ascii=False, separators=(",", ":"))
    with open(CHORO, "w", encoding="utf-8") as fh:
        json.dump(choro, fh, ensure_ascii=False, separators=(",", ":"))

    print("  africa counts:", {k: africa[k] for k in counts})
    print("  mapped points:", mapped)
    print("  wrote:", COUNTRIES, CHORO)


if __name__ == "__main__":
    main()
