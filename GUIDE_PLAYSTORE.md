# Foot Flash 2026 — Guide de publication Google Play + fiche store

> Préparé le 31 mai 2026. Infos Google Play vérifiées à cette date (voir sources en fin de doc).
> ⚠️ Je ne suis pas juriste : la partie « droits » est informative, pas un avis juridique.

---

## 1. Web + Google Play : aucune incompatibilité

Les deux versions sont **complémentaires**, et c'est même la bonne stratégie :

- **iPhone / iPad** → version web (PWA), « Ajouter à l'écran d'accueil ». Zéro abonnement Apple à 99 €/an.
- **Android** → Google Play (meilleure visibilité, notifications, mise à jour auto, vraie icône).
- C'est **le même `index.html`** dans les deux cas, donc une seule base de code à maintenir.

### Points d'attention côté Play
- **App en WebView** : Google refuse les apps « coquille vide » qui ne sont qu'un site web. La tienne a de vraies fonctions hors-ligne (pronostics, quiz, données embarquées, simulateur) → OK, mais **la fiche doit mettre en avant ces fonctions**, pas « c'est mon site ».
- **Politique de confidentialité obligatoire** (URL) : l'app utilise des flux RSS, une API de traduction et un générateur de QR. Texte prêt en §5.
- **Formulaire « Sécurité des données »** à remplir (aucune donnée envoyée au développeur → simple).
- **Niveau d'API cible** : nouvelles apps doivent viser **API 35 (Android 15)** aujourd'hui ; **API 36 (Android 16) à partir du 31 août 2026**.

---

## 2. Compte développeur : Personnel ou Organisation ?

Frais : **25 $ une seule fois** (à vie, contrairement à Apple).

| | Compte **Personnel** | Compte **Organisation** |
|---|---|---|
| Vérification | Pièce d'identité | N° **D-U-N-S** (gratuit, ~quelques jours) |
| Test obligatoire avant publication | **Oui : 12 testeurs pendant 14 jours consécutifs** (comptes créés après le 13/11/2023) | **Exempté** |
| Nom affiché | Ton nom | Cadence Architectes |

➡️ **Recommandation** : comme tu as une société (Cadence), un **compte Organisation** t'évite la contrainte des 12 testeurs / 14 jours et est plus pro. Il faut juste obtenir un D-U-N-S pour l'entreprise. Sinon, compte personnel = il faut réunir 12 testeurs (amis/collègues) qui gardent l'app en test 14 jours.

---

## 3. Étapes de publication (ordre conseillé)

1. **Créer le compte** Play Console (25 $), vérification identité (ID + carte bancaire au vrai nom).
2. **Préparer l'app dans Android Studio** (je t'aide via Cowork) :
   - `targetSdk = 35`, `compileSdk = 35`.
   - `applicationId` propre (ex. `fr.cadence.footflash` ou `com.footflash.app`).
   - `versionCode` / `versionName`.
   - Activer **Play App Signing**, générer un **AAB** signé (Android App Bundle, pas APK) : `Build > Generate Signed Bundle`.
3. **Vérifier les droits** (cf. §6) : retirer toute image de trophée FIFA, ajouter le disclaimer.
4. **Créer la fiche** (textes en §4) + **assets graphiques** (§4).
5. **Remplir les formulaires** : classification du contenu, public cible, sécurité des données, politique de confidentialité (URL §5), déclaration pubs = non.
6. **Test fermé** (si compte personnel) : 12 testeurs, 14 jours.
7. **Demander la production** → revue Google (quelques jours) → en ligne.

---

## 4. Fiche Google Play (textes prêts à coller)

**Nom de l'app** (max 30 car.)
```
Foot Flash 2026
```

**Description courte** (max 80 car.)
```
Calendrier, pronostics, quiz et effectifs du grand tournoi de l'été 2026.
```

**Description complète** (max 4000 car.)
```
Foot Flash 2026, ton compagnon pour vivre le grand tournoi de football de l'été 2026 (États-Unis · Canada · Mexique) du 11 juin au 19 juillet.

Tout le tournoi dans ta poche, même hors connexion :

⚽ CALENDRIER COMPLET
Les 104 matchs, par date et par groupe, avec compte à rebours jusqu'au coup d'envoi.

👕 48 ÉQUIPES, +1000 JOUEURS
Effectifs détaillés, postes, clubs, sélections et buts. Fiches équipe et indice de force.

🎯 PRONOSTICS
Pronostique chaque match, gagne des points, suis ta progression et grimpe au classement. Mode crédits et boost pour les matchs où tu as une vraie conviction.

🏆 FAVORIS DU MONDIAL
Classement des 48 équipes par indice de force (joueurs, classement, forme, palmarès) et probabilité de titre estimée — transparent, tu vois pourquoi chaque équipe est favorite.

🧠 QUIZ
Teste tes connaissances en mode Chrono ou Libre, avec classement et bonus de série.

📊 SIMULATEUR DE TABLEAU
Remplis le tableau final à partir de tes pronostics et simule le parcours jusqu'à la finale.

📰 ACTUS
Les dernières nouvelles agrégées depuis plusieurs sources, avec traduction automatique.

✈️ 100 % HORS-LIGNE
Toutes les données fonctionnent sans connexion. Gratuit, sans publicité, sans compte.

———
Application non officielle, indépendante et gratuite. Non affiliée à la FIFA ni à un quelconque organisateur ou diffuseur du tournoi. Les noms cités le sont à titre purement informatif et restent la propriété de leurs détenteurs respectifs.
Offert par Cadence Architectes Associés.
```

**Catégorie** : Sports
**Type** : Application
**Email de contact** : archi.tech.fr@gmail.com
**Site web** : https://architechfr.github.io/FOOT-FLASH/

### Assets graphiques à fournir
- **Icône** 512×512 px → tu l'as déjà (`ic_launcher-playstore.png`). Vérifie qu'elle ne contient pas le trophée FIFA.
- **Image mise en avant (feature graphic)** 1024×500 px → **à créer** (je peux te la générer).
- **Captures d'écran téléphone** : 2 à 8, format portrait (ex. 1080×2107 comme tes captures). Conseil : Accueil, Calendrier, Favoris, Pronostics, Quiz.
- (Optionnel) vidéo promo YouTube.

---

## 5. Politique de confidentialité (texte prêt à héberger)

> À héberger en ligne (ex. nouvelle page sur ton GitHub Pages) et coller l'URL dans Play Console. Je peux te créer la page.

```
POLITIQUE DE CONFIDENTIALITÉ — Foot Flash 2026
Dernière mise à jour : 31 mai 2026

Foot Flash 2026 est une application gratuite et indépendante.

Données personnelles : l'application ne crée aucun compte et ne collecte
aucune donnée personnelle identifiante. Aucune donnée n'est transmise au
développeur.

Stockage local : vos préférences, pronostics et scores sont enregistrés
uniquement sur votre appareil (stockage local du navigateur/WebView). Vous
pouvez les effacer à tout moment depuis les Réglages de l'application.

Services tiers : pour certaines fonctions, l'application contacte des
services externes qui peuvent recevoir votre adresse IP :
- flux d'actualités RSS (sources de presse) ;
- API de traduction MyMemory (traduction des actualités) ;
- api.qrserver.com (génération du QR code de partage).
Aucune de ces requêtes ne transmet d'information personnelle vous identifiant.

Publicité : aucune publicité, aucun traceur publicitaire.

Contact : archi.tech.fr@gmail.com
```

---

## 6. Check-list « droits » avant publication

- [ ] **Nom** sans « FIFA » / « World Cup » / « Coupe du Monde » → ✅ « Foot Flash 2026 » est conforme.
- [ ] **Aucune** mention « FIFA / World Cup / Coupe du Monde » dans la fiche, l'icône, les captures.
- [ ] **Image de trophée** : remplacer toute représentation du trophée officiel FIFA par un trophée générique / un ballon.
- [ ] Pas d'emblème officiel, de mascotte, d'affiche officielle, de logos de fédérations, de maillots officiels.
- [ ] **Disclaimer « non officiel »** présent dans l'app ET dans la fiche.
- [ ] Mention Cadence **discrète**, jamais présentée comme « sponsor/partenaire » du tournoi.
- [ ] Pour la diffusion via signatures mail : éviter tout visuel/marque de l'événement dans la com de Cadence.

> FIFA fait respecter ses droits très activement en année de tournoi. Pour un usage lié à ton activité professionnelle, un avis d'avocat en propriété intellectuelle (≈1 consultation) est le réflexe prudent.

---

## Sources
- Google Play — test 12 testeurs / 14 jours (comptes perso) : support.google.com/googleplay/android-developer/answer/14151465
- Google Play — niveau d'API cible (35 puis 36 au 31/08/2026) : developer.android.com/google/play/requirements/target-sdk
- Google Play — frais 25 $ + vérification identité : support.google.com/googleplay/android-developer/answer/6112435
- FIFA — Brand Protection / marques « World Cup », « Coupe du Monde » : inside.fifa.com/tournament-organisation/brand-protection
- FIFA World Cup 26 — IP Guidelines (PDF) : digitalhub.fifa.com
