import csv
import io
import json
import os
import sys

"""
Builds human population data for the Health Access page from the UNFPA/FAO COD
admin-2 population table (cod_population_admin2.csv). Districts are keyed by
ADM2_PCODE; totals are rolled up to ADM0 via ISO3 (matching the atlas GID_0).

Outputs
-------
public/health/population-admin2.json
    Per-country ADM2 population table (ADM2_PCODE-keyed) plus country totals.

Additionally AUGMENTS the committed livestock assets in place with a
"population" / "population_tot" metric so the existing country choropleth,
hover totals and focus readout work for the new metric:

    public/health/livestock-countries.geojson   (country features + pop)
    public/health/livestock-choropleth.geojson  (district features + meta + pop)

Run:  python server/src/scripts/build-population-geojson.py
CSV path may be overridden with:  --pop <path>   (default: Downloads copy)
"""

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
HEALTH = os.path.join(ROOT, "public", "health")

DEFAULT_CSV = r"C:\Users\HP\Downloads\cod_population_admin2.csv"
CSV_PATH = DEFAULT_CSV
if "--pop" in sys.argv:
    i = sys.argv.index("--pop")
    if i + 1 < len(sys.argv):
        CSV_PATH = sys.argv[i + 1]

COUNTRIES_GEOJSON = os.path.join(HEALTH, "livestock-countries.geojson")
CHORO_GEOJSON = os.path.join(HEALTH, "livestock-choropleth.geojson")
OUT_ADM2 = os.path.join(HEALTH, "population-admin2.json")


def norm(s):
    s = (s or "").lower().strip()
    s = s.replace("’", "'").replace("'", " ").replace("-", " ").replace("_", " ")
    for a, b in [("é", "e"), ("è", "e"), ("ê", "e"), ("ë", "e"), ("ï", "i"), ("ô", "o"),
                 ("û", "u"), ("ç", "c"), ("ã", "a"), ("õ", "o"), ("ñ", "n"), ("ü", "u"), ("ö", "o")]:
        s = s.replace(a, b)
    return " ".join(s.split())


def load_population():
    """Streams the CSV and returns: adm2[iso3][adm2_pcode] -> record (per-record year/source)."""
    adm2 = {}
    f = io.open(CSV_PATH, encoding="utf-8", errors="replace")
    r = csv.reader(f)
    next(r)
    for row in r:
        if len(row) < 19:
            continue
        iso3, a1p, a1n, a2p, a2n, pop_group, population, year, src = (
            row[0], row[2], row[3], row[4], row[5], row[10], row[15], row[16], row[17],
        )
        if pop_group.strip() != "T_TL":
            continue
        if not iso3.strip() or not a2p.strip():
            continue
        try:
            pop = float(population or 0)
        except ValueError:
            pop = 0.0
        if pop <= 0:
            continue
        iso3 = iso3.strip()
        key = a2p.strip()
        rec = adm2.setdefault(iso3, {}).get(key)
        if rec is None:
            adm2[iso3][key] = {"a1p": a1p.strip(), "a1n": a1n.strip(), "a2n": a2n.strip(),
                               "population": pop, "year": year.strip(), "source": src.strip()}
        else:
            rec["population"] += pop
    f.close()
    return adm2


def pop_tot(adm2rec):
    return sum(rec["population"] for rec in adm2rec.values())


def main():
    print("parsing population CSV:", CSV_PATH)
    adm2 = load_population()
    total_districts = sum(len(v) for v in adm2.values())
    print(f"  adm2 districts: {total_districts} | countries: {len(adm2)}")

    countries_fc = json.load(io.open(COUNTRIES_GEOJSON, encoding="utf-8"))
    country_rows = []
    cty_area = {}
    for feat in countries_fc["features"]:
        p = feat["properties"]
        density = p.get("cattle") or 0.0
        heads = p.get("cattle_tot") or 0
        area = (heads / density) if density > 0 else 0.0
        cty_area[p["G0"]] = area
        country_rows.append({"gid": p["G0"], "name": p["CN"], "area_km2": area})

    # name -> iso3 scan (for country-name fallback matching)
    iso3_by_name = {}
    f = io.open(CSV_PATH, encoding="utf-8", errors="replace")
    r = csv.reader(f)
    next(r)
    for row in r:
        if len(row) < 6:
            continue
        iso3, country = row[0].strip(), row[1].strip()
        if iso3 and country:
            iso3_by_name.setdefault(norm(country), iso3)
    f.close()

    completed = {}
    missing = []
    for feat in countries_fc["features"]:
        p = feat["properties"]
        d = adm2.get(p["G0"])
        if d is None:
            via = iso3_by_name.get(norm(p["CN"]))
            d = adm2.get(via) if via else None
        if d is None:
            missing.append(p["G0"])
            continue
        completed[p["G0"]] = d
    print("  matched livestock countries:", len(completed), "| missing:", missing)

    def lookup(g0):
        if g0 in completed:
            return completed[g0]
        via = iso3_by_name.get(norm(next((c["name"] for c in country_rows if c["gid"] == g0), "")))
        return completed.get(via) if via else None

    total_pop_africa = 0.0
    total_area_africa = 0.0
    years_seen = set()
    admin2_out = {"source": "UNFPA / FAO COD (cod_population_admin2.csv)", "referenceYear": "mixed", "countries": {}}

    for feat in countries_fc["features"]:
        g0 = feat["properties"]["G0"]
        d = lookup(g0)
        if d is None:
            continue
        p = feat["properties"]
        ptot = pop_tot(d)
        p["population"] = round(ptot / cty_area[g0], 2) if cty_area[g0] > 0 else 0.0
        p["population_tot"] = int(round(ptot))
        rec_years = sorted({rec["year"] for rec in d.values() if rec["year"]})
        rec_srcs = [rec["source"] for rec in d.values() if rec["source"]]
        p["population_year"] = (max(rec_years, key=rec_years.count) if rec_years else "unknown")
        p["population_source"] = (rec_srcs[0] if rec_srcs else "UNFPA / FAO COD")
        total_pop_africa += ptot
        total_area_africa += cty_area[g0]
        rec_years = sorted({rec["year"] for rec in d.values() if rec["year"]})
        rec_srcs = [rec["source"] for rec in d.values() if rec["source"]]
        admin2_out["countries"][g0] = {
            "name": p["CN"],
            "population": int(round(ptot)),
            "referenceYear": (max(rec_years, key=rec_years.count) if rec_years else "unknown"),
            "source": rec_srcs[0] if rec_srcs else "UNFPA / FAO COD",
            "districts": [
                {"ADM2_PCODE": key, "ADM1_PCODE": rec["a1p"], "ADM1_NAME": rec["a1n"],
                 "ADM2_NAME": rec["a2n"], "population": int(round(rec["population"]))}
                for key, rec in sorted(d.items(), key=lambda kv: kv[1]["population"], reverse=True)
            ],
        }
        years_seen.update(rec_years)

    with open(COUNTRIES_GEOJSON, "w", encoding="utf-8") as fh:
        json.dump(countries_fc, fh, ensure_ascii=False, separators=(",", ":"))

    choro = json.load(io.open(CHORO_GEOJSON, encoding="utf-8"))
    meta = choro.setdefault("meta", {})
    africa = meta.setdefault("africa", {})
    africa["population"] = round(total_pop_africa / total_area_africa, 2) if total_area_africa > 0 else 0.0
    meta["population_source"] = "UNFPA/FAO COD admin-2 population estimates (cod_population_admin2.csv), keyed by ADM2_PCODE"
    if len(years_seen) == 1:
        meta["population_year"] = next(iter(years_seen))
    else:
        nums = [int(y) for y in years_seen if y.isdigit()]
        meta["population_year"] = ("mixed (%s–%s)" % (min(nums), max(nums))) if nums else "mixed"

    for c in meta.get("countries", []):
        d = lookup(c["gid"])
        if d is None:
            continue
        ptot = pop_tot(d)
        c["population"] = round(ptot / cty_area[c["gid"]], 2) if cty_area[c["gid"]] > 0 else 0.0
        c["population_tot"] = int(round(ptot))
        rec_years = sorted({rec["year"] for rec in d.values() if rec["year"]})
        rec_srcs = [rec["source"] for rec in d.values() if rec["source"]]
        c["population_year"] = (max(rec_years, key=rec_years.count) if rec_years else "unknown")
        c["population_source"] = (rec_srcs[0] if rec_srcs else "UNFPA / FAO COD")

    for feat in choro["features"]:
        p = feat["properties"]
        d = lookup(p["G0"])
        if d is None:
            continue
        ptot = pop_tot(d)
        p["population"] = round(ptot / cty_area[p["G0"]], 2) if cty_area[p["G0"]] > 0 else 0.0
        p["population_tot"] = int(round(ptot))

    with open(CHORO_GEOJSON, "w", encoding="utf-8") as fh:
        json.dump(choro, fh, ensure_ascii=False, separators=(",", ":"))

    with open(OUT_ADM2, "w", encoding="utf-8") as fh:
        json.dump(admin2_out, fh, ensure_ascii=False, separators=(",", ":"))

    print("  Africa mean population density:", africa["population"], "people/km²")
    print("  total African population:", int(round(total_pop_africa)))
    print("  wrote:", COUNTRIES_GEOJSON, CHORO_GEOJSON, OUT_ADM2)


if __name__ == "__main__":
    main()