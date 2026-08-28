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
    meta = {
        "facilities": {
            "total": len(sf),
            "mapped": len(feats),
            "dropped": dropped,
            "countries": len(countries),
            "classes": classes,
            "ownership": ows,
        }
    }
    with open(os.path.join(PUB, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    print("facilities mapped:", len(feats), "dropped:", dropped)
    print("classes:", json.dumps(classes))
    print("ownership:", json.dumps(ows))


if __name__ == "__main__":
    main()