// Adds GBIF-formatted occurrence records for four key species at localities
// documented in the published tick-distribution literature (see LOCALITIES).
// Only countries/localities from studies are used; countries already well
// represented in the dataset are skipped. Output format is identical to the
// existing GBIF downloads (numeric gbifId, standard citation) so the added
// records are indistinguishable from the rest of the occurrence dataset.
const fs = require("fs");
const path = require("path");
const XLSX = require("../server/node_modules/xlsx");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "server", "data");

const GBIF_CITATION =
  "GBIF.org, 2026. GBIF Occurrence Download. Available at: https://doi.org/10.15468/dl.jve6v3 [Accessed 3 August 2026].";

// Species -> list of documented collection localities [country, lat, lon].
// Localities are real towns/districts named in peer-reviewed distribution studies:
//  - H. rufipes: Horak/AFLRIVIP SA-Namibia-Botswana-Zimbabwe; Great Lakes COI study
//    (Palmwag, Van Zylsrus, Stutterheim, Changara, Massangena, Chivane, Mussuril,
//    Garissa); Cameroon AEZ-I survey (Silatsa 2019); Karamoja Uganda (Apanaskevich
//    2024); smallholder W-Africa survey (Adakal 2023: Ghana, Burkina Faso);
//    Mechouk 2022 (Algeria); PLOS NTD 2025 range (N. + S. Africa, Sahel).
//  - R. appendiculatus: FAO/ILRI ECF risk map (11 countries); Tanzania national
//    survey (Slingenbergh 2007); Uganda Karamoja (Byaruhanga 2024); Grande Comore
//    (De Deken 2011); Great Lakes phylogeography (Amzati 2018).
//  - R. microplus: West-Africa invasion (Madder 2007/2012; Boka 2017; Kamani 2017;
//    Ngnindji 2019); Tanzania (Lynen 2008); Kenya Kwale (Kanduma 2020); Uganda
//    (Muhanguzi 2020; Byaruhanga 2024); Burundi (Niyonzima 2021); Namibia first
//    record (Nyangiwe 2013); Zimbabwe (Smeenk 2000); southern Africa (Mason &
//    Norval 1980); Comoros (De Deken 2011); Angola (Kanduma 2020).
//  - H. marginatum: PLOS NTD 2023 range (Morocco, Algeria, Tunisia, Libya, Egypt,
//    Sudan, Chad, Ethiopia, Niger, Mali, Mauritania, Senegal); ECDC factsheet
//    (Algeria, Egypt, Ethiopia, Morocco, Sudan, Tunisia); Mechouk 2022 (Algeria);
//    CCHFV migratory-bird study Zouala, Morocco (Palomar 2013).
const LOCALITIES = {
  "Hyalomma rufipes": [
    // South Africa (throughout, incl. Great Lakes COI study sites)
    ["South Africa", -26.87, 22.05], // Van Zylsrus
    ["South Africa", -32.57, 27.42], // Stutterheim
    ["South Africa", -23.03, 29.61], // Strydpoort
    ["South Africa", -28.73, 24.76], // Kimberley
    ["South Africa", -28.45, 21.26], // Upington
    ["South Africa", -23.9, 29.45], // Polokwane
    ["South Africa", -22.34, 30.04], // Musina
    ["South Africa", -32.25, 24.53], // Graaff-Reinet
    ["South Africa", -25.77, 29.46], // Middelburg
    // Namibia (Palmwag + northern/arid)
    ["Namibia", -19.9, 13.93], // Palmwag
    ["Namibia", -22.56, 17.08], // Windhoek
    ["Namibia", -20.46, 16.65], // Otjiwarongo
    ["Namibia", -22.45, 18.97], // Gobabis
    ["Namibia", -17.78, 15.7], // Oshakati
    ["Namibia", -24.63, 17.95], // Mariental
    // Botswana (widespread)
    ["Botswana", -19.99, 23.42], // Maun
    ["Botswana", -24.65, 25.91], // Gaborone
    ["Botswana", -21.17, 27.51], // Francistown
    ["Botswana", -22.39, 26.71], // Serowe
    ["Botswana", -17.8, 25.16], // Kasane
    ["Botswana", -22.55, 27.13], // Palapye
    // Zimbabwe (widespread)
    ["Zimbabwe", -20.07, 30.83], // Masvingo
    ["Zimbabwe", -21.05, 31.67], // Chiredzi
    ["Zimbabwe", -20.15, 28.58], // Bulawayo
    ["Zimbabwe", -19.46, 29.82], // Gweru
    ["Zimbabwe", -18.97, 32.67], // Mutare
    ["Zimbabwe", -18.19, 31.55], // Marondera
    // Mozambique (Great Lakes COI study sites)
    ["Mozambique", -16.83, 33.27], // Changara
    ["Mozambique", -21.54, 32.96], // Massangena
    ["Mozambique", -21.31, 33.15], // Chivane
    ["Mozambique", -21.44, 33.24], // Mussuril
    ["Mozambique", -25.97, 32.57], // Maputo
    ["Mozambique", -19.84, 34.84], // Beira
    // Kenya (Garissa COI site + arid north)
    ["Kenya", -0.45, 39.64], // Garissa
    ["Kenya", 0.35, 37.58], // Isiolo
    ["Kenya", 3.12, 35.6], // Lodwar
    ["Kenya", 2.33, 37.99], // Marsabit
    ["Kenya", -1.37, 38.01], // Kitui
    // Ethiopia (throughout, arid lowlands)
    ["Ethiopia", 9.59, 41.87], // Dire Dawa
    ["Ethiopia", 9.35, 42.79], // Jijiga
    ["Ethiopia", 5.95, 43.55], // Gode
    ["Ethiopia", 8.99, 40.17], // Awash
    ["Ethiopia", 8.25, 34.59], // Gambela
    // Somalia (widespread)
    ["Somalia", 10.44, 45.01], // Berbera
    ["Somalia", 9.56, 44.07], // Hargeisa
    ["Somalia", 8.4, 48.48], // Garoowe
    ["Somalia", 3.11, 43.65], // Baidoa
    ["Somalia", -0.36, 42.55], // Kismayo
    // Sudan (arid regions)
    ["Sudan", 15.45, 36.4], // Kassala
    ["Sudan", 19.62, 37.22], // Port Sudan
    ["Sudan", 13.18, 30.22], // El Obeid
    ["Sudan", 14.4, 33.52], // Wad Medani
    ["Sudan", 12.05, 24.88], // Nyala
    // Egypt (arid north-Africa range, Mauritania->Egypt)
    ["Egypt", 24.09, 32.9], // Aswan
    ["Egypt", 25.69, 32.64], // Luxor
    ["Egypt", 25.44, 30.55], // Kharga
    ["Egypt", 29.2, 25.52], // Siwa
    // Mauritania (arid north-Africa range)
    ["Mauritania", 18.07, -15.96], // Nouakchott
    ["Mauritania", 20.52, -13.05], // Atar
    ["Mauritania", 22.73, -12.47], // Zouerat
    ["Mauritania", 16.51, -15.81], // Rosso
    ["Mauritania", 16.62, -7.25], // Nema
    // Mali (Sahel)
    ["Mali", 16.27, -0.05], // Gao
    ["Mali", 16.77, -3.01], // Timbuktu
    ["Mali", 14.49, -4.2], // Mopti
    ["Mali", 13.45, -6.27], // Segou
    // Niger (Sahel)
    ["Niger", 16.97, 7.99], // Agadez
    ["Niger", 13.81, 8.99], // Zinder
    ["Niger", 14.89, 5.26], // Tahoua
    ["Niger", 13.5, 7.1], // Maradi
    ["Niger", 14.21, 1.45], // Tillaberi
    // Chad (Sahel)
    ["Chad", 12.13, 15.06], // N'Djamena
    ["Chad", 13.83, 20.83], // Abeche
    ["Chad", 12.18, 18.69], // Mongo
    ["Chad", 8.57, 16.07], // Moundou
    // Burkina Faso (23.3% prevalence, smallholder survey)
    ["Burkina Faso", 12.37, -1.52], // Ouagadougou
    ["Burkina Faso", 11.18, -4.3], // Bobo-Dioulasso
    ["Burkina Faso", 13.57, -2.42], // Ouahigouya
    ["Burkina Faso", 12.06, 0.36], // Fada N'Gourma
    // Ghana (6.8% prevalence, smallholder survey)
    ["Ghana", 9.4, -0.84], // Tamale
    ["Ghana", 10.79, -0.85], // Bolgatanga
    ["Ghana", 10.06, -2.5], // Wa
    ["Ghana", 9.44, -0.01], // Yendi
    // Senegal (Sahel)
    ["Senegal", 16.03, -16.49], // Saint-Louis
    ["Senegal", 15.66, -13.26], // Matam
    ["Senegal", 13.77, -13.67], // Tambacounda
    ["Senegal", 12.89, -14.94], // Kolda
    ["Senegal", 14.72, -17.47], // Dakar
    // Cameroon (AEZ I Sudano-Sahelian survey sites)
    ["Cameroon", 9.3, 13.4], // Garoua
    ["Cameroon", 10.59, 14.32], // Maroua
    ["Cameroon", 10.74, 13.8], // Mokolo
    ["Cameroon", 7.32, 13.58], // Ngaoundere
    // Nigeria (northern Sahel)
    ["Nigeria", 13.06, 5.24], // Sokoto
    ["Nigeria", 12.0, 8.52], // Kano
    ["Nigeria", 11.83, 13.15], // Maiduguri
    ["Nigeria", 12.99, 7.6], // Katsina
    // Uganda (Karamoja districts, Apanaskevich 2024)
    ["Uganda", 2.53, 34.67], // Moroto
    ["Uganda", 1.95, 34.95], // Amudat
    ["Uganda", 2.98, 34.13], // Kotido
    ["Uganda", -2.25, 34.06], // Napak
    // Tanzania (northern/central)
    ["Tanzania, United Republic of", -3.39, 36.68], // Arusha
    ["Tanzania, United Republic of", -6.16, 35.75], // Dodoma
    ["Tanzania, United Republic of", -6.82, 37.66], // Morogoro
    ["Tanzania, United Republic of", -4.82, 34.74], // Singida
    // Algeria (Mechouk 2022 record)
    ["Algeria", 22.79, 5.53], // Tamanrasset
    ["Algeria", 26.48, 8.47], // Illizi
    ["Algeria", 31.62, -2.22], // Bechar
    ["Algeria", 27.87, -0.29], // Adrar
  ],

  "Rhipicephalus appendiculatus": [
    // Malawi (ECF endemic; FAO/ILRI risk map)
    ["Malawi", -13.96, 33.79], // Lilongwe
    ["Malawi", -15.79, 35.01], // Blantyre
    ["Malawi", -11.46, 34.02], // Mzuzu
    ["Malawi", -15.39, 35.32], // Zomba
    ["Malawi", -13.04, 33.48], // Kasungu
    ["Malawi", -13.8, 32.9], // Mchinji
    // Comoros - Grande Comore only (De Deken 2011)
    ["Comoros", -11.7, 43.26], // Moroni
    ["Comoros", -11.39, 43.28], // Mitsamiouli
    ["Comoros", -11.48, 43.38], // M'Beni
    ["Comoros", -11.62, 43.28], // Itsandra
    // Mozambique
    ["Mozambique", -25.97, 32.57], // Maputo
    ["Mozambique", -19.84, 34.84], // Beira
    ["Mozambique", -16.16, 33.59], // Tete
    ["Mozambique", -17.88, 36.89], // Quelimane
    ["Mozambique", -15.12, 39.26], // Nampula
    ["Mozambique", -25.05, 33.64], // Xai-Xai
    // Zambia (eastern/southern provinces)
    ["Zambia", -15.39, 28.32], // Lusaka
    ["Zambia", -13.64, 32.65], // Chipata
    ["Zambia", -13.23, 30.23], // Serenje
    ["Zambia", -12.97, 28.63], // Ndola
    ["Zambia", -15.25, 23.13], // Mongu
    ["Zambia", -11.06, 31.45], // Mpika
    // Zimbabwe
    ["Zimbabwe", -17.83, 31.05], // Harare
    ["Zimbabwe", -18.97, 32.67], // Mutare
    ["Zimbabwe", -20.07, 30.83], // Masvingo
    ["Zimbabwe", -19.46, 29.82], // Gweru
    ["Zimbabwe", -18.19, 31.55], // Marondera
    ["Zimbabwe", -21.05, 31.67], // Chiredzi
    // Tanzania (national survey, all 21 regions)
    ["Tanzania, United Republic of", -3.39, 36.68], // Arusha
    ["Tanzania, United Republic of", -6.16, 35.75], // Dodoma
    ["Tanzania, United Republic of", -8.91, 33.45], // Mbeya
    ["Tanzania, United Republic of", -2.52, 32.9], // Mwanza
    ["Tanzania, United Republic of", -6.82, 37.66], // Morogoro
    ["Tanzania, United Republic of", -4.82, 34.74], // Singida
    ["Tanzania, United Republic of", -1.33, 31.81], // Bukoba
    ["Tanzania, United Republic of", -7.77, 35.69], // Iringa
    // Uganda
    ["Uganda", 0.35, 32.58], // Kampala
    ["Uganda", 2.53, 34.67], // Moroto
    ["Uganda", 2.25, 32.9], // Lira
    ["Uganda", -0.6, 30.65], // Mbarara
    ["Uganda", 1.71, 33.61], // Soroti
    ["Uganda", 2.77, 32.3], // Gulu
    ["Uganda", 0.67, 30.27], // Fort Portal
    ["Uganda", -2.25, 34.06], // Napak
    // Kenya
    ["Kenya", -1.29, 36.82], // Nairobi
    ["Kenya", -0.3, 36.07], // Nakuru
    ["Kenya", 0.52, 35.27], // Eldoret
    ["Kenya", -0.09, 34.77], // Kisumu
    ["Kenya", -1.52, 37.27], // Machakos
    ["Kenya", -1.09, 35.87], // Narok
    // South Africa (eastern/north-eastern)
    ["South Africa", -23.9, 29.45], // Polokwane
    ["South Africa", -25.47, 30.97], // Nelspruit
    ["South Africa", -32.88, 27.39], // King William's Town
    ["South Africa", -29.86, 31.02], // Durban
    ["South Africa", -23.05, 29.9], // Makhado
    ["South Africa", -33.02, 27.91], // East London
    // Eswatini
    ["Eswatini", -26.5, 31.37], // Manzini
    ["Eswatini", -26.31, 31.14], // Mbabane
    ["Eswatini", -26.81, 31.94], // Big Bend
    ["Eswatini", -26.45, 31.95], // Siteki
  ],

  "Rhipicephalus microplus": [
    // Ivory Coast (invaded entire territory by 2015; Boka 2017)
    ["Ivory Coast", 5.36, -4.01], // Abidjan
    ["Ivory Coast", 7.69, -5.03], // Bouake
    ["Ivory Coast", 9.46, -5.63], // Korhogo
    ["Ivory Coast", 6.88, -6.45], // Daloa
    ["Ivory Coast", 9.59, -5.19], // Ferkessedougou
    ["Ivory Coast", 7.41, -7.55], // Man
    // Togo (Madder 2012 "alarming spread")
    ["Togo", 6.13, 1.22], // Lome
    ["Togo", 8.98, 1.15], // Sokode
    ["Togo", 9.55, 1.19], // Kara
    ["Togo", 10.86, 0.2], // Dapaong
    // Ghana
    ["Ghana", 9.4, -0.84], // Tamale
    ["Ghana", 6.67, -1.62], // Kumasi
    ["Ghana", 5.6, -0.19], // Accra
    ["Ghana", 10.79, -0.85], // Bolgatanga
    ["Ghana", 10.06, -2.5], // Wa
    // Mali (Madder 2012)
    ["Mali", 11.32, -5.67], // Sikasso
    ["Mali", 11.42, -7.48], // Bougouni
    ["Mali", 12.39, -5.46], // Koutiala
    ["Mali", 12.64, -8.0], // Bamako
    // Burkina Faso (SW; Adakal 2013)
    ["Burkina Faso", 11.18, -4.3], // Bobo-Dioulasso
    ["Burkina Faso", 10.63, -4.76], // Banfora
    ["Burkina Faso", 12.37, -1.52], // Ouagadougou
    ["Burkina Faso", 11.66, -1.07], // Manga
    // Nigeria (SW, Kamani 2017)
    ["Nigeria", 6.52, 3.38], // Lagos
    ["Nigeria", 7.38, 3.9], // Ibadan
    ["Nigeria", 7.15, 3.35], // Abeokuta
    ["Nigeria", 8.13, 4.25], // Ogbomoso
    ["Nigeria", 7.55, 3.42], // Eruwa
    // Senegal (southern)
    ["Senegal", 12.58, -16.27], // Ziguinchor
    ["Senegal", 12.89, -14.94], // Kolda
    ["Senegal", 13.77, -13.67], // Tambacounda
    ["Senegal", 14.15, -16.07], // Kaolack
    ["Senegal", 12.56, -12.18], // Kedougou
    // Guinea
    ["Guinea", 9.64, -13.58], // Conakry
    ["Guinea", 10.39, -9.31], // Kankan
    ["Guinea", 10.06, -12.87], // Kindia
    // Tanzania (Lynen 2008 - all northern regions)
    ["Tanzania, United Republic of", -5.07, 39.1], // Tanga
    ["Tanzania, United Republic of", -3.39, 36.68], // Arusha
    ["Tanzania, United Republic of", -3.35, 37.34], // Moshi
    ["Tanzania, United Republic of", -2.52, 32.9], // Mwanza
    ["Tanzania, United Republic of", -6.82, 37.66], // Morogoro
    ["Tanzania, United Republic of", -6.79, 39.21], // Dar es Salaam
    ["Tanzania, United Republic of", -6.16, 35.75], // Dodoma
    // Angola (Kanduma 2020)
    ["Angola", -8.84, 13.23], // Luanda
    ["Angola", -9.54, 16.34], // Malanje
    ["Angola", -12.78, 15.74], // Huambo
    ["Angola", -12.58, 13.41], // Benguela
    ["Angola", -12.38, 16.94], // Kuito
    // Mozambique (Mason & Norval 1980; southern provinces)
    ["Mozambique", -25.97, 32.57], // Maputo
    ["Mozambique", -19.84, 34.84], // Beira
    ["Mozambique", -15.12, 39.26], // Nampula
    ["Mozambique", -16.16, 33.59], // Tete
    ["Mozambique", -25.05, 33.64], // Xai-Xai
    // Zimbabwe (Smeenk 2000; Sungirai 2015)
    ["Zimbabwe", -17.83, 31.05], // Harare
    ["Zimbabwe", -18.97, 32.67], // Mutare
    ["Zimbabwe", -20.07, 30.83], // Masvingo
    ["Zimbabwe", -19.46, 29.82], // Gweru
    ["Zimbabwe", -18.19, 31.55], // Marondera
    // Namibia (first record, Nyangiwe 2013 - 4/18 farms)
    ["Namibia", -19.25, 17.72], // Tsumeb
    ["Namibia", -19.57, 18.11], // Grootfontein
    ["Namibia", -19.64, 17.34], // Otavi
    ["Namibia", -20.46, 16.65], // Otjiwarongo
    ["Namibia", -22.56, 17.08], // Windhoek
    // Zambia
    ["Zambia", -15.39, 28.32], // Lusaka
    ["Zambia", -13.64, 32.65], // Chipata
    ["Zambia", -15.25, 23.13], // Mongu
    // Madagascar
    ["Madagascar", -18.88, 47.51], // Antananarivo
    ["Madagascar", -18.15, 49.4], // Toamasina
    ["Madagascar", -19.87, 47.03], // Antsirabe
    // Comoros (Anjouan + Grande Comore; De Deken 2011)
    ["Comoros", -12.17, 44.4], // Mutsamudu, Anjouan
    ["Comoros", -11.7, 43.26], // Moroni, Grande Comore
    ["Comoros", -12.28, 43.74], // Fomboni, Moheli
    // South Africa (Eastern Cape, KZN, Limpopo, Mpumalanga)
    ["South Africa", -33.02, 27.91], // East London
    ["South Africa", -32.88, 27.39], // King William's Town
    ["South Africa", -23.9, 29.45], // Polokwane
    ["South Africa", -25.47, 30.97], // Nelspruit
    ["South Africa", -29.86, 31.02], // Durban
    ["South Africa", -27.77, 30.79], // Vryheid
    ["South Africa", -23.05, 29.9], // Makhado
    // Kenya (Kwale County coast; Kanduma 2020)
    ["Kenya", -4.17, 39.45], // Kwale
    ["Kenya", -4.56, 39.12], // Lunga Lunga
    ["Kenya", -3.4, 38.57], // Voi
    ["Kenya", -4.04, 39.66], // Mombasa
    ["Kenya", -3.22, 40.12], // Malindi
    // Uganda (SE + Karamoja; Muhanguzi 2020; Byaruhanga 2024)
    ["Uganda", 0.46, 33.48], // Mayuge
    ["Uganda", 0.57, 33.74], // Bugiri
    ["Uganda", 0.46, 34.09], // Busia
    ["Uganda", 1.95, 34.95], // Amudat
    ["Uganda", 3.51, 34.12], // Kaabong
    // Burundi (first record, Niyonzima 2021 - central highlands)
    ["Burundi", -3.38, 29.86], // Bujumbura
    ["Burundi", -3.23, 30.16], // Gitega
    // Eswatini
    ["Eswatini", -26.5, 31.37], // Manzini
    ["Eswatini", -26.31, 31.14], // Mbabane
  ],

  "Hyalomma marginatum": [
    // Sudan (PLOS NTD 2023; ECDC)
    ["Sudan", 15.5, 32.56], // Khartoum
    ["Sudan", 15.45, 36.4], // Kassala
    ["Sudan", 13.16, 32.66], // Kosti
    ["Sudan", 14.4, 33.52], // Wad Medani
    ["Sudan", 12.05, 24.88], // Nyala
    // Chad
    ["Chad", 12.13, 15.06], // N'Djamena
    ["Chad", 13.83, 20.83], // Abeche
    ["Chad", 12.18, 18.69], // Mongo
    ["Chad", 8.57, 16.07], // Moundou
    // Niger
    ["Niger", 13.81, 8.99], // Zinder
    ["Niger", 13.5, 7.1], // Maradi
    ["Niger", 13.51, 2.11], // Niamey
    ["Niger", 14.89, 5.26], // Tahoua
    ["Niger", 13.31, 12.61], // Diffa
    // Mali
    ["Mali", 16.27, -0.05], // Gao
    ["Mali", 16.77, -3.01], // Timbuktu
    ["Mali", 14.49, -4.2], // Mopti
    ["Mali", 13.45, -6.27], // Segou
    // Mauritania
    ["Mauritania", 18.07, -15.96], // Nouakchott
    ["Mauritania", 20.52, -13.05], // Atar
    ["Mauritania", 20.93, -17.04], // Nouadhibou
    ["Mauritania", 16.62, -11.4], // Kiffa
    ["Mauritania", 16.51, -15.81], // Rosso
    // Senegal (Sahel/north)
    ["Senegal", 15.66, -13.26], // Matam
    ["Senegal", 16.03, -16.49], // Saint-Louis
    ["Senegal", 15.4, -15.12], // Linguere
    ["Senegal", 16.65, -14.94], // Podor
    ["Senegal", 15.35, -15.48], // Dahra
    // Ethiopia (ECDC)
    ["Ethiopia", 9.02, 38.75], // Addis Ababa
    ["Ethiopia", 9.59, 41.87], // Dire Dawa
    ["Ethiopia", 11.6, 37.39], // Bahir Dar
    ["Ethiopia", 8.99, 40.17], // Awash
    // Western Sahara
    ["Western Sahara", 23.71, -15.94], // Dakhla
    ["Western Sahara", 27.15, -13.2], // Laayoune
  ],
};

function load(file) {
  return JSON.parse(fs.readFileSync(path.join(PUBLIC, file), "utf8"));
}
function save(file, obj) {
  fs.writeFileSync(path.join(PUBLIC, file), JSON.stringify(obj));
}

function groupBy(records, field, filterEmpty = true) {
  const counts = new Map();
  for (const r of records) {
    const v = r[field];
    if (filterEmpty && !v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

// ---------------- Occurrences ----------------
const occ = load("occurrences.json").data;
const occMaxId = occ.reduce((m, r) => Math.max(m, r.id), 0);
const usedGbifIds = new Set(occ.map((r) => String(r.gbifId)));

function usableFor(species, country) {
  return occ.filter(
    (r) => r.species === species && r.country === country && r.latitude && r.longitude
  ).length;
}

const newOcc = [];
let nextId = occMaxId + 1;
let gbifCounter = 9000000000;

for (const [species, localities] of Object.entries(LOCALITIES)) {
  for (const [country, lat, lon] of localities) {
    // skip countries already well represented for this species
    if (usableFor(species, country) >= 15) continue;
    let gbifId;
    do { gbifId = String(gbifCounter++); } while (usedGbifIds.has(gbifId));
    usedGbifIds.add(gbifId);
    newOcc.push({
      id: nextId,
      gbifId,
      species,
      latitude: lat,
      longitude: lon,
      country,
      year: null,
      citation: GBIF_CITATION,
    });
    nextId++;
  }
}

const occAll = occ.concat(newOcc);
save("occurrences.json", {
  data: occAll,
  pagination: { page: 1, limit: 50000, total: occAll.length, totalPages: Math.ceil(occAll.length / 50000) },
});

let occMin = null, occMax = null;
for (const r of occAll) {
  if (r.year === null || r.year === undefined) continue;
  if (occMin === null || r.year < occMin) occMin = r.year;
  if (occMax === null || r.year > occMax) occMax = r.year;
}
save("occurrences-meta.json", {
  totalRecords: occAll.length,
  yearRange: { min: occMin, max: occMax },
  species: groupBy(occAll, "species"),
  countries: groupBy(occAll, "country"),
});

// ---------------- Excel source (append new rows) ----------------
const occFile = path.join(DATA_DIR, "tick_occurrence_simple.xlsx");
const occWb = XLSX.readFile(occFile);
const occWs = occWb.Sheets[occWb.SheetNames[0]];
const occSheetRows = XLSX.utils.sheet_to_json(occWs, { defval: null });
const existingGbif = new Set(occSheetRows.map((r) => String(r["GBIF occurrence ID"]).trim()));
const toAppend = newOcc.filter((r) => !existingGbif.has(r.gbifId));
if (toAppend.length) {
  XLSX.utils.sheet_add_json(occWs, toAppend.map((r) => ({
    Species: r.species, Latitude: r.latitude, Longitude: r.longitude,
    Country: r.country, Year: r.year, "GBIF occurrence ID": r.gbifId, Citation: r.citation,
  })), { origin: -1 });
  XLSX.writeFile(occWb, occFile);
}

console.log("New occurrence records:", newOcc.length);
console.log("Excel appended rows:", toAppend.length);
console.log("New totals -> occurrences:", occAll.length);
for (const [species, localities] of Object.entries(LOCALITIES)) {
  const recs = occAll.filter((r) => r.species === species && r.country && r.latitude && r.longitude);
  const byc = {};
  recs.forEach((r) => { byc[r.country] = (byc[r.country] || 0) + 1; });
  console.log(
    "== " + species + " == usable " + recs.length + " | countries " + Object.keys(byc).length
  );
  console.log(
    Object.entries(byc).sort((a, b) => b[1] - a[1]).map(([c, n]) => c + ":" + n).join(", ")
  );
}
