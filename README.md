# FOOtFLASH 2026

Application Android compagnon pour la Coupe du Monde 2026 (USA / Canada / Mexique).
Pronostics, infirmerie, calendrier, simulateur de phase à élimination, mini-jeux rétro.

L'app est une WebView qui charge `app/src/main/assets/index.html`.

---

## 🔄 Mettre à jour les données sans repush l'APK

Les données qui bougent (blessés, shortlist, deadlines) sont externalisées dans
`app/src/main/assets/data/*.json` et publiées via **GitHub Pages**.

L'app, au lancement, tente de récupérer la dernière version en ligne. Si elle n'a
pas de réseau, elle utilise le cache `localStorage`, puis le fichier embarqué
dans l'APK, puis (en dernier recours) les valeurs hardcodées dans `index.html`.

### Pour publier une mise à jour des blessés

```bash
# 1. récupérer la dernière version
git pull

# 2. éditer le fichier
#    → app/src/main/assets/data/blesses.json

# 3. commit + push (= publication immédiate, GitHub Pages publie en ~30s)
git add app/src/main/assets/data/blesses.json
git commit -m "maj blessés : <résumé court>"
git push
```

C'est tout. Toutes les apps installées récupéreront la maj **au prochain lancement**
ou via le bouton **🔄 Rafraîchir** dans l'écran Infirmerie.

### Endpoints publics

| Donnée | URL |
|---|---|
| Blessés | https://architechfr.github.io/FOOtFLASH2026/app/src/main/assets/data/blesses.json |
| Shortlist | https://architechfr.github.io/FOOtFLASH2026/app/src/main/assets/data/shortlist.json |
| Deadlines | https://architechfr.github.io/FOOtFLASH2026/app/src/main/assets/data/deadlines.json |

### Schéma JSON

Chaque fichier suit le format :

```json
{
  "schemaVersion": 1,
  "lastUpdated": "2026-04-29T...Z",
  "data": [ ... ]   // ou objet selon le fichier
}
```

---

## 🛠 Build de l'APK

Depuis Android Studio : **Build → Build Bundle(s) / APK(s) → Build APK(s)**

Ou en ligne de commande :

```bash
./gradlew assembleDebug    # APK debug dans app/build/outputs/apk/debug/
./gradlew assembleRelease  # APK release (nécessite signature)
```

---

## 📂 Structure projet

```
FOOtFLASH2026/
├── app/src/main/
│   ├── AndroidManifest.xml
│   ├── java/com/footflash/app/
│   │   ├── MainActivity.kt          ← WebView, charge index.html
│   │   ├── IntroActivity.kt         ← Splash screen
│   │   └── GameActivity.kt          ← Mini-jeux rétro (autres .html)
│   ├── assets/
│   │   ├── index.html               ← App principale (~12k lignes JS)
│   │   ├── data/                    ← ⚡ Données dynamiques (GitHub Pages)
│   │   │   ├── blesses.json
│   │   │   ├── shortlist.json
│   │   │   └── deadlines.json
│   │   ├── sensible_soccer_mobile.html
│   │   ├── iss_deluxe_mobile.html
│   │   └── fifa98_mobile.html
│   └── res/
└── README.md
```

---

## 🗓 Roadmap

- [x] **v1.080** : Externalisation blessés / shortlist / deadlines vers GitHub Pages
- [ ] **v1.090** : Externalisation effectifs des équipes
- [ ] **v1.100** : Externalisation calendrier des matchs (avec scores live API-Football)
- [ ] **v1.110** : Cotes en temps réel (The Odds API)
- [ ] **v2.000** : Backend Node.js (Vercel) pour agrégation et cache, WebSocket pour le live
