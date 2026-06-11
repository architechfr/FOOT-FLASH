# -*- coding: utf-8 -*-
"""Autocontrôle calendrier : matches.json vs openfootball/worldcup.json.

Compare l'instant UTC de chaque match (heure murale + fuseau du stade) et
l'appariement des équipes. Usage : python scripts/compare-openfootball.py
(le fichier openfootball doit être téléchargé dans %TEMP%/of_wc2026.json)
"""
import json, os, re, sys, urllib.request
from datetime import datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app", "src", "main", "assets", "data", "matches.json")
OF_LOCAL = os.path.join(os.environ.get("TEMP", "/tmp"), "of_wc2026.json")
OF_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json"

NAME2CODE = {
    "Mexico": "MEX", "South Africa": "RSA", "South Korea": "KOR", "Czech Republic": "CZE",
    "Canada": "CAN", "Bosnia and Herzegovina": "BIH", "Bosnia & Herzegovina": "BIH", "Qatar": "QAT", "Switzerland": "SUI",
    "Brazil": "BRA", "Morocco": "MAR", "Haiti": "HAI", "Scotland": "SCO",
    "United States": "USA", "USA": "USA", "Paraguay": "PAR", "Australia": "AUS", "Turkey": "TUR",
    "Germany": "GER", "Curacao": "CUR", "Curaçao": "CUR", "Ivory Coast": "CIV", "Ecuador": "ECU",
    "Netherlands": "NED", "Japan": "JPN", "Sweden": "SWE", "Tunisia": "TUN",
    "Belgium": "BEL", "Egypt": "EGY", "Iran": "IRN", "New Zealand": "NZL",
    "Spain": "ESP", "Cape Verde": "CPV", "Saudi Arabia": "KSA", "Uruguay": "URU",
    "France": "FRA", "Senegal": "SEN", "Iraq": "IRQ", "Norway": "NOR",
    "Argentina": "ARG", "Algeria": "ALG", "Austria": "AUT", "Jordan": "JOR",
    "Portugal": "POR", "DR Congo": "COD", "Congo DR": "COD", "Uzbekistan": "UZB", "Colombia": "COL",
    "England": "ENG", "Croatia": "CRO", "Ghana": "GHA", "Panama": "PAN",
}

# Fuseau (offset été 2026) par ville de l'app — mêmes règles que venueTZ() dans index.html
def app_offset(city):
    c = city or ""
    if any(s in c for s in ("Mexico", "Guadalajara", "Zapopan", "Monterrey", "Guadalupe", "Puebla")):
        return -6
    if any(s in c for s in ("Los Angeles", "Inglewood", "San Francisco", "Santa Clara", "San Diego", "Seattle", "Vancouver")):
        return -7
    if any(s in c for s in ("Dallas", "Arlington", "Houston", "Kansas City", "Chicago", "St. Louis", "San Antonio")):
        return -5
    return -4  # côte Est : NY/East Rutherford, Toronto, Boston/Foxborough, Miami, Philadelphie, Atlanta…

def of_utc(match):
    # date "2026-06-11" + time "13:00 UTC-6" -> datetime UTC
    mt = re.match(r"(\d{2}):(\d{2}) UTC([+-]\d+)", match["time"])
    h, mn, off = int(mt.group(1)), int(mt.group(2)), int(mt.group(3))
    d = datetime.fromisoformat(match["date"])
    return d.replace(hour=h, minute=mn) - timedelta(hours=off)

def app_utc(m):
    d = datetime.fromisoformat(m["d"])
    return d - timedelta(hours=app_offset(m.get("city", "")))

def main():
    if not os.path.exists(OF_LOCAL):
        urllib.request.urlretrieve(OF_URL, OF_LOCAL)
    of = json.load(open(OF_LOCAL, encoding="utf-8"))["matches"]
    app = json.load(open(APP, encoding="utf-8"))["data"]

    # Groupes : appariement par paire d'équipes
    app_by_pair = {}
    for m in app:
        if m["t1"] != "TBD" and m["t2"] != "TBD":
            app_by_pair[frozenset((m["t1"], m["t2"]))] = m

    issues, ok = [], 0
    of_group = [x for x in of if "group" in x]
    of_ko = [x for x in of if "group" not in x]

    for x in of_group:
        c1, c2 = NAME2CODE.get(x["team1"]), NAME2CODE.get(x["team2"])
        if not c1 or not c2:
            issues.append(("MAPPING", f"openfootball: {x['team1']} / {x['team2']} sans code"))
            continue
        m = app_by_pair.get(frozenset((c1, c2)))
        if not m:
            issues.append(("ABSENT", f"{c1}-{c2} ({x['date']}) absent de matches.json"))
            continue
        u_of, u_app = of_utc(x), app_utc(m)
        if u_of != u_app:
            issues.append(("HORAIRE", f"id {m['id']} {m['t1']}-{m['t2']} : app={m['d']} {m['city']} (UTC {u_app:%d/%m %H:%M}) | openfootball={x['date']} {x['time']} {x['ground']} (UTC {u_of:%d/%m %H:%M})"))
        else:
            ok += 1
        # ordre des équipes (t1 = domicile/affiche)
        if (m["t1"], m["t2"]) != (c1, c2) and u_of == u_app:
            issues.append(("ORDRE", f"id {m['id']} : app={m['t1']}-{m['t2']} vs openfootball={c1}-{c2}"))

    # Élimination directe : appariement par instant UTC (équipes = TBD)
    app_ko = [m for m in app if m["t1"] == "TBD" or m["t2"] == "TBD"]
    app_ko_by_utc = {}
    for m in app_ko:
        app_ko_by_utc.setdefault(app_utc(m), []).append(m)
    for x in of_ko:
        u = of_utc(x)
        if u in app_ko_by_utc and app_ko_by_utc[u]:
            app_ko_by_utc[u].pop()
            ok += 1
        else:
            issues.append(("KO?", f"openfootball {x['round']} {x['date']} {x['time']} {x.get('ground','')} (UTC {u:%d/%m %H:%M}) sans équivalent exact"))
    restants = [m for lst in app_ko_by_utc.values() for m in lst]
    for m in restants:
        issues.append(("KO-APP", f"id {m['id']} {m['st']} app={m['d']} {m['city']} (UTC {app_utc(m):%d/%m %H:%M}) sans équivalent openfootball"))

    print(f"✅ {ok} matchs concordants / {len(of)} openfootball")
    print(f"⚠️ {len(issues)} divergence(s) :")
    for tag, msg in issues:
        print(f"  [{tag}] {msg}")

if __name__ == "__main__":
    main()
