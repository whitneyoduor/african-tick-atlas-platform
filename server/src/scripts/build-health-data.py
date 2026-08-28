import shapefile
import tifffile
import numpy as np
import json
import math
import os
import re
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PUB = os.path.join(ROOT, "public", "health")

PIX = 1.0 / 12.0
PIX_INV = 12.0
NODATA = -3.4028234663852886e+38
TILE = 256
ZOOMS = [3, 4, 5, 6]

BREAKS = [0, 30, 60, 120, 240, 480, 720, 1440]
COLORS = [
    [22, 163, 74],
    [132, 204, 22],
    [250, 204, 21],
    [251, 146, 60],
    [249, 115, 22],
    [239, 68, 68],
    [185, 28, 28],
    [127, 29, 29],
]

LAYERS = [
    {"src": "5_Gt_2015_Da.tif", "id": "gt", "title": "General care", "detail": "Travel time to the nearest health facility of any type", "units": "minutes"},
    {"src": "5_Sh_2015_Da.tif", "id": "sh", "title": "Specialist care", "detail": "Travel time to the nearest specialist hospital", "units": "minutes"},
    {"src": "5_Ct_2015_Da.tif", "id": "ct", "title": "Comprehensive care", "detail": "Travel time to the nearest comprehensive care facility (surgery / C-section capable)", "units": "minutes"},
]

CLASS_ORDER = ["/hospital/i", None]
FAC_ORDER = [
    ("Hospital", re.compile(r"hospital", re.I)),
    ("Post / primary", re.compile(r"post|hut|community|primary|maternal|child protection|chps|basic health|health care unit|health care center", re.I)),
    ("Clinic", re.compile(r"clinic|dispensary|dispensaire|medical|polyclinic", re.I)),
    ("Health centre", re.compile(r"centre|center|centro|sante|saude|centre health|health center|health centre", re.I)),
]
OW_ORDER = [
    ("Public", re.compile(r"moh|public|publique|govt|government|mohss|ministry|local authority|state|municipal|district council|national", re.I)),
    ("Faith-based", re.compile(r"fbo|confessionnel|faith|mission|religious|church", re.I)),
    ("NGO / community", re.compile(r"ngo|cbo|community|not for profit", re.I)),
    ("Private", re.compile(r"private|prive|pfp|for profit", re.I)),
]

WINDOW = {"lon0": -26.0, "lon1": 55.0, "lat0": -36.0, "lat1": 38.0}
STAT_TOP = 20.0


def merc_x(lon, z):
    return (lon + 180.0) / 360.0 * (TILE << z)


def merc_y(lat, z):
    n = TILE << z
    latr = math.radians(lat)
    return (1.0 - math.asinh(math.tan(latr)) / math.pi) / 2.0 * n


def merc_lat(y, z):
    n = TILE << z
    return math.degrees(math.atan(math.sinh(math.pi * (1.0 - 2.0 * y / n))))


def colorize(vals):
    out = np.zeros((vals.shape[0], 4), dtype=np.uint8)
    valid = vals >= 0
    if not valid.any():
        return out
    v = vals[valid]
    idx = np.searchsorted(BREAKS, v, side="right") - 1
    np.clip(idx, 0, len(COLORS) - 1, out=idx)
    for i, c in enumerate(COLORS):
        m = idx == i
        if not m.any():
            continue
        pos = np.flatnonzero(valid)[m]
        out[pos, 0] = c[0]
        out[pos, 1] = c[1]
        out[pos, 2] = c[2]
        out[pos, 3] = 255
    return out


def build_tiles(arr, layer_id):
    os.makedirs(os.path.join(PUB, "traveltime", layer_id), exist_ok=True)
    H, W = arr.shape
    count = 0
    for z in ZOOMS:
        nz = 1 << z
        npx = TILE << z
        x0 = max(0, int(math.floor(merc_x(WINDOW["lon0"], z) / TILE)))
        x1 = min(nz, int(math.ceil(merc_x(WINDOW["lon1"], z) / TILE)))
        y0 = max(0, int(math.floor(merc_y(WINDOW["lat1"], z) / TILE)))
        y1 = min(nz, int(math.ceil(merc_y(WINDOW["lat0"], z) / TILE)))
        cols = np.arange(TILE, dtype=np.float64)
        for tx in range(x0, x1):
            lon = (tx * TILE + cols + 0.5) / npx * 360.0 - 180.0
            colsrc = (lon + 180.0) * PIX_INV
            for ty in range(y0, y1):
                lat = np.array([merc_lat(ty * TILE + r + 0.5, z) for r in range(TILE)], dtype=np.float64)
                rowsrc = (90.0 - lat) * PIX_INV
                cc = np.clip(colsrc, 0, W - 1.001)
                rr = np.clip(rowsrc, 0, H - 1.001)
                c0 = cc.astype(np.int64)
                r0 = rr.astype(np.int64)
                fx = cc - c0
                fy = rr - r0
                c1 = np.minimum(c0 + 1, W - 1)
                r1 = np.minimum(r0 + 1, H - 1)
                a = arr[r0][:, c0]
                b = arr[r0][:, c1]
                c = arr[r1][:, c0]
                d = arr[r1][:, c1]
                v = (1 - fy)[:, None] * ((1 - fx)[None, :] * a + fx[None, :] * b) + fy[:, None] * ((1 - fx)[None, :] * c + fx[None, :] * d)
                rgba = colorize(v.ravel())
                rgba_img = rgba.reshape(TILE, TILE, 4)
                if not rgba_img[:, :, 3].any():
                    continue
                dpath = os.path.join(PUB, "traveltime", layer_id, str(z), str(tx))
                os.makedirs(dpath, exist_ok=True)
                Image.fromarray(rgba_img, "RGBA").save(os.path.join(dpath, str(ty) + ".png"), optimize=True)
                count += 1
    return count


def window_stats(arr):
    lon0 = int((WINDOW["lon0"] + 180.0) * PIX_INV)
    lon1 = int((WINDOW["lon1"] + 180.0) * PIX_INV) + 1
    lat0r = int((90.0 - STAT_TOP) * PIX_INV)
    lat1r = int((90.0 - WINDOW["lat0"]) * PIX_INV) + 1
    sub = arr[lat0r:lat1r, lon0:lon1]
    vals = sub[sub >= 0]
    if vals.size == 0:
        return None
    return {
        "cells": int(vals.size),
        "median_min": round(float(np.median(vals)), 1),
        "within_60_pct": round(float((vals <= 60).sum()) / vals.size * 100, 1),
        "within_120_pct": round(float((vals <= 120).sum()) / vals.size * 100, 1),
        "within_240_pct": round(float((vals <= 240).sum()) / vals.size * 100, 1),
    }


def build_meta():
    meta = {"breaks": BREAKS, "colors": COLORS, "layers": [], "facilities": {}}
    for L in LAYERS:
        t = tifffile.TiffFile(os.path.join(ROOT, "..", "..", "Downloads", L["src"]))
        arr = t.pages[0].asarray().astype(np.float64)
        t.close()
        st = window_stats(arr)
        til = build_tiles(arr, L["id"])
        meta["layers"].append({
            "id": L["id"],
            "title": L["title"],
            "detail": L["detail"],
            "units": L["units"],
            "tiles": til,
            "stats": st,
        })
    return meta


def main():
    sf = shapefile.Reader(os.path.join(ROOT, "..", "..", "Downloads", "suhsharan_health_facilities", "sub-saharan_health_facilities.shp"))
    feats = []
    classes = {}
    ows = {}
    countries = {}
    dropped = 0
    for r in sf.records():
        d = r.as_dict()
        try:
            lat = float(d["Lat"])
            lng = float(d["Long"])
            if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                dropped += 1
                continue
        except Exception:
            dropped += 1
            continue
        nm = (d.get("Facility n") or "").strip()
        ft = (d.get("Facility t") or "").strip() or "Unknown"
        ow = (d.get("Ownership") or "").strip() or "Unknown"
        cl = "Other"
        for label, rx in FAC_ORDER:
            if rx.search(ft):
                cl = label
                break
        oc = "Unknown"
        for label, rx in OW_ORDER:
            if rx.search(ow):
                oc = label
                break
        co = (d.get("Country") or "").strip()
        classes[cl] = classes.get(cl, 0) + 1
        ows[oc] = ows.get(oc, 0) + 1
        countries[co] = countries.get(co, 0) + 1
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(lng, 5), round(lat, 5)]},
            "properties": {"nm": nm, "ft": ft, "cl": cl, "ow": ow, "oc": oc, "co": co, "a1": (d.get("Admin1") or "").strip()},
        })
    os.makedirs(PUB, exist_ok=True)
    with open(os.path.join(PUB, "facilities.geojson"), "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False, separators=(",", ":"))
    meta = build_meta()
    meta["facilities"] = {
        "total": len(sf),
        "mapped": len(feats),
        "dropped": dropped,
        "countries": len(countries),
        "classes": classes,
        "ownership": ows,
    }
    with open(os.path.join(PUB, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    print("facilities mapped:", len(feats), "dropped:", dropped)
    print("classes:", json.dumps(classes))
    print("ownership:", json.dumps(ows))
    for L in LAYERS:
        print(L["id"], "stats", json.dumps(meta_layer := next(m for m in meta["layers"] if m["id"] == L["id"])))


if __name__ == "__main__":
    main()