# -*- coding: utf-8 -*-
"""Autocontrôle effectifs : effectifs.json (app) vs worldcup.squads.json (FIFA officiel, openfootball).

Compare les 48 équipes joueur par joueur (noms normalisés, tolérance accents /
ordre des mots / diminutifs via similarité). Signale : joueurs FIFA absents de
l'app, joueurs app absents de la liste FIFA, écarts d'effectif.

Usage : python scripts/compare-squads.py [--csv rapport.csv]
"""
import json, os, sys, unicodedata, urllib.request
from difflib import SequenceMatcher

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app", "src", "main", "assets", "data", "effectifs.json")
OF_LOCAL = os.path.join(os.environ.get("TEMP", "/tmp"), "of_squads_raw.json")
OF_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.squads.json"

# Codes FIFA → codes app quand ils diffèrent
FIFA2APP = {"CUW": "CUR"}

def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join("".join(ch if ch.isalnum() or ch == " " else " " for ch in s.lower()).split())

def name_match(a, b):
    na, nb = norm(a), norm(b)
    if na == nb: return 1.0
    ta, tb = set(na.split()), set(nb.split())
    if ta and tb and (ta <= tb or tb <= ta): return 0.95          # "Doku" ⊂ "Jeremy Doku"
    if sorted(na.split()) == sorted(nb.split()): return 0.95      # ordre inversé (Corée…)
    return SequenceMatcher(None, na, nb).ratio()

def main():
    if not os.path.exists(OF_LOCAL):
        urllib.request.urlretrieve(OF_URL, OF_LOCAL)
    fifa = json.load(open(OF_LOCAL, encoding="utf-8"))
    app = json.load(open(APP, encoding="utf-8"))["data"]
    app_by_id = {t["id"]: t for t in app}

    tot_ok, tot_missing, tot_extra = 0, 0, 0
    report = []
    for sq in fifa:
        code = FIFA2APP.get(sq["fifa_code"], sq["fifa_code"])
        t = app_by_id.get(code)
        if not t:
            report.append((code, "ÉQUIPE ABSENTE de effectifs.json", ""))
            continue
        fifa_players = [p["name"] for p in sq["players"]]
        app_players = [p["n"] for p in t.get("players", [])]
        used = set()
        missing = []
        for fp in fifa_players:
            best, best_i = 0.0, None
            for i, ap in enumerate(app_players):
                if i in used: continue
                r = name_match(fp, ap)
                if r > best: best, best_i = r, i
            if best >= 0.75:
                used.add(best_i); tot_ok += 1
            else:
                missing.append(fp)
        extra = [ap for i, ap in enumerate(app_players) if i not in used]
        tot_missing += len(missing); tot_extra += len(extra)
        if missing or extra or len(app_players) != len(fifa_players):
            report.append((code,
                "manquants(app): " + ("; ".join(missing) if missing else "-"),
                "en trop(app): " + ("; ".join(extra) if extra else "-")
                + f"  [app {len(app_players)} / FIFA {len(fifa_players)}]"))

    print(f"✅ {tot_ok} joueurs concordants sur {sum(len(s['players']) for s in fifa)} (48 équipes FIFA)")
    print(f"⚠️ {tot_missing} joueurs FIFA introuvables dans l'app · {tot_extra} joueurs app hors liste FIFA")
    print()
    for code, a, b in report:
        print(f"── {code}")
        print(f"   {a}")
        if b: print(f"   {b}")

if __name__ == "__main__":
    main()
