"""Generate realistic synthetic occurrence data for the 5 key African tick species.

Distributes points across each species' known African range using country
centroids + gaussian spread so they scatter naturally across the continent.
"""
import json
import random
import math
import os

random.seed(42)

ROOT = os.path.join(os.path.dirname(__file__), "..")
OCCURRENCES_PATH = os.path.join(ROOT, "public", "occurrences.json")

# Known African country centroids (lat, lon) for realistic spreading
COUNTRY_COORDS = {
    "South Africa": (-29.0, 24.0),
    "Kenya": (0.02, 37.9),
    "Tanzania, United Republic of": (-6.37, 34.89),
    "Ethiopia": (9.15, 40.49),
    "Nigeria": (9.08, 8.68),
    "Mozambique": (-18.67, 35.53),
    "Zimbabwe": (-19.02, 29.15),
    "Zambia": (-13.13, 28.64),
    "Malawi": (-13.25, 34.30),
    "Uganda": (1.37, 32.29),
    "Cameroon": (7.37, 12.35),
    "Congo, Democratic Republic of the": (-4.04, 21.76),
    "Madagascar": (-18.77, 46.87),
    "Sudan": (12.86, 30.22),
    "South Sudan": (7.86, 29.86),
    "Somalia": (5.15, 46.20),
    "Morocco": (31.79, -7.09),
    "Algeria": (28.03, 1.66),
    "Tunisia": (33.89, 9.54),
    "Libya": (26.34, 17.23),
    "Egypt": (26.82, 30.80),
    "Ghana": (7.95, -1.02),
    "Senegal": (14.50, -14.45),
    "Mali": (17.57, -4.00),
    "Niger": (17.61, 8.08),
    "Chad": (15.45, 18.73),
    "Mauritania": (21.01, -10.94),
    "Guinea": (9.95, -11.86),
    "Rwanda": (-1.94, 29.87),
    "Burundi": (-3.37, 29.92),
    "Namibia": (-22.56, 17.08),
    "Botswana": (-22.33, 24.68),
    "Angola": (-11.20, 17.87),
    "Benin": (9.31, 2.32),
    "Burkina Faso": (12.37, -1.52),
    "Togo": (8.62, 1.21),
    "Sierra Leone": (8.46, -11.78),
    "Liberia": (6.43, -9.43),
    "Guinea-Bissau": (11.80, -15.18),
    "Cabo Verde": (16.54, -23.04),
    "Djibouti": (11.59, 43.15),
    "Eritrea": (15.18, 39.78),
    "Eswatini": (-26.52, 31.47),
    "Lesotho": (-29.61, 28.23),
    "Gambia": (13.44, -15.31),
    "Comoros": (-11.88, 43.87),
    "Seychelles": (-4.68, 55.49),
    "Mauritius": (-20.35, 57.55),
    "Nigeria": (9.08, 8.68),
    "Sao Tome and Principe": (0.19, 6.61),
    "Western Sahara": (24.22, -12.89),
    "Congo": (-0.23, 15.83),
    "Equatorial Guinea": (1.65, 10.27),
    "Gabon": (-0.80, 11.61),
}

# Species distributions across African countries with relative weights
SPECIES_DISTRIBUTIONS = {
    "Rhipicephalus sanguineus": {
        # Cosmopolitan brown dog tick - found across ALL of Africa, very widespread
        "South Africa": 400, "Kenya": 350, "Tanzania, United Republic of": 250,
        "Ethiopia": 200, "Nigeria": 250, "Mozambique": 150, "Zimbabwe": 120,
        "Zambia": 80, "Malawi": 100, "Uganda": 120, "Cameroon": 100,
        "Congo, Democratic Republic of the": 150, "Madagascar": 60, "Sudan": 100,
        "South Sudan": 50, "Somalia": 60, "Morocco": 80, "Algeria": 70,
        "Tunisia": 50, "Libya": 40, "Egypt": 80, "Ghana": 60, "Senegal": 40,
        "Mali": 30, "Niger": 25, "Chad": 30, "Mauritania": 20, "Guinea": 25,
        "Rwanda": 40, "Burundi": 35, "Namibia": 50, "Botswana": 40, "Angola": 60,
        "Benin": 30, "Burkina Faso": 20, "Togo": 15, "Sierra Leone": 15,
        "Liberia": 15, "Guinea-Bissau": 10, "Djibouti": 15, "Eritrea": 20,
        "Eswatini": 15, "Lesotho": 10, "Gambia": 10, "Congo": 40,
        "Equatorial Guinea": 10, "Gabon": 15,
    },
    "Rhipicephalus appendiculatus": {
        # East Coast fever tick - East/Southern Africa highlands
        "Kenya": 400, "Tanzania, United Republic of": 350, "Ethiopia": 200,
        "Uganda": 250, "Rwanda": 120, "Burundi": 100, "Malawi": 150,
        "Zambia": 180, "Zimbabwe": 120, "Congo, Democratic Republic of the": 200,
        "Cameroon": 80, "South Africa": 60, "Mozambique": 80, "Sudan": 50,
        "South Sudan": 60, "Madagascar": 30, "Central African Republic": 30,
    },
    "Rhipicephalus microplus": {
        # Asian blue tick - tropical/subtropical, mainly southern/eastern
        "South Africa": 350, "Mozambique": 200, "Zimbabwe": 180, "Zambia": 150,
        "Malawi": 120, "Tanzania, United Republic of": 200, "Kenya": 180,
        "Uganda": 100, "Nigeria": 120, "Cameroon": 80, "Congo, Democratic Republic of the": 60,
        "Angola": 50, "Botswana": 40, "Namibia": 30, "Madagascar": 30,
        "Eswatini": 20, "Lesotho": 15, "Burundi": 30, "Rwanda": 25,
    },
    "Hyalomma marginatum": {
        # Brown ear tick - North Africa, Sahel, Horn of Africa
        "Morocco": 250, "Algeria": 200, "Tunisia": 150, "Libya": 120,
        "Egypt": 200, "Sudan": 250, "South Sudan": 60, "Ethiopia": 200,
        "Somalia": 120, "Mali": 80, "Niger": 80, "Chad": 100,
        "Mauritania": 60, "Senegal": 50, "Gambia": 20, "Nigeria": 40,
        "Guinea": 20, "Guinea-Bissau": 15, "Benin": 15, "Burkina Faso": 25,
        "Ghana": 20, "Togo": 10, "Cabo Verde": 10,
    },
    "Hyalomma rufipes": {
        # Arid zone tick - Sahel, Sahara margins, East Africa arid areas
        "Morocco": 100, "Algeria": 120, "Tunisia": 80, "Libya": 100,
        "Egypt": 120, "Sudan": 150, "South Sudan": 40, "Ethiopia": 100,
        "Somalia": 100, "Mali": 80, "Niger": 80, "Chad": 90,
        "Mauritania": 60, "Senegal": 40, "Kenya": 60, "Tanzania, United Republic of": 40,
        "Namibia": 30, "Botswana": 25, "South Africa": 40, "Gambia": 15,
        "Nigeria": 30, "Guinea": 15, "Guinea-Bissau": 10, "Benin": 10,
        "Burkina Faso": 15, "Ghana": 10, "Cabo Verde": 5,
    },
}

def generate_points(species_name, distribution, target_total):
    """Generate scattered points for a species across its African range."""
    points = []
    total_weight = sum(distribution.values())

    for country, weight in distribution.items():
        if country not in COUNTRY_COORDS:
            continue
        # Calculate how many points for this country
        n = max(1, round(target_total * weight / total_weight))
        centroid_lat, centroid_lon = COUNTRY_COORDS[country]

        for _ in range(n):
            # Gaussian spread around country centroid, clamped to country area
            # Use wider spread for large countries, narrower for small ones
            spread = random.uniform(2.5, 5.0)
            lat = centroid_lat + random.gauss(0, spread)
            lon = centroid_lon + random.gauss(0, spread)

            # Clamp to Africa bbox
            lat = max(-38, min(38, lat))
            lon = max(-22, min(52, lon))

            # Generate a realistic year (biased toward recent)
            year = random.choices(
                list(range(2000, 2026)),
                weights=[1 + 0.3 * (y - 2000) for y in range(2000, 2026)],
                k=1,
            )[0]

            points.append({
                "species": species_name,
                "latitude": round(lat, 6),
                "longitude": round(lon, 6),
                "country": country,
                "year": year,
            })

    return points


# Load existing data
print("Loading existing occurrences.json ...")
with open(OCCURRENCES_PATH, "r", encoding="utf-8") as f:
    existing = json.load(f)

existing_data = existing["data"]
max_id = max(r["id"] for r in existing_data)

# Generate for each species
targets = {
    "Rhipicephalus sanguineus": 3500,
    "Rhipicephalus appendiculatus": 2500,
    "Rhipicephalus microplus": 1500,
    "Hyalomma marginatum": 2000,
    "Hyalomma rufipes": 1000,
}

total_added = 0
for species, target in targets.items():
    dist = SPECIES_DISTRIBUTIONS[species]
    points = generate_points(species, dist, target)

    for p in points:
        max_id += 1
        p["id"] = max_id
        p["gbifId"] = f"synth_{max_id}"
        p["citation"] = "Synthetically distributed occurrence data based on known species range"
        existing_data.append(p)

    print(f"  {species}: +{len(points)} points (target {target})")
    total_added += len(points)

# Reassign sequential IDs
for i, rec in enumerate(existing_data):
    rec["id"] = i + 1

existing["data"] = existing_data

print(f"\nTotal new points: {total_added}")
print(f"Total records: {len(existing_data)}")

with open(OCCURRENCES_PATH, "w", encoding="utf-8") as f:
    json.dump(existing, f)

print("occurrences.json updated.")
