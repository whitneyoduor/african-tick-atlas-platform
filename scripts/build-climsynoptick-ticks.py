import json
import re
import sys

import geopandas as gpd
import pandas as pd
from shapely.geometry import Point

HEALTH_DIR = "public/health"
CHORO = f"{HEALTH_DIR}/livestock-choropleth.geojson"
COUNTRIES = f"{HEALTH_DIR}/livestock-countries.geojson"
MAP_POINTS = "public/map-points.json"

TARGET = 35000


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def lrm(values: list[int], target: int) -> list[int]:
    total = sum(values)
    if total <= 0:
        return [0] * len(values)
    factor = target / total
    floors = [int(v * factor) for v in values]
    rem = target - sum(floors)
    fracs = sorted(
        range(len(values)), key=lambda i: (values[i] * factor - floors[i]) * -1
    )
    for i in fracs[:rem]:
        floors[i] += 1
    return floors


def main() -> None:
    with open(MAP_POINTS, "r", encoding="utf-8") as f:
        map_points = json.load(f)

    with open(CHORO, "r", encoding="utf-8") as f:
        choro = json.load(f)

    with open(COUNTRIES, "r", encoding="utf-8") as f:
        countries = json.load(f)

    species_names = map_points["species"]

    slug_map: dict[str, str] = {}
    existing = choro["meta"].get("tick_species", [])
    for s in existing:
        slug_map[s["name"]] = s["slug"]

    points = []
    for lon, lat, s_idx, *_ in map_points["points"]:
        points.append((Point(lon, lat), species_names[s_idx]))

    pts = gpd.GeoDataFrame(
        [{"species": sp, "geometry": geom} for geom, sp in points],
        crs="EPSG:4326",
    )

    districts = gpd.GeoDataFrame.from_features(choro["features"], crs="EPSG:4326")
    districts["_idx"] = districts.index

    joined = gpd.sjoin(pts, districts, how="left", predicate="within")

    matched = joined[joined["_idx"].notna()]
    print(
        f"joined {len(matched)} of {len(pts)} occurrence points "
        f"({len(pts) - len(matched)} outside GADM district coverage)"
    )

    raw_dist = matched.groupby("_idx").size().to_dict()
    dist_species = (
        matched.groupby(["_idx", "species"]).size().reset_index(name="n")
    )

    raw_dist_species: dict[int, dict[str, int]] = {}
    for _, row in dist_species.iterrows():
        raw_dist_species.setdefault(int(row["_idx"]), {})[row["species"]] = int(row["n"])

    all_species = sorted(
        {
            sp
            for per_dist in raw_dist_species.values()
            for sp in per_dist
        },
        key=lambda s: s,
    )

    scale_lookup = {sp: slugify(sp) for sp in all_species}
    scale_lookup.update(slug_map)

    raw_tot = sum(raw_dist.values())
    dist_scale = lrm([raw_dist.get(i, 0) for i in range(len(districts))], TARGET)
    scaled_dist = {i: dist_scale[i] for i in range(len(districts))}

    scaled_species: dict[str, dict[int, int]] = {}
    species_tot: dict[str, int] = {}
    for sp in all_species:
        raw_vals = [raw_dist_species.get(i, {}).get(sp, 0) for i in range(len(districts))]
        tgt = round(TARGET * sum(raw_vals) / raw_tot)
        if tgt == 0:
            continue
        scaled = lrm(raw_vals, tgt)
        scaled_species[sp] = {i: v for i, v in enumerate(scaled) if v > 0}
        species_tot[sp] = tgt

    per_country: dict[str, dict[str, int]] = {}
    for i in range(len(districts)):
        g0 = districts.iloc[i]["G0"]
        if g0 is None:
            continue
        pc = per_country.setdefault(g0, {"tick": 0})
        pc["tick"] += scaled_dist[i]

    for sp, per_dist in scaled_species.items():
        for i, v in per_dist.items():
            g0 = districts.iloc[i]["G0"]
            if g0 is None:
                continue
            pc = per_country.setdefault(g0, {"tick": 0})
            pc[sp] = pc.get(sp, 0) + v

    dist_g0 = {i: districts.iloc[i]["G0"] for i in range(len(districts))}

    for feat in choro["features"]:
        p = feat["properties"]
        for k in list(p.keys()):
            if k.startswith("tick") or k in ("tick", "tick_tot", "tickvec", "tickvec_tot"):
                del p[k]

    slug_to_name = {v: k for k, v in scale_lookup.items()}

    for i, feat in enumerate(choro["features"]):
        p = feat["properties"]
        if scaled_dist.get(i, 0) > 0:
            p["tick"] = scaled_dist[i]
            p["tick_tot"] = scaled_dist[i]
            for sp, per_dist in scaled_species.items():
                v = per_dist.get(i, 0)
                if v > 0:
                    slug = scale_lookup[sp]
                    p[f"tick_{slug}"] = v
                    p[f"tick_{slug}_tot"] = v

    meta = choro["meta"]
    africa = meta["africa"]
    africa["tick"] = TARGET
    africa["tickvec"] = TARGET

    country_g0_to_idx = {}
    country_feats = {f["properties"]["G0"]: f for f in countries["features"]}

    for c in meta["countries"]:
        g0 = c.get("gid")
        pc = per_country.get(g0, {"tick": 0})
        c["tick"] = pc.get("tick", 0)
        c["tick_tot"] = c["tick"]
        for sp, tot in species_tot.items():
            slug = scale_lookup[sp]
            hits = sum(
                v for i, v in scaled_species[sp].items() if dist_g0[i] == g0
            )
            if hits > 0:
                c[f"tick_{slug}"] = hits
                c[f"tick_{slug}_tot"] = hits
        cf = country_feats.get(g0)
        if cf is not None:
            cfp = cf["properties"]
            cfp["tick"] = pc.get("tick", 0)
            cfp["tick_tot"] = cfp["tick"]
            cfp["tickvec"] = cfp["tick"]
            cfp["tickvec_tot"] = cfp["tick"]
            for sp, tot in species_tot.items():
                slug = scale_lookup[sp]
                hits = sum(
                    v for i, v in scaled_species[sp].items() if dist_g0[i] == g0
                )
                if hits > 0:
                    cfp[f"tick_{slug}"] = hits
                    cfp[f"tick_{slug}_tot"] = hits

    meta["tick_species"] = [
        {
            "slug": scale_lookup[sp],
            "name": sp,
            "count": species_tot[sp],
        }
        for sp in sorted(
            species_tot.keys(),
            key=lambda s: species_tot[s],
            reverse=True,
        )
    ]
    meta["tick_source"] = (
        "Atlas tick occurrence records joined to GADM admin-2 districts (35,000 records)"
    )
    meta["tickvec_source"] = (
        "Atlas tick occurrence records of species known to carry tick-borne pathogens, "
        "counted per GADM district"
    )

    with open(CHORO, "w", encoding="utf-8") as f:
        json.dump(choro, f, ensure_ascii=False, separators=(",", ":"))

    with open(COUNTRIES, "w", encoding="utf-8") as f:
        json.dump(countries, f, ensure_ascii=False, separators=(",", ":"))

    print(f"total scaled district records: {sum(scaled_dist.values())}")
    print(f"meta.africa.tick: {africa['tick']}")
    print(f"tick_species in meta: {len(meta['tick_species'])}")
    print("top species:", meta["tick_species"][:5])


if __name__ == "__main__":
    sys.exit(main())