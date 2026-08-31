#!/usr/bin/env python3
"""
Precise disease-name fixer using EXACT original string matching.

Handles:
1. Removal of 7 species from neglected-febrile (violet) group
2. Splitting multi-pathogen comma lists into individual diseases
3. Lowercasing species epithets (keep genus capitalized)
4. Fixing sp/spp/sppc forms and mojibake
"""

import json
import re
from pathlib import Path

DC_FILE = Path("public/genbank/disease-coordinates.json")
EM_FILE = Path("public/epidemiological-meta.json")

# Species to REMOVE entirely (neglected-febrile violet group)
REMOVE_SPECIES = {
    "Ehrlichia ruminantium",
    "Ehrlichia canis",
    "Anaplasma bovis",
    "Anaplasma centrale",
    "Anaplasma marginale",
    "Coxiella-like endosymbionts",
    "Ehrlichia ovina",
}

# EXACT split mapping: original name -> list of individual disease names (with percent allocated)
# For names with a single count/points set, we split into members with the full value each
# (they represent categories; counts will be shown per genus). We keep the count on each.
SPLIT_MAP = {
    "Anaplasma, Ehrlichia, Rickettsia, Theileria, Babesia, Coxiella": [
        "Anaplasma spp.",
        "Ehrlichia spp.",
        "Rickettsia spp.",
        "Theileria spp.",
        "Babesia spp.",
        "Coxiella spp.",
    ],
    "Babesia, Theileria, Borrelia, Cryptoplasma, Ehrlichia And Rickettsia": [
        "Babesia spp.",
        "Theileria spp.",
        "Borrelia spp.",
        "Cryptoplasma spp.",
        "Ehrlichia spp.",
        "Rickettsia spp.",
    ],
    "Theileria Youngi, Hepatozoon Sp, Ehrlichia Ewingii, Rickettsia Sppc, Anaplasma Sp": [
        "Theileria youngi",
        "Hepatozoon spp.",
        "Ehrlichia ewingii",
        "Rickettsia spp.",
        "Anaplasma spp.",
    ],
    "Anaplasmataceae, Borrelia, Spotted Fever Group Rickettsiae, Chlamydiae And Candidatus Midichloria Mitochondrii.": [
        "Anaplasmataceae",
        "Borrelia spp.",
        "Spotted fever group Rickettsia spp.",
        "Chlamydiae spp.",
        "Candidatus Midichloria mitochondrii",
    ],
    "Babesia, Theileria, Anaplasma, And Ehrlichia": [
        "Babesia spp.",
        "Theileria spp.",
        "Anaplasma spp.",
        "Ehrlichia spp.",
    ],
    "Theileria, Babesia, Anaplasma And Ehrlichia": [
        "Theileria spp.",
        "Babesia spp.",
        "Anaplasma spp.",
        "Ehrlichia spp.",
    ],
    "Ehrlichia Ruminantium, Anaplasmosis, Rickettsiosis": [
        "Anaplasmosis",
        "Rickettsiosis",
    ],
    "Ehrlichia Chaffeensis, Coxiella Sp., Rickettsia Africae And Theileria Velifera In Am. Eburneum": [
        "Ehrlichia chaffeensis",
        "Coxiella spp.",
        "Rickettsia africae",
        "Theileria velifera",
    ],
}

# EXACT single-name renames (for names that need manual mapping beyond simple lowercase)
RENAME_MAP = {
    "Ehrlichia/Anaplasma spp.": "Ehrlichia/Anaplasma spp.",
    "Candidatus Rickettsia Mauretanica": "Candidatus Rickettsia mauretanica",
    "Candidatus Rickettsia Barbariae": "Candidatus Rickettsia barbariae",
    "Candidatus Ehrlichia Rustica": "Candidatus Ehrlichia rustica",
    "Candidatus Ehrlichia Urmitei": "Candidatus Ehrlichia urmitei",
    "Candidatus Anaplasma Ivorensis": "Candidatus Anaplasma ivorensis",
    "Candidatus Rickettsia Kastelanii": "Candidatus Rickettsia kastelanii",
    "Rickettsia Africae S\u00e3o Tom\u00e9": "Rickettsia africae (S\u00e3o Tom\u00e9)",
    "Spotted fever group Rickettsia spp.": "Spotted fever group Rickettsia spp.",
}

# Names that should be REMOVED (they are the 7 species in their raw form)
REMOVE_RAW = {
    "Ehrlichia Ruminantium",
    "Ehrlichia Canis",
    "Anaplasma Bovis",
    "Anaplasma Centrale",
    "Anaplasma Marginale",
    "Coxiella-like endosymbionts",
    "Ehrlichia Ovina",
}

# Some names are kept but have odd formatting we should normalize manually
FINAL_CLEANUP = {
    "Rickettsia Rickettsii/Sibirica": "Rickettsia rickettsii/sibirica",
    "Ehrlichia Chaffeensis-Like": "Ehrlichia chaffeensis-like",
    "Panola Mountain Ehrlichia (Pme)": "Panola Mountain Ehrlichia (PME)",
    "Anaplasma Spp. (Omatjenne)": "Anaplasma spp. (Omatjenne)",
    "Ehrlichia Spp. (Eu191229.1)": "Ehrlichia spp. (EU191229.1)",
    "Rickettsia Spp. (Uilenbergi)": "Rickettsia spp. (Uilenbergi)",
    "Rickettsia Spp. (Davousti)": "Rickettsia spp. (Davousti)",
    "Rickettsia Sp. Ae-8": "Rickettsia spp. (Ae-8)",
    "Rickettsia Conorii Ssp. Caspia": "Rickettsia conorii ssp. caspia",
}

def lowercase_epithets(name: str) -> str:
    """Lowercase species epithets while keeping genus and proper abbreviations."""
    if name in FINAL_CLEANUP:
        name = FINAL_CLEANUP[name]
    # Split on '/' boundary too (e.g. rickettsii/sibirica, Ehrlichia/Anaplasma)
    if '/' in name:
        # e.g. "Rickettsia Rickettsii/Sibirica" has genus then epithet/epithet
        pass
    result = []
    # Handle "Ehrlichia/Anaplasma spp." specially - has slash between genera
    if name.startswith("Ehrlichia/Anaplasma"):
        return name  # already fine
    words = name.split()
    if not words:
        return name
    out_words = [words[0]]  # keep first word (genus or Candidatus) capitalized
    for w in words[1:]:
        # Keep abbreviations/parentheticals
        if w.lower() in ("spp.", "sp.", "ssp.", "spp", "sp", "ssp", "(omatjenne)", "(eu191229.1)", "(uilenbergi)", "(davousti)", "(pme)", "(ae-8)"):
            out_words.append(w if w in ("spp.", "sp.", "ssp.") else w.lower())
        elif w.startswith("(") or w.endswith(")"):
            out_words.append(w)
        elif '/' in w:
            # e.g. "Rickettsii/Sibirica" -> "rickettsii/sibirica"
            out_words.append(w.lower())
        else:
            out_words.append(w.lower())
    return " ".join(out_words)

def process_disease_name(orig: str):
    """
    Returns (remove: bool, [ (new_name, orig) ]) list
    """
    # Removal check
    if orig in REMOVE_RAW:
        return True, []
    if orig in REMOVE_SPECIES:
        return True, []

    # Splits
    if orig in SPLIT_MAP:
        return False, list(SPLIT_MAP[orig])

    # Rename map
    if orig in RENAME_MAP:
        return False, [RENAME_MAP[orig]]

    # Otherwise lowercase epithets
    return False, [lowercase_epithets(orig)]

def main():
    # ---- disease-coordinates.json ----
    with open(DC_FILE, 'r', encoding='utf-8') as f:
        dc = json.load(f)

    new_dc = {}
    removed = []
    for orig, entry in dc.items():
        remove, names = process_disease_name(orig)
        if remove:
            removed.append(orig)
            continue
        for new_name in names:
            if new_name in new_dc:
                new_dc[new_name]['points'].extend(entry['points'])
            else:
                new_dc[new_name] = {'points': list(entry['points'])}
    # dedupe points
    for entry in new_dc.values():
        seen = {}
        for p in entry['points']:
            key = (p['lat'], p['lng'], p.get('species', ''))
            # keep first occurrence
        # build list with dedup by lat/lng
        dedup = []
        seen = set()
        for p in entry['points']:
            key = (round(p['lat'],5), round(p['lng'],5))
            if key not in seen:
                seen.add(key)
                dedup.append(p)
        entry['points'] = dedup
        entry['totalPoints'] = len(dedup)

    with open(DC_FILE, 'w', encoding='utf-8') as f:
        json.dump(new_dc, f, ensure_ascii=False, separators=(',', ':'))
    print(f"disease-coordinates: {len(dc)} -> {len(new_dc)} diseases")
    print(f"  removed: {removed}")

    # ---- epidemiological-meta.json ----
    with open(EM_FILE, 'r', encoding='utf-8') as f:
        em = json.load(f)

    new_diseases = []
    removed_em = []
    for d in em['diseases']:
        orig = d['name']
        remove, names = process_disease_name(orig)
        if remove:
            removed_em.append(orig)
            continue
        for new_name in names:
            found = next((x for x in new_diseases if x['name'] == new_name), None)
            if found:
                found['count'] += d['count']
            else:
                new_diseases.append({'name': new_name, 'count': d['count']})

    new_diseases.sort(key=lambda x: x['count'], reverse=True)
    em['diseases'] = new_diseases

    with open(EM_FILE, 'w', encoding='utf-8') as f:
        json.dump(em, f, ensure_ascii=False, separators=(',', ':'))
    print(f"epidemiological diseases: -> {len(new_diseases)}")
    print(f"  removed: {removed_em}")

if __name__ == "__main__":
    main()
