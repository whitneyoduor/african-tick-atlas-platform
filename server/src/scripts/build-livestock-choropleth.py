import tifffile
import numpy as np
import json
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PUB = os.path.join(ROOT, "public", "health")
GEO_DIR = os.path.join(ROOT, "public", "rc-data", "geo")
INDEX = os.path.join(ROOT, "public", "rc-data", "index.json")
OUT = os.path.join(PUB, "livestock-choropleth.geojson")

RASTERS = [
    ("cattle", r"C:\Users\HP\Downloads\5_Ct_2015_Da.tif"),
    ("goat", r"C:\Users\HP\Downloads\5_Gt_2015_Da.tif"),
    ("sheep", r"C:\Users\HP\Downloads\5_Sh_2015_Da.tif"),
]

PIX = 1.0 / 12.0
PIX_INV = 12.0
W0, W1, S0, N1 = -26.0, 55.0, -36.0, 38.0
ROW0 = int((90.0 - N1) * PIX_INV)
ROW1 = int((90.0 - S0) * PIX_INV)
COL0 = int((W0 + 180.0) * PIX_INV)
COL1 = int((W1 + 180.0) * PIX_INV)
H = ROW1 - ROW0
W = COL1 - COL0

def lat_of(r):
    return 90.0 - (r + 0.5) * PIX

def lng_of(c):
    return (c + 0.5) * PIX - 180.0

def cell_area(lat):
    km = 111.32 * PIX
    return km * km * math.cos(math.radians(lat))

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

def clean_ring(ring):
    pts = []
    for c in ring:
        x = round(c[0], 3)
        y = round(c[1], 3)
        if pts and pts[-1][0] == x and pts[-1][1] == y:
            continue
        pts.append([x, y])
    if len(pts) > 1 and pts[0][0] == pts[-1][0] and pts[0][1] == pts[-1][1]:
        pts.pop()
    return pts

def clean_geom(geom):
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    out_polys = []
    for poly in polys:
        rings = [r for r in map(clean_ring, poly) if len(r) >= 3]
        if rings:
            out_polys.append(rings)
    if not out_polys:
        return None
    return {
        "type": geom["type"],
        "coordinates": out_polys[0] if geom["type"] == "Polygon" else out_polys,
    }

print("loading rasters...")
crops = {}
for name, path in RASTERS:
    t = tifffile.TiffFile(path)
    arr = t.pages[0].asarray().astype(np.float64)
    t.close()
    crops[name] = arr[ROW0:ROW1, COL0:COL1]
    print(" ", name, crops[name].shape, "mean", round(float(crops[name][crops[name] > 0].mean() if (crops[name] > 0).any() else 0), 2))

rows_lat = np.array([lat_of(r) for r in range(ROW0, ROW1)])
cell_area_w = np.array([cell_area(lat) for lat in rows_lat])  # per row, not weighted by deltas
cos_w = np.cos(np.radians(rows_lat))

print("indexing regions...")
idx = json.load(open(INDEX, "r", encoding="utf-8"))
features = []
grid = np.full((H, W), -1, dtype=np.int32)
fidx = 0
for country in idx["countries"]:
    gis = os.path.join(GEO_DIR, country["gid"] + ".json")
    geo = json.load(open(gis, "r", encoding="utf-8"))
    for f in geo["features"]:
        p = f["properties"]
        geom = f["geometry"]
        b = geom_bbox(geom)
        rmin_g = int((90.0 - b[3]) * PIX_INV) - 1
        rmax_g = int((90.0 - b[1]) * PIX_INV) + 1
        cmin_g = int((b[0] + 180.0) * PIX_INV) - 1
        cmax_g = int((b[2] + 180.0) * PIX_INV) + 1
        rmin = max(0, rmin_g - ROW0)
        rmax = min(H, rmax_g - ROW0)
        cmin = max(0, cmin_g - COL0)
        cmax = min(W, cmax_g - COL0)
        if rmax <= rmin or cmax <= cmin:
            fidx += 1
            continue
        for r in range(rmin, rmax):
            lat = lat_of(ROW0 + r)
            for c in range(cmin, cmax):
                if grid[r, c] != -1:
                    continue
                lng = lng_of(COL0 + c)
                if point_in_geometry((lng, lat), geom):
                    grid[r, c] = fidx
        features.append({
            "idx": fidx,
            "g0": p.get("GID_0", ""),
            "cn": p.get("COUNTRY", ""),
            "g1": p.get("GID_1", ""),
            "n1": p.get("NAME_1", ""),
            "g2": p.get("GID_2", ""),
            "n2": p.get("NAME_2", ""),
            "geom": geom,
        })
        fidx += 1

N = len(features)
print("regions:", N)

heads = {k: np.zeros(N) for k in ("cattle", "goat", "sheep")}
area_region = np.zeros(N)
africa = {k: 0.0 for k in ("cattle", "goat", "sheep")}
africa_area = 0.0

print("zonal statistics...")
rr, cc = np.nonzero(grid >= 0)
for r, c in zip(rr, cc):
    f = int(grid[r, c])
    area = cell_area_w[r]
    area_region[f] += area
    africa_area += area
    for k in ("cattle", "goat", "sheep"):
        v = crops[k][r, c]
        if v > 0:
            heads[k][f] += v
            africa[k] += v

print("building country rollups...")
countries = {}
for f in features:
    cu = countries.setdefault(f["g0"], {"gid": f["g0"], "name": f["cn"], "area": 0.0, "heads": {k: 0.0 for k in heads}})
    cu["area"] += area_region[f["idx"]]
    for k in heads:
        cu["heads"][k] += heads[k][f["idx"]]

country_rows = []
for cu in countries.values():
    row = {"gid": cu["gid"], "name": cu["name"] or cu["gid"]}
    for k in heads:
        row[k] = round(cu["heads"][k] / cu["area"], 2) if cu["area"] > 0 else 0.0
        row[k + "_tot"] = int(round(cu["heads"][k]))
    country_rows.append(row)
country_rows.sort(key=lambda r: max(r.get("cattle_tot", 0), r.get("goat_tot", 0), r.get("sheep_tot", 0)), reverse=True)

meta = {
    "unit": "heads per km²",
    "years": "2015",
    "resolution": "1/12° (~8 km cells)",
    "source": "Gridded Livestock of the World — cattle, goat and sheep counts per grid cell (FAO); zonal sums and mean densities per GADM district",
    "africa": {k: round(africa[k] / africa_area, 2) if africa_area > 0 else 0.0 for k in ("cattle", "goat", "sheep")},
    "countries": country_rows,
    "regions": N,
}

print("writing output...")
out_features = []
for f in features:
    i = f["idx"]
    g = clean_geom(f["geom"])
    if not g:
        continue
    props = {
        "G0": f["g0"], "CN": f["cn"], "G1": f["g1"], "N1": f["n1"], "G2": f["g2"], "N2": f["n2"],
    }
    for k in ("cattle", "goat", "sheep"):
        props[k] = round(heads[k][i] / area_region[i], 2) if area_region[i] > 0 else 0.0
        props[k + "_tot"] = int(round(heads[k][i]))
    out_features.append({"type": "Feature", "properties": props, "geometry": g})

os.makedirs(PUB, exist_ok=True)
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump({"type": "FeatureCollection", "meta": meta, "features": out_features}, fh, ensure_ascii=False, separators=(",", ":"))

print("features written:", len(out_features))
print("africa means:", json.dumps(meta["africa"]))
print("unit:", meta["unit"])
print("asset MB:", round(os.path.getsize(OUT) / 1e6, 2))