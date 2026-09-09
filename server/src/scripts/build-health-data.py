import shapefile
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PUB = os.path.join(ROOT, "public", "health")

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


def classify_class(ft):
    cl = "Other"
    for label, rx in FAC_ORDER:
        if rx.search(ft):
            cl = label
            break
    return cl


def classify_ownership(ow):
    oc = "Unknown"
    for label, rx in OW_ORDER:
        if rx.search(ow):
            oc = label
            break
    return oc


def make_feature(nm, ft, ow, co, a1, lng, lat, classes, ows, countries):
    cl = classify_class(ft)
    classes[cl] = classes.get(cl, 0) + 1
    oc = classify_ownership(ow)
    ows[oc] = ows.get(oc, 0) + 1
    countries[co] = countries.get(co, 0) + 1
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(lng, 5), round(lat, 5)]},
        "properties": {"nm": nm, "ft": ft, "cl": cl, "ow": ow, "oc": oc, "co": co, "a1": a1},
    }


def polygon_centroid(shape):
    """Centroid of the outer ring of a polygon shape (pyshp may extend the last
    point to close; rings are split by shape.parts)."""
    pts = shape.points
    parts = shape.parts
    pts.append(pts[0])
    start, end = parts[0], parts[1] if len(parts) > 1 else (len(pts) - 1)
    ring = [(pts[i][0], pts[i][1]) for i in range(start, end)]
    if len(ring) < 3:
        return pts[0][0], pts[0][1]
    a2 = 0.0
    cx = cy = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        cross = x0 * y1 - x1 * y0
        a2 += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    a2 /= 2.0
    if abs(a2) < 1e-12:
        return ring[0]
    return cx / (6.0 * a2), cy / (6.0 * a2)


HOT_PATH = os.path.join(ROOT, "server", "data", "health-facilities-hot", "Health facilities.shp")
HOT_COUNTRY = {"dza": "Algeria", "lby": "Libya", "mar": "Morocco", "tun": "Tunisia"}
HOT_CODE = re.compile(r"hotosm_([a-z]{3})_", re.I)


def merge_hot_maghreb(feats, classes, ows, countries):
    """Appends HOT-OSM health-facility polygons for Algeria, Libya, Morocco and
    Tunisia (the sub-Saharan census that built facilities.geojson has no North
    African records, leaving the Maghreb blank on the Health page)."""
    if not os.path.isfile(HOT_PATH):
        print("  HOT Maghreb health facilities not found (%s) — skipped" % HOT_PATH)
        return 0, 0
    sf = shapefile.Reader(HOT_PATH)
    added = dropped = 0
    for sr in sf.iterShapeRecords():
        d = sr.record.as_dict()
        m = HOT_CODE.search(d.get("layer") or "") or HOT_CODE.search(d.get("path") or "")
        co = HOT_COUNTRY.get(m.group(1).lower()) if m else None
        if not co:
            dropped += 1
            continue
        lng, lat = polygon_centroid(sr.shape)
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            dropped += 1
            continue
        nm = (d.get("name_en") or "").strip() or (d.get("name") or "").strip()
        ft = ((d.get("healthcare") or "").strip()
              or (d.get("amenity") or "").strip()
              or (d.get("building") or "").strip()
              or "Unknown")
        ow = (d.get("operator_t") or "").strip() or "Unknown"
        feats.append(make_feature(nm, ft, ow, co, "", lng, lat, classes, ows, countries))
        added += 1
    print("  HOT Maghreb facilities added:", added, "| dropped:", dropped, "| per-country:")
    for c in sorted(countries):
        if c in HOT_COUNTRY.values():
            print("     %s: %d" % (c, countries[c]))
    return added, dropped


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
        co = (d.get("Country") or "").strip()
        feats.append(make_feature(nm, ft, ow, co, (d.get("Admin1") or "").strip(), lng, lat, classes, ows, countries))
    hot_added, hot_dropped = merge_hot_maghreb(feats, classes, ows, countries)
    dropped += hot_dropped
    os.makedirs(PUB, exist_ok=True)
    with open(os.path.join(PUB, "facilities.geojson"), "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False, separators=(",", ":"))
    meta = {
        "facilities": {
            "total": len(sf) + hot_added,
            "mapped": len(feats),
            "dropped": dropped,
            "countries": len(countries),
            "classes": classes,
            "ownership": ows,
            "sources": [
                "sub-Saharan health-facility census 2015 (SUH-SHARAN)",
                "HOT/OSM health-facility polygons for Algeria, Libya, Morocco, Tunisia (centroids)",
            ],
        }
    }
    with open(os.path.join(PUB, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    print("facilities mapped:", len(feats), "dropped:", dropped)
    print("classes:", json.dumps(classes))
    print("ownership:", json.dumps(ows))


if __name__ == "__main__":
    main()