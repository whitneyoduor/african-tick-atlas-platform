# -*- coding: utf-8 -*-
"""Builds the mammal richness + malaria incidence choropleth layers for the Health page.

Mammal layer  (same zonal-statistics pattern as the livestock choropleth):
    IUCN/SERVIR "Area of Habitat" mammal species richness for 2021
    (Mammals_AoH_Richness_2021.tif, global World-Mollweide 5 km mosaic, NoData 255).
    Each GADM ADM2 district is assigned the mean richness of the 5 km cells whose
    centres fall inside it (richness 0 = no AOH habitat is valid and is included;
    value 255 = NoData and is excluded). Wild-mammal richness represents the
    availability of wild tick-host populations.

Malaria layer:
    Malaria Atlas Project subnational estimates (Subnational Unit-data.csv):
    admin-1 "Incidence Rate" (cases per thousand), latest year (default 2024).
    The rate is attached to every ADM2 district under the matching GADM admin-1
    unit by name (normalised, alias-corrected, fuzzy fall-back).

Both layers are written at admin-unit level into the existing health assets
(following the build-population-geojson.py pattern — the choropleth and country
features are augmented in place):

    public/health/livestock-choropleth.geojson  (+ mammal, malaria props + meta)
    public/health/livestock-countries.geojson   (+ mammal, malaria props)

Run:  python server/src/scripts/build-health-metrics.py
    --mammal <tif-or-zip>   (default: C:/Users/HP/Downloads/Mammals_AoH_Richness_2021.zip)
    --malaria <csv>         (default: C:/Users/HP/Downloads/Subnational Unit-data.csv)
    --malaria-year <YYYY>   (default 2024)
"""
import csv
import difflib
import io
import json
import math
import os
import sys
import zipfile

import numpy as np
import tifffile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PUB = os.path.join(ROOT, "public", "health")
CHORO = os.path.join(PUB, "livestock-choropleth.geojson")
COUNTRIES = os.path.join(PUB, "livestock-countries.geojson")

DEFAULT_MAMMAL = r"C:\Users\HP\Downloads\Mammals_AoH_Richness_2021.zip"
DEFAULT_MALARIA = r"C:\Users\HP\Downloads\Subnational Unit-data.csv"
MAMMAL_PATH = DEFAULT_MAMMAL
MALARIA_PATH = DEFAULT_MALARIA
MAL_YEAR = 2024
if "--mammal" in sys.argv:
    MAMMAL_PATH = sys.argv[sys.argv.index("--mammal") + 1]
if "--malaria" in sys.argv:
    MALARIA_PATH = sys.argv[sys.argv.index("--malaria") + 1]
if "--malaria-year" in sys.argv:
    MAL_YEAR = int(sys.argv[sys.argv.index("--malaria-year") + 1])

# ---------------------------------------------------------------- mollweide grid
# World Mollweide (ESRI 54009), WGS84 sphere R = 6378137 m, 5000 m cells.
R = 6378137.0
K = math.sqrt(2.0) * R
CELL = 5000.0
NODATA = 255
AREA_KM2 = CELL * CELL / 1e6  # equal-area projection: ~25 km2 per cell


def theta_of_phi(phi):
    """Auxiliary angle for Mollweide from latitude (inverse of phi_of_theta)."""
    target = math.sin(phi)
    lo, hi = -math.pi / 2.0, math.pi / 2.0
    for _ in range(80):
        mid = (lo + hi) / 2.0
        v = (2.0 * mid + math.sin(2.0 * mid)) / math.pi
        if v < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def mollweide_from_tfw_or_default():
    """Returns (x0, y0, cell) top-left origin from the raster world file, else hardcoded."""
    base = os.path.dirname(MAMMAL_PATH) if os.path.isdir(os.path.dirname(MAMMAL_PATH)) else os.path.dirname(DEFAULT_MAMMAL)
    tfw = None
    if os.path.isfile(MAMMAL_PATH) and MAMMAL_PATH.lower().endswith(".zip"):
        with zipfile.ZipFile(MAMMAL_PATH) as z:
            t = [n for n in z.namelist() if n.lower().endswith(".tfw")]
            if t:
                tfw = z.read(t[0]).decode("utf-8", "replace")
    elif os.path.isfile(MAMMAL_PATH):
        p = MAMMAL_PATH.rsplit(".", 1)[0] + ".tfw"
        if os.path.isfile(p):
            tfw = open(p, encoding="utf-8", errors="replace").read()
    if tfw:
        vals = [float(v) for v in tfw.split()]
        return vals[4], vals[5], vals[0]
    return -18037594.5476257466, 8719468.349966893, 5000.0


def norm(s):
    s = (s or "").lower().strip()
    s = s.replace("’", "'").replace("/", " ")
    for a, b in [("é", "e"), ("è", "e"), ("ê", "e"), ("ë", "e"), ("ï", "i"), ("ô", "o"),
                 ("û", "u"), ("ç", "c"), ("ã", "a"), ("õ", "o"), ("ñ", "n"), ("ü", "u"),
                 ("ö", "o"), ("à", "a"), ("á", "a"), ("í", "i"), ("ó", "o"), ("ú", "u")]:
        s = s.replace(a, b)
    s = "".join(ch if ch.isalnum() else " " for ch in s)
    return " ".join(s.split())


# normalised -> normalised admin-1 spellings that differ from GADM
ALIASES = {
    "abuja": "federal capital territory",
    "nassarawa": "nasarawa",
    "aj jazirah": "al jazirah",
    "north kordofan": "north kurdufan",
    "south kordofan": "south kurdufan",
    "west kordofan": "west kurdufan",
    "north kordofan state": "north kurdufan",
    "south kordofan state": "south kurdufan",
    "west kordofan state": "west kurdufan",
    "tanganyka": "tanganyika",
    "valle du bandama": "vallee du bandama",
    "nairobi city": "nairobi",
    "nairobi county": "nairobi",
    # Angola
    "kuando kubango": "cuando cubango",
    "kwanza norte": "cuanza norte",
    "kwanza sul": "cuanza sul",
    # Cameroon (French)
    "north west": "nord ouest",
    "south west": "sud ouest",
    # Ghana
    "northern east": "north east",
    # Gambia
    "central river": "maccarthy island",
    "kanifing municipal council": "banjul",
    "west coast": "western",
    # Sierra Leone
    "north western": "northern",
    "western area": "western",
    # Somalia
    "juba dhexe": "jubbada dhexe",
    "juba hoose": "jubbada hoose",
    "shabelle dhexe": "shabeellaha dhexe",
    "shabelle hoose": "shabeellaha hoose",
    # South Sudan
    "jonglei": "jungoli",
    "western bahr el ghazal": "west bahr al ghazal",
    # Sudan
    "gedaref": "al qadarif",
    # Togo
    "centrale": "centre",
    # Eritrea (Dahlak archipelago -> Northern Red Sea)
    "archipelagos": "semenawi keyih bahri",
    # Rwanda (Kinyarwanda admin-1 names)
    "kigali city": "umujyi wa kigali",
    "northern province": "amajyaruguru",
    "southern province": "amajyepfo",
    "eastern province": "iburasirazuba",
    "western province": "iburengerazuba",
    # Benin
    "atacora": "atakora",
    "couffo": "kouffo",
    # Mali
    "tombouctou": "timbuktu",
    # Mozambique
    "cidade de maputo": "maputo city",
}

W0, W1, S0, N1_ = -26.0, 55.0, -36.0, 38.0
X0, Y0, CPIX = mollweide_from_tfw_or_default()


def y_of_phi(phi):
    return K * math.sin(theta_of_phi(phi))


def row_of_lat(lat):
    """Global pixel row whose centre is nearest to latitude (float)."""
    y = y_of_phi(math.radians(lat))
    return (Y0 - y) / CELL - 0.5


def col_of_lng(lng):
    """Most outward column (equator cos=1) whose centre covers longitude to the west/east."""
    rad = math.radians(lng)
    x = (2.0 * K * rad) / math.pi
    return (x - X0) / CELL - 0.5


# ----------------------------------------------------------------- raster loading
def load_mammal():
    """Reads the 5 km richness mosaic (zip-backed if needed); returns full uint8 array."""
    src = MAMMAL_PATH
    tmp = None
    if src.lower().endswith(".zip"):
        tmp = os.path.join(os.environ.get("TEMP", "."), "opencode", "mammals_" + str(abs(hash(src))))
        if not os.path.isdir(tmp):
            with zipfile.ZipFile(src) as z:
                z.extractall(tmp)
        tif = os.path.join(tmp, "Mammals_AoH_2021_Richness.tif")
        if not os.path.isfile(tif):
            candidates = [n for n in os.listdir(tmp) if n.lower().endswith(".tif")]
            if not candidates:
                raise RuntimeError("no .tif found in " + src)
            tif = os.path.join(tmp, candidates[0])
    else:
        tif = src
    arr = tifffile.imread(tif)
    print("  raster:", tif, arr.shape, arr.dtype)
    return arr


def prep_window(arr):
    Ht, Wt = arr.shape
    r_north = row_of_lat(N1_)
    r_south = row_of_lat(S0)
    r0 = max(0, int(math.floor(r_north)) - 2)
    r1 = min(Ht, int(math.ceil(r_south)) + 2)
    c_west = col_of_lng(W0)
    c_east = col_of_lng(W1)
    c0 = max(0, int(math.floor(c_west)) - 2)
    c1 = min(Wt, int(math.ceil(c_east)) + 2)
    rows = np.arange(r0, r1)
    yc = Y0 - (rows + 0.5) * CELL
    theta = np.arcsin(np.clip(yc / K, -1.0, 1.0))
    cos_theta = np.cos(theta)
    lat = np.degrees(np.arcsin((2.0 * theta + np.sin(2.0 * theta)) / math.pi))
    cols = np.arange(c0, c1)
    xc = X0 + (cols + 0.5) * CELL
    scale = math.pi / (2.0 * K)
    lng_grid = np.degrees((xc[None, :] * scale) / cos_theta[:, None])
    lat_row = np.degrees(phi_of_theta_vec(theta))
    crop = arr[r0:r1, c0:c1]
    return r0, c0, crop, lat_row, lng_grid


def phi_of_theta_vec(theta):
    return np.arcsin(np.clip((2.0 * theta + np.sin(2.0 * theta)) / math.pi, -1.0, 1.0))


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


# ------------------------------------------------------------- malaria table load
def load_malaria():
    data = {}
    f = io.open(MALARIA_PATH, encoding="utf-8-sig", errors="replace")
    r = csv.reader(f)
    next(r)
    for row in r:
        if len(row) < 8:
            continue
        if row[4] != "Incidence Rate":
            continue
        if row[6] != str(MAL_YEAR):
            continue
        try:
            val = float(row[7])
        except ValueError:
            continue
        data.setdefault(row[0], {})[norm(row[2])] = val
    f.close()
    return data


def resolve_n1(gadm_names, malaria_names):
    """Match malaria admin-1 names to GADM admin-1 names; returns (fwd, unmatched)."""
    fwd = {}
    pool = sorted(gadm_names)
    for m in malaria_names:
        hit = ALIASES.get(m)
        if hit and hit in gadm_names:
            fwd[m] = hit
            continue
        if m in gadm_names:
            fwd[m] = m
            continue
        close = difflib.get_close_matches(m, pool, n=1, cutoff=0.88)
        if close:
            fwd[m] = close[0]
            continue
    unmatched = [m for m in malaria_names if m not in fwd]
    return fwd, unmatched


# -------------------------------------------------------------------------- main
def main():
    print("loading mammal richness raster...")
    arr = load_mammal()
    r0, c0, crop, lat_row, lng_grid = prep_window(arr)
    Hw, Ww = crop.shape
    print(f"  window rows {r0}..{r0 + Hw} cols {c0}..{c0 + Ww} -> {Hw}x{Ww}")

    print("indexing districts and rasterizing...")
    choro = json.load(io.open(CHORO, encoding="utf-8"))
    features = choro["features"]
    grid = np.full((Hw, Ww), -1, dtype=np.int32)
    idx = 0
    for feat in features:
        geom = feat["geometry"]
        b = geom_bbox(geom)
        r_top = row_of_lat(b[3])
        r_bot = row_of_lat(b[1])
        c_min = col_of_lng(b[0])
        c_max = col_of_lng(b[2])
        rmin = max(0, int(math.floor(r_top)) - 1 - r0)
        rmax = min(Hw, int(math.ceil(r_bot)) + 1 - r0)
        cmin = max(0, int(math.floor(c_min)) - 1 - c0)
        cmax = min(Ww, int(math.ceil(c_max)) + 1 - c0)
        if rmax <= rmin or cmax <= cmin:
            idx += 1
            continue
        for rr in range(rmin, rmax):
            lat = lat_row[rr]
            lngs = lng_grid[rr]
            for cc in range(cmin, cmax):
                if grid[rr, cc] != -1:
                    continue
                if point_in_geometry((float(lngs[cc]), float(lat)), geom):
                    grid[rr, cc] = idx
        idx += 1
    print("  districts indexed:", idx)

    print("zonal mammal statistics...")
    n = len(features)
    mammal_sum = np.zeros(n)
    mammal_cnt = np.zeros(n)
    rows_valid, cols_valid = np.nonzero(grid >= 0)
    for rr, cc in zip(rows_valid, cols_valid):
        fi = int(grid[rr, cc])
        v = int(crop[rr, cc])
        if v == NODATA:
            continue
        mammal_cnt[fi] += 1.0
        mammal_sum[fi] += v
    africa_mam_sum = float(mammal_sum.sum())
    africa_mam_cnt = float(mammal_cnt.sum())
    print("  africa mean mammal richness: %.2f" % (africa_mam_sum / africa_mam_cnt if africa_mam_cnt else 0))

    print("loading malaria incidence...")
    mal = load_malaria()
    print("  incidence units:", sum(len(v) for v in mal.values()), "for year", MAL_YEAR)

    # match malaria admin-1 names per country against GADM admin-1 names
    g0_n1 = {}
    for feat in features:
        p = feat["properties"]
        g0_n1.setdefault(p["G0"], set()).add(norm(p["N1"]))
    malaria_district = {}
    country_mal_units = {}
    total_unmatched = 0
    for g0, names in sorted(g0_n1.items()):
        mnames = mal.get(g0)
        if not mnames:
            country_mal_units[g0] = {"total": 0, "matched": 0, "unmatched": []}
            continue
        fwd, unmatched = resolve_n1(names, list(mnames))
        country_mal_units[g0] = {"total": len(mnames), "matched": len(fwd), "unmatched": sorted(unmatched)}
        total_unmatched += len(unmatched)
        for m, g in fwd.items():
            malaria_district[(g0, g)] = mnames[m]
    print("  malaria admin-1 matched per country:")
    for g0, st in sorted(country_mal_units.items()):
        if st["total"]:
            print(f"    {g0}: {st['matched']}/{st['total']}" + (f"  UNMATCHED {st['unmatched']}" if st["unmatched"] else ""))
    print("  total unmatched malaria admin-1 units:", total_unmatched)

    print("augmenting district + country features...")
    for k, feat in enumerate(features):
        p = feat["properties"]
        p.pop("mammal", None)
        p.pop("mammal_tot", None)
    for k, feat in enumerate(features):
        p = feat["properties"]
        if mammal_cnt[k] > 0:
            mean_v = mammal_sum[k] / mammal_cnt[k]
            p["mammal"] = round(mean_v, 2)
            p["mammal_tot"] = int(round(mean_v))
        rec = malaria_district.get((p["G0"], norm(p["N1"])))
        if rec is not None:
            p["malaria"] = round(rec, 2)
            p["malaria_tot"] = int(round(rec))
            p["malaria_year"] = MAL_YEAR

    # country rollups (mammals: cell mean over country; malaria: population-weighted)
    country_agg = {}
    for k, feat in enumerate(features):
        p = feat["properties"]
        ca = country_agg.setdefault(p["G0"], {"mam_sum": 0.0, "mam_cnt": 0.0, "mal_rate": 0.0, "mal_rate_uw": 0.0, "mal_pop": 0.0, "has_mal": False, "mal_n": 0})
        if mammal_cnt[k] > 0:
            ca["mam_sum"] += mammal_sum[k]
            ca["mam_cnt"] += mammal_cnt[k]
        if p.get("malaria") is not None:
            pop = p.get("population_tot") or 0
            ca["mal_rate"] += p["malaria"] * pop
            ca["mal_pop"] += pop
            ca["mal_rate_uw"] += p["malaria"]
            ca["mal_n"] += 1
            ca["has_mal"] = True

    countries = json.load(io.open(COUNTRIES, encoding="utf-8"))
    mal_rank = []  # (g0, rate, pop) for africa weighted mean
    for feat in countries["features"]:
        p = feat["properties"]
        g0 = p["G0"]
        ca = country_agg.get(g0)
        mam = (ca["mam_sum"] / ca["mam_cnt"]) if ca and ca["mam_cnt"] > 0 else None
        if mam is not None:
            p["mammal"] = round(mam, 2)
            p["mammal_tot"] = int(round(mam))
        mrate = None
        if ca and ca["mal_pop"] > 0:
            mrate = ca["mal_rate"] / ca["mal_pop"]
        elif ca and ca["mal_n"] > 0:
            mrate = ca["mal_rate_uw"] / ca["mal_n"]
        if mrate is not None:
            p["malaria"] = round(mrate, 2)
            p["malaria_tot"] = int(round(mrate))
            p["malaria_year"] = MAL_YEAR
            mal_rank.append((g0, mrate, p.get("population_tot")))

    meta = choro.setdefault("meta", {})
    africa = meta.setdefault("africa", {})
    africa["mammal"] = round(africa_mam_sum / africa_mam_cnt, 2) if africa_mam_cnt else 0.0
    if mal_rank:
        pop_sum = sum((r[2] or 0) for r in mal_rank)
        if pop_sum > 0:
            africa["malaria"] = round(sum(r[1] * (r[2] or 0) for r in mal_rank) / pop_sum, 2)
        else:
            africa["malaria"] = round(sum(r[1] for r in mal_rank) / len(mal_rank), 2)
    meta["mammal_source"] = ("IUCN/SERVIR Area of Habitat mammal species richness 2021 (Mammals_AoH_Richness_2021.tif, "
                             "5 km World-Mollweide mosaic); zonal means per GADM district")
    meta["mammal_year"] = "2021"
    meta["malaria_source"] = ("Malaria Atlas Project subnational estimates (Subnational Unit-data.csv): admin-1 "
                              "Incidence Rate in cases per thousand, year %d; rates joined to districts via GADM admin-1 name" % MAL_YEAR)
    meta["malaria_year"] = str(MAL_YEAR)

    for row in meta.get("countries", []):
        ca = country_agg.get(row["gid"])
        mam = (ca["mam_sum"] / ca["mam_cnt"]) if ca and ca["mam_cnt"] > 0 else None
        if mam is not None:
            row["mammal"] = round(mam, 2)
            row["mammal_tot"] = int(round(mam))
        mrate = None
        if ca and ca["mal_pop"] > 0:
            mrate = ca["mal_rate"] / ca["mal_pop"]
        elif ca and ca["mal_n"] > 0:
            mrate = ca["mal_rate_uw"] / ca["mal_n"]
        if mrate is not None:
            row["malaria"] = round(mrate, 2)
            row["malaria_tot"] = int(round(mrate))
            row["malaria_year"] = MAL_YEAR

    with open(COUNTRIES, "w", encoding="utf-8") as fh:
        json.dump(countries, fh, ensure_ascii=False, separators=(",", ":"))
    with open(CHORO, "w", encoding="utf-8") as fh:
        json.dump(choro, fh, ensure_ascii=False, separators=(",", ":"))

    print("  africa means:", {k: africa.get(k) for k in ("cattle", "goat", "sheep", "population", "mammal", "malaria")})
    print("  wrote:", COUNTRIES, CHORO)


if __name__ == "__main__":
    main()