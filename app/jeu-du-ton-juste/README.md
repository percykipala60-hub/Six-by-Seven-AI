# Le jeu du ton juste (par Six, Seven.AI)

Le jeu comprend 15 situations principales, 30 sous-niveaux, 5 quêtes spéciales, 210 devinettes (40 classiques, 100 difficiles et 70 expertes) et 82 énigmes (50 difficiles et 32 expertes). Le joueur écrit ce qu'il dirait ; Six (l'IA de Seven.AI, sur le modèle Claude) note la réponse sur 100 (empathie, clarté, assertivité, respect) avec un barème sévère, puis un tirage décide si la situation tourne bien. Les étoiles ouvrent les niveaux successifs et les quêtes spéciales. Les devinettes rapportent 5 à 100 points d'indice et les énigmes 30 à 110 points ; 5 points révèlent un indice dans un niveau. Une quête réussie pour la première fois rapporte 10 points d'indice.

Trois niveaux de difficulté structurent les défis bonus : les classiques se jouent sans limite d'essais, les difficiles autorisent deux tentatives, les expertes une seule. Chaque question est chronométrée (45 s en classique, 60 s en difficile, 75 s en expert) : un temps écoulé consomme une tentative, et une classique sans tentative restante est perdue. À la première défaite, **tous les points d'indice gagnés repartent à zéro**. Recommencer tire une nouvelle série de 10 questions (jamais les mêmes que la série précédente tant que d'autres restent) et le temps imparti fond de 15 % à chaque défaite (plancher de 15 s). Les questions sont tirées par séries mélangées : la série suivante mélange les non résolus, les jamais vus d'abord.

## Devinettes et énigmes

- `client/src/data/riddles.js` : les 40 devinettes classiques et l'assemblage des 210 devinettes (niveau et récompense inclus).
- `client/src/data/devinettes-difficiles.js` : 100 devinettes difficiles (logique, calcul, langage, observation), chacune avec sa réponse et son explication.
- `client/src/data/devinettes-expertes.js` : 70 devinettes expertes (raisonnement multi-étapes, pièges), une seule tentative, 60 à 100 points.
- `client/src/data/enigmas.js` : 50 énigmes difficiles de déduction, de calcul et de sciences, avec quatre choix et une explication.
- `client/src/data/enigmes-expertes.js` : 32 énigmes expertes (classiques de la logique formalisée), une seule tentative, 70 à 110 points.
- La progression enregistre séparément les devinettes (`solvedRiddles`, identifiants 1 à 210) et les énigmes (`solvedEnigmas`, identifiants 1 à 82). Les anciennes sauvegardes restent lisibles.
- Un test de contenu vérifie les effectifs, l'unicité des questions, la validité des réponses et les bornes de sauvegarde.

## Lancer le jeu

1. Serveur d'évaluation (port 3010) :
   ```bash
   cd server
   npm install
   npm start            # lit server/.env (copie de .env.example : mets-y ANTHROPIC_API_KEY)
   ```
   Sans `server/.env`, l'autre solution documentée est de lire la clé de six-app :
   ```bash
   npm run start:sixapp   # node --env-file=../../seven-ai-six/six-app/.env.local index.js
   ```
2. Jeu (port 5180), dans un autre terminal :
   ```bash
   cd client
   npm install
   npm run dev
   ```
3. Ouvrir http://localhost:5180.

Depuis `social-game/`, les mêmes lancements en une commande : `npm run serveur` et `npm run jeu`. Dans Claude Code, les lancements `jeu-serveur` et `jeu` de `.claude/launch.json` font la même chose (port 3010).

## Règles du jeu

- Score minimum par niveau : en dessous, échec automatique. Il monte de 40/100 (niveau 1) à 92/100 (niveau légendaire).
- Tirage : au-dessus du minimum, la réussite dépend d'une chance propre au niveau (90 % au niveau 1, 50 % au niveau 3 « piégé », 100 % au niveau légendaire).
- Étoiles : 1 dès 70/100, 2 dès 85, 3 dès 95. Un niveau réussi sous 70 ne rapporte aucune étoile. Rangs d'une partie : Bronze 70, Argent 80, Or 90, Platine 95, Diamant 98.
- Les niveaux principaux et sous-niveaux s'ouvrent dans l'ordre, après réussite du précédent et atteinte du seuil d'étoiles. Les quêtes spéciales s'ouvrent dès que leur propre seuil d'étoiles est atteint.
- Bonus, une seule fois chacun par niveau : « Sans-faute » (98+, +1), « Cœur fidèle » (niveau piégé réussi au premier essai, +2), « Série parfaite » (3 niveaux réussis pour la première fois d'affilée, +1, 5 fois au plus).
- **157 étoiles sont accessibles** ; les 50 étoiles « Sans-faute » (98/100) s'ajoutent par-dessus et portent le total théorique à 207. La carte affiche les 157 accessibles.
- Rangs du joueur : Débutant (0), Apprenti (8), Compétent (16), Pro (24), Expert (32), Maître (40).
- La progression reste dans le navigateur (localStorage) ; « Recommencer depuis le début » l'efface.

### Pourquoi ce jeu est dur

Les seuils suivent le cahier des charges : le joueur doit échouer souvent, et les étoiles récompensent l'excellence, pas la simple réussite. Sur le moteur réel, avec une note constante et un tirage toujours favorable :

| Note constante | Où s'arrête le joueur                      |
| -------------- | ------------------------------------------ |
| 80/100         | bloqué au niveau 8                         |
| 85/100         | niveau 14, sans ouvrir le légendaire       |
| 88/100         | ouvre le niveau légendaire sans le réussir |
| 92/100         | termine les 15 niveaux                     |

Le tirage rend le jeu plus dur encore. Le test « difficulté » verrouille ces paliers. Pour voir les notes que Six rend vraiment avant de retoucher ces valeurs :

```bash
cd server && npm start        # dans un terminal
cd server && npm run calibrer # dans un autre : échantillonne le barème réel (appels IA facturés)
```

## Dans l'application Six

Les joueurs jouent sur la page `/ton-juste` de Six, sans rien installer. Les réponses sont notées par la route `/api/ton-juste` de Six, avec **la clé IA de Six** (`ANTHROPIC_API_KEY` dans les variables du serveur de Six), sa limite par adresse, son plafond quotidien `AI_DAILY_LIMIT` et son réglage `TRUST_PROXY`. Le jeu a en plus son propre plafond, `TON_JUSTE_DAILY_LIMIT` (400 évaluations par jour par défaut, 0 pour le couper) : un jeu très dur pousse à réessayer souvent, et il ne doit pas vider le budget des autres fonctions de Six. Le serveur de ce dossier ne sert plus qu'au développement local.

Niveaux, consigne et validation ne sont écrits qu'une fois, ici : la route de Six les lit dans `client/src/data/levels.js`, `server/prompts.js` et `server/validation.js`. Après une modification du client, reconstruis la version servie par Six, puis commite `apps/web/public/ton-juste` :

```bash
npm --prefix jeu-du-ton-juste/client ci   # une fois, depuis la racine du dépôt
pnpm build:ton-juste                      # construit apps/web/public/ton-juste
```

Sans clé IA, la route répond 503 : le jeu n'attribue jamais de fausse note.

## Tests et vérifications

```bash
cd client && npm test   # moteur : tirage, étoiles, rangs, progression, déblocage, finissabilité
cd server && npm test   # ce que le serveur accepte, et qui a le droit d'appeler
cd client && npm run build
npm run lint            # ESLint, client et serveur

# Depuis social-game/ : tout d'un coup
npm run verifier        # lint + tests + build
npm run fumee           # serveur en marche : santé, modèle, évaluation complète
```

## Confidentialité et coût

- Le serveur prend la situation dans ses propres niveaux (`client/src/data/levels.js`) : il n'accepte que le numéro du niveau et la réponse, jamais un texte libre à envoyer à l'IA.
- La réponse du joueur est envoyée à Claude (Anthropic) pour être notée ; le serveur ne la garde pas et ne la journalise pas.
- Par défaut, le jeu en développement (port 5180) et la version construite servie par `vite preview` (port 4173) ont le droit d'appeler le serveur. `ALLOWED_ORIGINS` remplace cette liste : ajoute-y le port 4173 si ton `.env` la définit.
- Seules les origines déclarées peuvent appeler le serveur ; un appel distant sans origine est refusé (403). Le CORS seul ne suffisait pas : un client qui n'est pas un navigateur recevait quand même la réponse.
- 20 évaluations par minute et par adresse au maximum ; réponse limitée à 4 000 caractères ; corps de requête limité à 32 ko.
- Modèle : `claude-sonnet-5-5` par défaut (variable `CLAUDE_MODEL`), sortie JSON garantie par les sorties structurées, consigne mise en cache, repli automatique en cas de refus du modèle.

## Fichiers

- `server/index.js` : route `POST /api/evaluate` (`{ levelId, playerAnswer }`) et `GET /api/health`.
- `server/prompts.js` : barème et consignes de Six ; `server/validation.js` : ce que le serveur accepte ; `server/origins.js` : qui a le droit d'appeler.
- `server/scripts/fumee.mjs` : test de fumée (modèle, clé, évaluation) ; `server/scripts/calibrer.mjs` : harnais de calibrage du barème.
- `client/src/App.jsx` : écrans (carte, niveau, résultat) ; `engine/` : tirage, étoiles, rangs, progression ; `hooks/useSave.js` : sauvegarde.
- `AUDIT.md` : audit complet du jeu (constats, preuves, plan d'action) et suivi des corrections appliquées.
