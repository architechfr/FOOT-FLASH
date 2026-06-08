# Compositions officielles (lineups.json) — mise en place

Affiche les compos réelles (XI de départ + remplaçants + formation + entraîneur) sur la
fiche match de Foot Flash pendant le Mondial. L'app lit un simple fichier
`app/src/main/assets/data/lineups.json` ; une GitHub Action le remplit ~avant chaque match
via API-Football. **La clé API n'est jamais dans l'app** (elle reste un secret du dépôt).

## 1. Obtenir une clé API-Football (gratuit)

1. Crée un compte sur https://www.api-football.com/ (offre gratuite : 100 requêtes/jour).
2. Dans ton dashboard, copie ta clé API (`x-apisports-key`).

> Le plan gratuit suffit largement : le script ne va chercher que les matchs proches
> du coup d'envoi, soit quelques requêtes par jour de match.

## 2. Enregistrer la clé comme secret GitHub

Dans le dépôt **architechfr/FOOT-FLASH** :
`Settings` → `Secrets and variables` → `Actions` → `New repository secret`
- Name : `APIFOOTBALL_KEY`
- Secret : *(colle ta clé)*

## 3. Vérifier l'id de la compétition

Le script suppose `LEAGUE_ID=1` (World Cup chez API-Football) et `SEASON=2026`.
Si l'API utilise un autre id pour le Mondial 2026, change-le dans
`.github/workflows/update-lineups.yml` (variables d'env du job).

Pour le trouver : `GET https://v3.football.api-sports.io/leagues?search=world cup`
(avec l'en-tête `x-apisports-key`).

## 4. Comment ça tourne

- L'Action `update-lineups.yml` s'exécute automatiquement (cron toutes les 15 min,
  14h–23h UTC) **et** à la demande (bouton *Run workflow* dans l'onglet Actions).
- `scripts/fetch-lineups.mjs` :
  1. lit `matches.json` (ids internes + équipes + dates),
  2. récupère les fixtures du Mondial via API-Football,
  3. pour les matchs dans la fenêtre `WINDOW_HOURS` autour du coup d'envoi,
     va chercher la compo et l'écrit dans `lineups.json` (clé = id du match de l'app),
  4. commit le fichier si changement.
- L'app charge `lineups.json` comme les autres données : dès qu'une compo existe, la fiche
  match affiche **« 📋 Compositions officielles »** ; sinon elle garde l'**onze type indicatif**.

## 5. Test manuel (local)

```bash
APIFOOTBALL_KEY=ta_cle node scripts/fetch-lineups.mjs
# pour forcer la récupération de TOUS les matchs connus (hors fenêtre) :
APIFOOTBALL_KEY=ta_cle FORCE_ALL=1 node scripts/fetch-lineups.mjs
```

Puis `git add app/src/main/assets/data/lineups.json && git commit && git push`.

## Notes

- Les matchs à élimination directe ne sont rapprochés que lorsque les équipes sont connues
  (quand `matches.json` a `t1`/`t2` réels, pas `TBD`).
- Le format des joueurs : `{ "n": "Nom", "pos": "G|D|M|F", "num": 10 }`.
- Si l'API renomme une équipe d'une façon non reconnue, ajoute un alias dans
  `TEAM_ALIASES` (dans `scripts/fetch-lineups.mjs`).
