"""Convert African_GADM_ADM2.gpkg to simplified per-country GeoJSON.

Output: public/rc-data/geo/{GID_0}.json
Each file is a GeoJSON FeatureCollection with ADM2 polygons.
Geometries are simplified to reduce file size for web serving.
"""
import json
import os
import sys

import geopandas as gpd

GPKG_PATH = os.path.expanduser(
    r"~/Downloads/African_GADM_ADM2.gpkg"
)
OUT_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "../../../public/rc-data/geo",
)

SIMPLIFY_TOLERANCE = 0.005  # degrees (~550 m). Tune if too large/small.

DRC_ALIAS = "Democratic Republic of the Congo"
COG_ALIAS = "Republic of the Congo"


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"Reading {GPKG_PATH} ...")
    gdf = gpd.read_file(GPKG_PATH)
    print(f"  {len(gdf)} features, CRS={gdf.crs}")

    cols = [c for c in ["GID_0", "COUNTRY", "GID_1", "NAME_1", "GID_2", "NAME_2"] if c in gdf.columns]
    missing = [c for c in ["GID_0", "GID_2", "NAME_1", "NAME_2"] if c not in gdf.columns]
    if missing:
        print("  WARNING: missing columns:", missing)
    if "geometry" not in gdf.columns:
        print("  ERROR: no geometry column")
        sys.exit(1)

    if gdf.crs and gdf.crs.is_geographic is False:
        print("  Projected CRS detected, converting to EPSG:4326")
        gdf = gdf.to_crs(epsg=4326)

    # Normalize Congo names to match the CSV dataset
    if "COUNTRY" in gdf.columns:
        gdf["COUNTRY"] = gdf["COUNTRY"].replace(DRC_ALIAS, "DRC").replace(COG_ALIAS, "Congo Republic")

    grouped = gdf.groupby("GID_0")
    print(f"  {len(grouped)} unique GID_0 countries")

    total_mb = 0
    for gid, sub in grouped:
        name = sub["COUNTRY"].iloc[0] if "COUNTRY" in sub.columns else gid
        print(f"  {gid} ({name}): {len(sub)} features")

        simplified = sub.copy()
        try:
            simplified["geometry"] = simplified.geometry.simplify(
                SIMPLIFY_TOLERANCE, preserve_topology=True
            )
        except Exception as e:
            print(f"    simplify failed: {e}")

        # Keep only needed columns
        keep = [c for c in cols if c in simplified.columns] + ["geometry"]
        simplified = simplified[keep]

        fc = json.loads(simplified.to_json())
        out_path = os.path.join(OUT_DIR, f"{gid}.json")
        with open(out_path, "w") as f:
            json.dump(fc, f)
        size_mb = os.path.getsize(out_path) / 1e6
        total_mb += size_mb
        print(f"    -> {gid}.json ({size_mb:.2f} MB)")

    print(f"\nDone. Total GeoJSON: {total_mb:.2f} MB {os.path.join(OUT_DIR)}")


if __name__ == "__main__":
    main()