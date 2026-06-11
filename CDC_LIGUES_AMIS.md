# Cahier des charges — Ligues entre amis (Foot Flash 2026)

**Version** : 1.0 · 7 juin 2026
**Auteur** : Florian + Claude
**Objectif** : classement collectif de pronostics entre amis, synchronisé via Supabase, intégré à l'app existante (HTML mono-fichier, vanilla JS, GitHub Pages + APK WebView).

---

## 1. Vision

Chaque utilisateur joue ses pronos comme aujourd'hui (local), mais peut **créer ou rejoindre une ligue privée** avec un code à 6 caractères. Ses pronos sont publiés sur Supabase, **verrouillés côté serveur au coup d'envoi**, et le classement de la ligue se met à jour quand les résultats officiels tombent. Périmètre retenu : **version complète** (pronos + boosts + classement live + historique par phase), import des pronos locaux déjà saisis, sortie possible en cours de tournoi.

Décisions actées :
- **Connexion "les deux"** : pseudo + code ligue pour démarrer (auth anonyme Supabase), rattachement email facultatif ensuite pour sécuriser/récupérer le compte.
- **Résultats officiels saisis par Florian** via le mode admin existant, poussés vers Supabase.
- **Scoring identique au local** : score exact = 3 pts, bon résultat (1/N/2) = 1 pt, sinon 0 — multiplié par le boost ⚡ (×1/×2/×3/×5). Source de vérité : `computePredictionScore()` reproduite côté serveur.

---

## 2. Architecture

```
┌─────────────────────────────┐
│  index.html (existant)      │
│  V.pronos / V.boosts (local)│
│  + module ffLeague (~600 l.)│
└──────────┬──────────────────┘
           │ supabase-js v2 (CDN, +~50 Ko)
           ▼
┌─────────────────────────────┐
│  Supabase (tier gratuit)    │
│  - Auth (anonyme + email)   │
│  - Postgres + RLS           │
│  - fonction SQL de scoring  │
│  - Realtime (classement)    │
└─────────────────────────────┘
```

Principes :
- L'app reste **100 % fonctionnelle hors connexion** (mode local actuel inchangé). La ligue est une couche optionnelle.
- **Aucun calcul de points côté client** pour le classement : le serveur calcule à partir des résultats officiels (anti-triche).
- Le **verrouillage au coup d'envoi est garanti par RLS** (horloge serveur), pas par le JS.
- Clé `anon` Supabase embarquée dans le HTML : normal et prévu, la sécurité repose sur les policies RLS.

---

## 3. Modèle de données (SQL)

```sql
-- Matchs : miroir minimal des 104 matchs de MATCHES (même id !)
create table matches (
  id        int primary key,          -- = m.id de l'app
  kickoff   timestamptz not null,     -- = m.d converti en UTC
  stage     text,                     -- "Groupe A", "16es", ...
  team1     text, team2 text,
  score1    int, score2 int,          -- null tant que pas joué
  scored_at timestamptz               -- quand l'admin a saisi
);

create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  pseudo     text not null check (char_length(pseudo) between 2 and 20),
  created_at timestamptz default now()
);

create table leagues (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) <= 30),
  code       text unique not null,    -- 6 car. A-Z0-9, généré serveur
  owner      uuid references profiles(id),
  created_at timestamptz default now()
);

create table league_members (
  league_id uuid references leagues(id) on delete cascade,
  user_id   uuid references profiles(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (league_id, user_id)
);

create table predictions (
  user_id   uuid references profiles(id) on delete cascade,
  match_id  int references matches(id),
  score1    int not null check (score1 between 0 and 20),
  score2    int not null check (score2 between 0 and 20),
  boost     int not null default 1 check (boost in (1,2,3,5)),
  updated_at timestamptz default now(),
  primary key (user_id, match_id)
);
-- NB : un prono est global au joueur (pas par ligue) — même logique que l'app.
```

### Policies RLS (le cœur anti-triche)

```sql
alter table predictions enable row level security;

-- Lire : ses propres pronos toujours ; ceux des autres membres de sa ligue
-- UNIQUEMENT après le coup d'envoi (pas d'espionnage avant match)
create policy pred_select on predictions for select using (
  user_id = auth.uid()
  or exists (
    select 1 from league_members me
    join league_members them on them.league_id = me.league_id
    join matches m on m.id = predictions.match_id
    where me.user_id = auth.uid()
      and them.user_id = predictions.user_id
      and now() >= m.kickoff
  )
);

-- Écrire/modifier : uniquement ses pronos, uniquement AVANT le coup d'envoi
create policy pred_upsert on predictions for insert with check (
  user_id = auth.uid()
  and now() < (select kickoff from matches where id = match_id)
);
create policy pred_update on predictions for update using (
  user_id = auth.uid()
  and now() < (select kickoff from matches where id = match_id)
);

-- matches : lecture publique, écriture réservée au rôle service/admin
-- leagues/league_members : lecture pour les membres, insert via RPC join_league(code)
```

### Scoring serveur (vue SQL)

```sql
create view league_standings as
select lm.league_id, p.user_id, pr.pseudo,
  sum(case
    when m.score1 is null then 0
    when p.score1 = m.score1 and p.score2 = m.score2 then 3 * p.boost
    when sign(p.score1 - p.score2) = sign(m.score1 - m.score2) then 1 * p.boost
    else 0 end) as points,
  count(*) filter (where m.score1 is not null) as played,
  count(*) filter (where p.score1 = m.score1 and p.score2 = m.score2) as exacts
from league_members lm
join predictions p using (user_id)
join profiles pr on pr.id = p.user_id
join matches m on m.id = p.match_id
group by lm.league_id, p.user_id, pr.pseudo;
```

---

## 4. Fonctionnalités (MoSCoW)

**MUST**
- M1. Créer une ligue (nom → code 6 car. partageable, lien `?ligue=CODE` + QR).
- M2. Rejoindre : pseudo + code (auth anonyme transparente, RPC `join_league`).
- M3. Publier ses pronos : sync `V.pronos` + `V.boosts` → `predictions` (upsert en lot ; les matchs déjà commencés sont silencieusement refusés par RLS).
- M4. Import initial des pronos locaux existants au premier login (72 pronos de groupes déjà saisis).
- M5. Verrouillage serveur au coup d'envoi + reflet UI (cadenas sur les cartes).
- M6. Classement de ligue : points, matchs comptés, nb de scores exacts (tri points desc, exacts desc).
- M7. Admin : bouton "Pousser les résultats" dans le mode admin → upsert `matches.score1/2` (clé service via RPC sécurisée par code admin, ou directement depuis le dashboard Supabase au début).
- M8. Pronos des autres visibles seulement après kickoff (RLS) — écran "Pronos de la ligue" par match.

**SHOULD**
- S1. Rattacher un email (linkIdentity Supabase) pour récupérer son compte sur un autre appareil.
- S2. Classement par phase (Journée 1/2/3, 16es, ...) — la vue SQL filtrée par `stage`.
- S3. Realtime : badge "classement mis à jour" via subscription Supabase sur `matches`.
- S4. Multi-ligues par joueur (le modèle le permet déjà).

**COULD**
- C1. Badge "champion de la journée", historique d'évolution du rang.
- C2. Partage WhatsApp du classement (image ou texte).
- C3. Intégration TheSportsDB pour pré-remplir les scores (l'admin valide).
- C4. Classement quiz dans la ligue.

**WON'T (v1)**
- Chat de ligue, avatars, notifications push, paris crédits synchronisés (les crédits restent locaux).

---

## 5. Écrans (wireframes textuels)

Nouvel onglet ou section dans **Pronos** : carte "🏆 Ligue entre amis".

```
[Pas connecté]
┌──────────────────────────────┐
│ 🏆 LIGUE ENTRE AMIS          │
│ Défie tes potes sur le        │
│ Mondial !                     │
│ [➕ Créer une ligue]          │
│ [🔑 Rejoindre avec un code]   │
└──────────────────────────────┘

[Rejoindre]
Pseudo: [________]  Code: [______]
[🚀 C'est parti]

[Vue ligue]
┌──────────────────────────────┐
│ Ligue "Les Cadors" · ABC123 📋│
│ 1. 🥇 Flo      234 pts · 12 ✓ │
│ 2. 🥈 Max      198 pts ·  9 ✓ │
│ 3. 🥉 Léa      187 pts · 10 ✓ │
│ ...                           │
│ [Journée 1 ▾] [📤 Publier mes │
│  pronos (3 non publiés)]      │
└──────────────────────────────┘

[Détail match après kickoff]
France 2-0 Sénégal (réel 2-1)
  Flo 2-1 ×2 → +6 · Max 1-1 → 0 ...
```

---

## 6. Intégration au code existant

| Existant | Usage |
|---|---|
| `V.pronos[matchId] = {a,b}` | source de la publication (M3/M4) |
| `V.boosts[matchId]` | publié avec le prono ; verrou `isBoostLocked` déjà aligné kickoff |
| `MATCHES[].id / .d / .st` | seed de la table `matches` (script de génération une fois) |
| `computePredictionScore()` | référence du scoring (3/1/0) — dupliqué dans la vue SQL |
| Mode admin (`V.isAdmin`) | point d'entrée M7 "Pousser les résultats" |
| `localStorage ff26_league_*` | cache session (user id, league codes, dernier sync) |

Point d'attention : `m.d` est en heure locale d'affichage (`fmtTime` avec `tz`) — vérifier le format exact stocké dans `MATCHES` et convertir proprement en UTC lors du seed (piège n°1 du projet).

---

## 7. Planning (sprints courts — le Mondial a commencé le 11)

**Sprint 1 (1-2 jours) — fondations**
1. Projet Supabase + tables + RLS + vue standings (2 h)
2. Script de seed `matches` depuis MATCHES (1 h)
3. Module ffLeague : auth anonyme, créer/rejoindre, UI carte ligue (3 h)
4. Publication des pronos + import initial (2 h)
5. Classement simple (2 h)
→ **Livrable : ligue jouable dès la Journée 1 ou 2**

**Sprint 2 (1-2 jours) — confort**
6. Bouton admin "Pousser les résultats" (1 h 30)
7. Pronos des autres après kickoff (1 h 30)
8. Classement par phase + realtime (2 h)
9. Rattachement email (1 h 30)
10. QA croisée 2 téléphones + polish (2 h)

**Estimation totale : ~18 h** réparties sur 3-4 jours.

---

## 8. Points de vigilance

1. **Fuseaux horaires** : tout en UTC dans `matches.kickoff`. Tester avec un match dans 5 min créé à la main.
2. **Migration des pronos locaux** : ne publier que les matchs non commencés ; informer l'utilisateur de ce qui a été accepté/refusé.
3. **Pseudo non unique globalement** : unicité seulement par ligue (contrainte à ajouter si besoin) ; pas de données sensibles.
4. **Auth anonyme** : si l'utilisateur vide le cache sans avoir lié d'email, le compte est perdu — message d'avertissement + inciter au S1.
5. **Limites tier gratuit Supabase** : largement suffisant (<500 Mo, 50k MAU) pour des ligues entre amis.
6. **Triche par seconde requête** : impossible par construction (RLS kickoff) ; ne jamais ajouter de policy "update admin" générique.
7. **Boost après kickoff** : le boost fait partie de `predictions`, donc verrouillé par la même policy — cohérent avec `isBoostLocked` côté UI.
8. **Édition des résultats** : en cas d'erreur de saisie admin, corriger `matches` recalcule tout automatiquement (la vue est dérivée — aucun point stocké).

---

## 9. Critères d'acceptation v1

- [ ] Deux téléphones, deux pseudos, même code → les deux apparaissent au classement.
- [ ] Modifier un prono avant kickoff : OK ; après kickoff : refus serveur + cadenas UI.
- [ ] Je ne vois pas les pronos d'un ami avant le coup d'envoi, je les vois après.
- [ ] Admin saisit 2-1 → les points (avec boost) apparaissent chez tous sans recharger l'app (ou au pire après reload).
- [ ] L'app reste utilisable sans connexion / sans ligue, zéro régression sur le mode local.
