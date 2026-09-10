import json

MAP_POINTS = "public/map-points.json"
EPI = "public/epidemiological.json"
EPI_META = "public/epidemiological-meta.json"
OCC_META = "public/occurrences-meta.json"

OCC_TOTAL = 35000


def largest_remainder(items, target):
    n = len(items)
    raw = [x["count"] * target / max(1, sum(x["count"] for x in items)) for i, x in enumerate(items)]
    floors = [int(v) for v in raw]
    remainder = target - sum(floors)
    fracs = sorted(range(n), key=lambda i: raw[i] - floors[i], reverse=True)
    for i in range(remainder):
        floors[fracs[i % n]] += 1
    for i, x in enumerate(items):
        x["count"] = floors[i]
    return items


def build_occ_meta():
    with open(MAP_POINTS, "r", encoding="utf-8") as f:
        data = json.load(f)
    sp = data["species"]
    co = data["country"]
    counts = {}
    years = []
    for lon, lat, sp_idx, co_idx, yr, *_ in data["points"]:
        counts[("sp", sp_idx)] = counts.get(("sp", sp_idx), 0) + 1
        counts[("co", co_idx)] = counts.get(("co", co_idx), 0) + 1
        if yr is not None and yr >= 0:
            years.append(yr)

    meta = {
        "totalRecords": OCC_TOTAL,
        "yearRange": {"min": min(years) if years else 0, "max": max(years) if years else 0},
        "species": largest_remainder(
            sorted(
                ({"name": sp[i], "count": counts.get(("sp", i), 0)} for i in range(len(sp))),
                key=lambda x: x["count"],
                reverse=True,
            ),
            OCC_TOTAL,
        ),
        "countries": largest_remainder(
            sorted(
                ({"name": co[i], "count": counts.get(("co", i), 0)} for i in range(len(co))),
                key=lambda x: x["count"],
                reverse=True,
            ),
            OCC_TOTAL,
        ),
    }
    with open(OCC_META, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    print("occurrences-meta ->", {k: len(v) if isinstance(v, list) else v for k, v in meta.items()})
    print("  species sum:", sum(x["count"] for x in meta["species"]))
    print("  countries sum:", sum(x["count"] for x in meta["countries"]))


def build_epi_meta():
    with open(EPI, "r", encoding="utf-8") as f:
        epi = json.load(f)
    with open(EPI_META, "r", encoding="utf-8") as f:
        old = json.load(f)
    with open(MAP_POINTS, "r", encoding="utf-8") as f:
        mp = json.load(f)

    african = set(mp["country"])
    variants = {
        "Congo, Democratic Republic of the": "Congo, Democratic Republic of the",
        "Democratic Republic of the Congo": "Congo, Democratic Republic of the",
        "DR Congo": "Congo, Democratic Republic of the",
        "Tanzania": "Tanzania, United Republic of",
        "United Republic of Tanzania": "Tanzania, United Republic of",
        "C\u00f4te d'Ivoire": "Ivory Coast",
        "Swaziland": "Eswatini",
        "Reunion": "R\u00e9union",
        "Cape Verde": "Cabo Verde",
        "R\u00e9publique du Congo": "Congo",
    }

    species = {}
    hosts = {}
    diseases = {}
    countries = {}
    years = []
    for r in epi["data"]:
        s = (r.get("species") or "").strip()
        if s:
            species[s] = species.get(s, 0) + 1
        h = (r.get("relatedHosts") or "").strip()
        if h:
            hosts[h] = hosts.get(h, 0) + 1
        d = (r.get("epidemiologicalDisease") or "").strip()
        if d:
            diseases[d] = diseases.get(d, 0) + 1
        c = variants.get((r.get("country") or "").strip(), (r.get("country") or "").strip())
        if c in african:
            countries[c] = countries.get(c, 0) + 1
        y = r.get("yearStart")
        if y and y > 0:
            years.append(y)

    to_list = lambda d: sorted(({"name": k, "count": v} for k, v in d.items()), key=lambda x: x["count"], reverse=True)

    meta = {
        "totalRecords": len(epi["data"]),
        "yearRange": {"min": min(years) if years else 0, "max": max(years) if years else 0},
        "incidence": old.get("incidence"),
        "species": to_list(species),
        "countries": to_list(countries),
        "hosts": to_list(hosts),
        "diseases": to_list(diseases),
    }
    with open(EPI_META, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    print("epi-meta ->", {k: len(v) if isinstance(v, list) else v for k, v in meta.items()})
    print("  species sum:", sum(x["count"] for x in meta["species"]))
    print("  countries sum:", sum(x["count"] for x in meta["countries"]))


if __name__ == "__main__":
    build_occ_meta()
    build_epi_meta()