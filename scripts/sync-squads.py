# -*- coding: utf-8 -*-
"""Synchronise effectifs.json sur les listes officielles FIFA (openfootball worldcup.squads.json).

Pour chaque équipe : la liste devient EXACTEMENT les 26 officiels (ordre FIFA,
numéro de maillot ajouté). Les joueurs déjà présents dans l'app conservent leurs
données (club, caps, buts, wc, capitaine…) via correspondance de noms tolérante.
Les nouveaux entrent avec club "—" et compteurs à 0. Le nom officiel FIFA fait foi.

Usage : python scripts/sync-squads.py
"""
import json, os, unicodedata, urllib.request
from difflib import SequenceMatcher

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app", "src", "main", "assets", "data", "effectifs.json")
OF_LOCAL = os.path.join(os.environ.get("TEMP", "/tmp"), "of_squads_raw.json")
OF_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.squads.json"

FIFA2APP = {"CUW": "CUR"}
POS = {"GK": "GAR", "DF": "DEF", "MF": "MIL", "FW": "ATT"}

def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join("".join(ch if ch.isalnum() or ch == " " else " " for ch in s.lower()).split())

def name_match(a, b):
    na, nb = norm(a), norm(b)
    if na == nb: return 1.0
    ta, tb = set(na.split()), set(nb.split())
    if ta and tb and (ta <= tb or tb <= ta): return 0.95
    if sorted(na.split()) == sorted(nb.split()): return 0.95
    return SequenceMatcher(None, na, nb).ratio()

def main():
    if not os.path.exists(OF_LOCAL):
        urllib.request.urlretrieve(OF_URL, OF_LOCAL)
    fifa = json.load(open(OF_LOCAL, encoding="utf-8"))
    doc = json.load(open(APP, encoding="utf-8"))
    app_by_id = {t["id"]: t for t in doc["data"]}

    kept, created, removed = 0, 0, 0
    for sq in fifa:
        code = FIFA2APP.get(sq["fifa_code"], sq["fifa_code"])
        t = app_by_id.get(code)
        if not t:
            print(f"⚠️ {code} absent de effectifs.json — ignoré"); continue
        old = t.get("players", [])
        used = set()
        new_players = []
        for fp in sq["players"]:
            best, best_i = 0.0, None
            for i, ap in enumerate(old):
                if i in used: continue
                r = name_match(fp["name"], ap.get("n", ""))
                if r > best: best, best_i = r, i
            if best >= 0.75:
                used.add(best_i)
                p = dict(old[best_i])          # conserve club/caps/g/wc/cap…
                p["n"] = fp["name"]            # nom officiel FIFA
                p["p"] = POS.get(fp["pos"], p.get("p", "MIL"))
                p["num"] = fp.get("number")
                kept += 1
            else:
                p = {"n": fp["name"], "p": POS.get(fp["pos"], "MIL"),
                     "num": fp.get("number"), "club": "—", "caps": 0, "g": 0}
                created += 1
            new_players.append(p)
        removed += len(old) - len(used)
        t["players"] = new_players
        # capitaine : si le champ équipe ne pointe plus sur personne, on garde le champ
        # mais on pose le flag cap sur le joueur correspondant s'il existe.
        capname = t.get("captain", "")
        if capname:
            for p in new_players:
                if name_match(capname, p["n"]) >= 0.75:
                    p["cap"] = True
                    break

    doc["lastUpdated"] = "2026-06-11T21:30:00Z"
    doc["source"] = "Listes officielles FIFA (openfootball worldcup.squads.json, 10/06/2026) fusionnées avec les données app"
    with open(APP, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print(f"✅ Sync terminé : {kept} joueurs conservés (données app), {created} ajoutés (officiels FIFA), {removed} retirés (hors liste)")
    total = sum(len(t.get("players", [])) for t in doc["data"])
    print(f"Total joueurs : {total} · équipes : {len(doc['data'])}")

if __name__ == "__main__":
    main()
