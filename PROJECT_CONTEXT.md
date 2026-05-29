# FOOtFLASH 2026 — Contexte projet (état au 30 mai 2026, J-12 du Mondial)

> Document destiné aux **nouvelles sessions Claude** pour reprendre instantanément. À uploader dans le projet Claude.

---

## 1. Vue d'ensemble

**Quoi** : App Android compagnon de la **Coupe du Monde 2026** (USA/Canada/Mexique, 11 juin → 19 juillet 2026).
**Auteur** : Florian (`archi.tech.fr@gmail.com`, pseudo GitHub `architechfr`).
**Sponsor affiché** : Cadence Architectes Associés.
**Promotion croisée** : Coach du Dimanche (autre app du même auteur).
**Repo GitHub** : https://github.com/architechfr/FOOT-FLASH (⚠️ nom du repo = `FOOT-FLASH`, pas `FOOtFLASH2026`)
**App online (webapp)** : https://architechfr.github.io/FOOT-FLASH/app/src/main/assets/index.html
**Dossier local** : `C:\Users\fclar\AndroidStudioProjects\FOOtFLASH2026\` (nom local différent du nom GitHub)

## 2. Architecture technique

- **App Android Kotlin** mais 99% du code est dans un **gros `index.html` (~13 000 lignes)** chargé dans une **WebView**.
- 3 activités Kotlin : `IntroActivity` (splash), `MainActivity` (WebView principale), `GameActivity` (mini-jeux rétro).
- **Bridge JS → Java** : `AndroidBridge.openExternal(url)` ouvre le navigateur natif (mailto, liens web).
- **Données dynamiques externalisées en JSON** dans `app/src/main/assets/data/` :
  - `blesses.json` (15 cas, infirmerie)
  - `shortlist.json` (réservistes potentiels par équipe)
  - `deadlines.json` (dates clés FIFA)
  - `effectifs.json` (48 équipes, 1065 joueurs)
  - `matches.json` (104 matchs FIFA officiels)
- **Loader async en cascade** dans index.html :
  1. Fetch URL distante (GitHub Pages) avec timeout 3s
  2. Si KO → cache `localStorage`
  3. Si KO → fichier embarqué dans APK
  4. Si KO → garde les valeurs hardcodées dans index.html (fallback ultime)
- **URL GitHub Pages des JSON** : `https://architechfr.github.io/FOOT-FLASH/app/src/main/assets/data/<fichier>.json`

## 3. Structure de fichiers

```
FOOtFLASH2026/                               (= repo "FOOT-FLASH" sur GitHub)
├── .git/                                    (⚠️ corruption OneDrive possible)
├── .gitignore                               (Android Studio + exclusions APK/keystores)
├── README.md
├── PROJECT_CONTEXT.md                       ← CE FICHIER
├── AndroidManifest.xml configuré : lock portrait sur IntroActivity et MainActivity
├── build.gradle.kts, settings.gradle.kts, gradlew, gradle/
└── app/src/main/
    ├── AndroidManifest.xml
    ├── java/com/footflash/app/
    │   ├── MainActivity.kt                  ← WebView, charge index.html
    │   ├── IntroActivity.kt                 ← Splash 3s
    │   └── GameActivity.kt                  ← Mini-jeux rétro (à cacher pour droits)
    └── assets/
        ├── index.html                       ← App entière (~13 000 lignes JS dans <script>)
        ├── data/
        │   ├── blesses.json                 (15 entrées infirmerie)
        │   ├── shortlist.json               (réservistes potentiels)
        │   ├── deadlines.json               (4 dates FIFA)
        │   ├── effectifs.json               (48 équipes, 1065 joueurs)
        │   └── matches.json                 (104 matchs officiels FIFA)
        ├── fifa98_mobile.html               (émulateur — droits d'auteur à cacher)
        ├── iss_deluxe_mobile.html           (idem)
        └── sensible_soccer_mobile.html      (idem)
```

## 4. Conventions de données

### `effectifs.json` — TEAMS

Chaque équipe :
```json
{
  "id": "FRA",
  "name": "France",
  "flag": "🇫🇷",
  "group": "I",
  "rank": 1,
  "titles": "2 (1998, 2018)",
  "coach": "Didier Deschamps",
  "captain": "Kylian Mbappé",
  "players": [
    {"n": "Kylian Mbappé", "p": "ATT", "club": "Real Madrid", "caps": 95, "g": 51, "cap": true},
    ...
  ]
}
```

Position joueur (`p`) : `GAR` (gardien) / `DEF` / `MIL` / `ATT`.
Champs optionnels : `cap: true` (capitaine), `wc: N` (nombre de mondiaux disputés).

### `matches.json` — MATCHES

```json
{
  "id": 1,
  "d": "2026-06-11T12:00",      ← heure LOCALE du stade
  "t1": "MEX",
  "t2": "RSA",
  "st": "Groupe A",              ← ou "16e de finale", "8e", "Quart", "Demi", "3e place", "FINALE"
  "stad": "Estadio Banorte",
  "city": "Mexico City",
  "s1": null,                    ← score (à remplir post-match)
  "s2": null,
  "t1from": "Winner Group A",    ← OPTIONNEL, sur matchs KO seulement, décrit la provenance
  "t2from": "3rd C/D/F/G/H"
}
```

Codes équipes (48 au total) : MEX, KOR, RSA, CZE, CAN, BIH, QAT, SUI, BRA, MAR, HAI, SCO, USA, PAR, AUS, TUR, GER, CIV, ECU, CUR, NED, JPN, SWE, TUN, BEL, IRN, NZL, EGY, ESP, URU, KSA, CPV, FRA, NOR, SEN, IRQ, ARG, AUT, JOR, ALG, POR, UZB, COL, COD, CRO, ENG, GHA, PAN.

### `blesses.json` — INJURIES

```json
{
  "id": "inj-007",
  "playerName": "Federico Valverde",
  "teamId": "URU",
  "club": "Real Madrid",
  "position": "MIL",
  "status": "return",                  ← "out" | "doubt" | "return"
  "injury": "Lumbosciatique (...)",
  "date": "2026-05-25",
  "participationChance": 80,           ← 0-100
  "typicalRecovery": "2 à 3 semaines",
  "estimatedReturn": "2026-06-11",
  "note": "...",
  "source": "...",
  "timeline": [{"date": "...", "icon": "🚑", "event": "...", "detail": "..."}],
  "replacements": [{"n": "...", "club": "...", "note": "..."}]
}
```

## 5. État au 30 mai 2026 (J-12)

| Module | État |
|---|---|
| 🗓️ **Calendrier officiel FIFA** | ✅ 104 matchs corrects (Wikipedia + Sky Sports), externalisé |
| 👥 **Effectifs officiels** | **16 / 48** : FRA, ENG, POR, ESP, GER, NED, BEL, BRA, ARG, USA, CAN, MEX, JPN, CRO, SEN, KOR |
| 🏥 **Infirmerie** | ✅ 15 cas à jour (Mbappé sélectionné 97%, Saliba 92%, Koundé 95%, Koné 96%, Valverde lumbosciatique 25/05 80%, etc.) |
| 🏟️ **Stades / villes** | ✅ Vrais (MetLife, Banorte = ex-Azteca renommé, SoFi, etc.) |
| 🌐 **Loader async + GitHub Pages** | ✅ Fonctionnel, badge en haut Infirmerie indique online/cache/embedded |
| 🌍 **Traduction news multilingue** | ✅ MyMemory API gratuite, cache localStorage |
| 🧪 **Mode QA simulation** | ✅ Long-press 1.5s sur "🎲 Simulation auto" + 4 boutons (simuler/stress test/reset/voir crashes) |
| 📱 **Lock portrait** | ✅ AndroidManifest |
| 💼 **Sponsor footer** | ✅ Cadence Architectes Associés + mailto contact freelance |
| 🔄 **Cross-promo Coach du Dimanche** | ✅ Carte violette en haut des Réglages |
| 🚫 **Crash logger** | ✅ Window.onerror + unhandledrejection avec filtres bruits bénins |
| 🗓️ **Vue calendrier mensuel** | ✅ Onglet Matchs → 🗓️ Calendrier, grille juin + juillet avec pastilles |

**Pour les 32 équipes restantes** : MAR, URU, NOR, SUI, COL, IRN, EGY, AUS, CIV, TUN, ALG, GHA, SCO, AUT, SWE, CZE, ECU, PAR, NZL, KSA, IRQ, JOR, UZB, COD, HAI, RSA, CPV, BIH, TUR, CUR, PAN, QAT.

## 6. Pièges connus (CRITIQUE)

### ⚠️ OneDrive corrompt le `.git/`
Si `AndroidStudioProjects` est dans OneDrive, OneDrive sape `branches/`, `hooks/`, `info/`, `refs/` (les passe à 0 bytes) → `git status` retourne `fatal: not a git repository`.
**Solution** : sortir le projet de OneDrive, ou clic droit dossier `.git/` → **"Always keep on this device"** dans le menu OneDrive.

### ⚠️ Android Studio tronque `index.html` en cours d'édition
Si `index.html` est ouvert dans un onglet AS pendant qu'un agent le modifie, AS peut sauvegarder sa version périmée en concurrence → fichier tronqué à mi-fonction.
**Solution** : **fermer l'onglet `index.html` dans AS** avant chaque session avec Claude. À chaque fin de session, vérifier que le fichier finit bien par `</script></body></html>`.

### ⚠️ Le repo GitHub s'appelle `FOOT-FLASH` (pas `FOOtFLASH2026`)
Le dossier local s'appelle `FOOtFLASH2026` mais le repo distant `FOOT-FLASH`. Toutes les URLs Pages doivent utiliser `FOOT-FLASH`. La constante `DATA_REMOTE_BASE` dans `index.html` doit pointer vers `https://architechfr.github.io/FOOT-FLASH/...`.

### ⚠️ Git Bash interprète `\` comme caractère d'échappement
`cd C:\Users\fclar\...` → bash supprime les `\` → "No such file or directory". Utiliser `cd /c/Users/fclar/...` ou `cd ~/...`.

### ⚠️ AndroidBridge dispo en APK uniquement, pas en webapp
Les fonctions `ffOpenAuthorApp()`, `ffOpenAuthorContact()` ouvrent `AndroidBridge.openExternal(url)` en mode APK, fallback `window.open()` en mode web.

## 7. Workflow git pour publier une modif

Depuis Git Bash, à la racine du projet :

```bash
cd ~/AndroidStudioProjects/FOOtFLASH2026
git add .
git status            # vérifier la liste
git commit -m "vX.YYY - description courte"
git push
```

GitHub Pages republie en ~30s-2min. L'app récupère automatiquement la nouvelle version au prochain lancement (ou via bouton 🔄 dans écran Infirmerie).

## 8. Backlog priorisé

### 🔴 Critique avant le Mondial (J-12)
- **#41** Sous countdown accueil : afficher **MEX vs RSA · 11/06 12h · Banorte** (5 min)
- **#42** Clic "Prochain match" → fiche complète + évolutif (30 min)
- **#45** Live sync résultats / classements / bracket pendant CDM — API ou GitHub Actions cron
- **#44** Mode d'emploi distribution Android (APK side-load) + PWA iPhone

### 🟠 Important
- **#37** Cacher émulateurs (FIFA 98, Sensible Soccer, ISS Deluxe — droits d'auteur)
- **#38** Quiz : 2 modes (chrono / sans chrono) + voir bonne réponse en cas d'échec (demande des enfants de Florian)
- **#39** Quiz : audit indices cachés ("Griezmann sur penalty" parmi 4 noms simples = trop évident)
- **#40** Quiz : MAJ joueurs selon listes officielles 26

### 🟡 Contenu à compléter
- **#27** 32 équipes restantes (par paquets de 8 = 4 sessions ~45 min chacune)
- **#23** Refonte shortlist post listes officielles (retirer joueurs sélectionnés, garder seulement vraies réserves)
- **#43** Recalcul probabilités victoire selon listes officielles

### 🟢 Plus tard
- Refonte graphique (Florian a dit "graphiquement pas très belle")
- Header "Made with par Florian" déjà fait
- PWA install screen
- Notifications locales (déjà annoncé "prochainement" dans Réglages)

## 9. Demandes spécifiques de Florian (déjà notées)

- **Pas parler de repos** à Florian (il gère son rythme)
- **Toujours afficher les commandes git en bloc copiable** (Bash, dans Git Bash)
- **Avant tout `git push`, rappeler de fermer index.html dans AS** pour éviter troncature
- **Distribution** : Florian veut une version pour Android + iPhone à partager à ses proches, et l'app sert de **vitrine freelance** (mailto contact dans footer)
- **Cohérence de A à Z avant CDM** : résultats, classements, bracket doivent tous se mettre à jour pendant le tournoi

## 10. Stack & dépendances

- **Android** : Kotlin (3 activités), WebView, AndroidManifest avec permission INTERNET + ACCESS_NETWORK_STATE
- **WebView** : DOM storage activé (localStorage marche), `usesCleartextTraffic=true` (HTTPS quand même)
- **APIs externes utilisées** : MyMemory Translation (gratuit), rss2json (proxy CORS pour 30 flux RSS)
- **Pas de framework JS** : tout en vanilla JS dans un seul `<script>` (anti-pattern mais marche)
- **Pas de build step JS** : `index.html` est le source unique

## 11. Versionnage

- Version dans `APP_VERSION` (variable JS dans index.html)
- Dernière version au 30/05/2026 : **v1.088**
- Historique des versions visible via bouton "Changelog" dans le footer

## 12. À demander à Florian au prochain chat

- A-t-il poussé les dernières modifs sur GitHub ?
- Le projet est-il sorti de OneDrive ?
- Quel chantier en priorité ?

---

**Dernière mise à jour** : 30 mai 2026, 02h00 UTC
**Mainteneur** : Florian (`archi.tech.fr@gmail.com`)
