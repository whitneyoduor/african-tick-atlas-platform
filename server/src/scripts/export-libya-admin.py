# -*- coding: utf-8 -*-
"""Adds Libya admin units to the atlas (missing from African_GADM_ADM2.gpkg).

GADM provides no level-2 layer for Libya (gadm41_LBY.gpkg contains ADM0 + ADM1
only), so Libya is represented at level 1: the 22 shabiyas. This mirrors the
other atlas countries --- an admin-unit choropleth --- and fills the geographic
gap that previously made Libya invisible on map pages.

Source: GADM 4.1 (https://geodata.ucdavis.edu/gadm/gadm4.1/gpkg/gadm41_LBY.gpkg)

Output: public/rc-data/geo/LBY.json (same schema as export-adm2-geojson.py)
Also patches public/rc-data/index.json with a Libya entry.

Run:  python server/src/scripts/export-libya-admin.py [path-to-gadm41_LBY.gpkg]
"""
import json
import os
import sys

import geopandas as gpd
from shapely.geometry import mapping

GPKG = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\HP\AppData\Local\Temp\opencode\gadm41_LBY.gpkg"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
GEO_DIR = os.path.join(ROOT, "public", "rc-data", "geo")
INDEX = os.path.join(ROOT, "public", "rc-data", "index.json")
OUT = os.path.join(GEO_DIR, "LBY.json")

SIMPLIFY_TOLERANCE = 0.005


def main():
    print("Reading", GPKG)
    gdf = gpd.read_file(GPKG, layer="ADM_ADM_1")
    print("  level-1 features:", len(gdf))
    if gdf.crs and gdf.crs.is_geographic is False:
        gdf = gdf.to_crs(epsg=4326)

    cols = [c for c in ["GID_0", "COUNTRY", "GID_1", "NAME_1"] if c in gdf.columns]
    sub = gdf[cols + ["geometry"]].copy()
    sub["geometry"] = sub.geometry.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)

    features = []
    for _, row in sub.iterrows():
        props = {c: row[c] for c in cols}
        props["GID_2"] = ""
        props["NAME_2"] = ""
        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": mapping(row.geometry),
        })

    fc = {"type": "FeatureCollection", "features": features}
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(fc, fh, ensure_ascii=False, separators=(",", ":"))
    print("  wrote", OUT, "features:", len(features), "MB:", round(os.path.getsize(OUT) / 1e6, 2))

    idx = json.load(open(INDEX, encoding="utf-8"))
    if any(c["gid"] == "LBY" for c in idx["countries"]):
        print("  LBY already in index.json")
    else:
        species = ["Argas persicus", "Hyalomma excavatum", "Dermacentor marginatus",
                   "Rhipicephalus bursa", "Rhipicephalus annulatus", "Hyalomma marginatum",
                   "Haemaphysalis punctata", "Ixodes ricinus"]
        idx["countries"].append({
            "gid": "LBY", "name": "Libya", "adm2_count": len(features), "species": species,
        })
        with open(INDEX, "w", encoding="utf-8") as fh:
            json.dump(idx, fh, ensure_ascii=False, separators=(",", ":"))
        print("  added LBY to index.json (adm2_count=%d)" % len(features))


if __name__ == "__main__":
    main()