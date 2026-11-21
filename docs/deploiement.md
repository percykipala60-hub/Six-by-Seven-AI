# Archive — déploiement de l'ancien MVP Express

> Ce guide décrit l'ancien serveur Express à la racine du dépôt. Il ne déploie pas l'application actuelle, qui se trouve dans `six-app/` (Next.js). Ne suis pas ces commandes pour mettre en ligne Six 1.0.

Rédigé par l'agent `deploiement`, le 2026-09-29. Le lieu de déploiement n'est pas encore décidé par l'équipe (CLAUDE.md, section 10) : Render est proposé comme option principale, à valider et à noter dans `docs/decisions.md`.

Statut : ce guide n'a **pas** été exécuté sur un vrai compte Render. Les libellés de l'interface Render sont à vérifier au moment du déploiement.

## 1. Ce qu'il faut savoir avant

- Six est un serveur Node.js (Express) qui sert aussi le front (`public/`). Un seul service suffit, pas de base de données.
- `npm start` lance `node server/index.js`. Le port vient de `PORT` (fourni par l'hébergeur).
- **Ollama n'est pas joignable en ligne.** `OLLAMA_URL=http://localhost:11434` désigne la machine du serveur, pas celle d'un membre de l'équipe. En ligne, seul **Claude** fonctionne. Les moteurs `MODEL_A` et `MODEL_B` renverront une erreur. Le mode « Comparer les 3 » reste donc une démonstration locale (à faire sur un PC avec Ollama, pour alimenter la matrice). Alternative si l'équipe veut des modèles open-source en ligne : un fournisseur hébergé (nouveau fichier dans `server/providers/`, décision à passer par la matrice).
- **HTTPS obligatoire pour le PWA.** Le service worker et l'installation sur mobile exigent HTTPS (sauf `localhost`). Render, Vercel et Railway fournissent HTTPS sur leur domaine par défaut : ne pas partager d'URL `http://`.

## 2. Option principale : Render (Web Service)

1. Le code doit être sur GitHub (dépôt commun). Vérifier d'abord la section 5 (sécurité), puis que `main` contient bien `server/agents.js` et `package-lock.json` (aujourd'hui non versionnés, voir section 7).
2. Sur render.com : créer un compte, puis **New > Web Service**, connecter le dépôt GitHub.
3. Réglages :
   - Language / Runtime : **Node**
   - Branch : `main`
   - Build Command : `npm install`
   - Start Command : `npm start`
   - Instance type : voir section 6 (coûts).
4. Onglet **Environment** : ajouter les variables de la section 3. La clé `ANTHROPIC_API_KEY` se saisit uniquement ici, jamais dans le code ni dans Git.
5. Ajouter aussi `NODE_VERSION` = `20` (le projet demande Node 18+ ; fixer une version évite les surprises).
6. Optionnel : **Health Check Path** = `/api/models` (répond sans appeler Claude).
7. Lancer le déploiement. Render donne une URL `https://<nom>.onrender.com`.
8. Tester dans l'ordre :
   - `https://<nom>.onrender.com/api/models` renvoie une liste JSON.
   - Sur la page, générer 3 réponses avec le moteur Claude.
   - Sur un téléphone Android/iOS : ouvrir l'URL, vérifier l'installation du PWA (non testé à ce jour, cf. CLAUDE.md section 6).
9. Redéploiement : par défaut Render redéploie à chaque push sur la branche liée (à vérifier dans les réglages « Auto-Deploy »). Pour garder le contrôle avant la restitution, on peut passer en déploiement manuel.

## 3. Variables d'environnement

Référence : `.env.example`. En local, elles sont dans `.env` (ignoré par Git). En ligne, elles sont dans l'interface de l'hébergeur.

| Variable                           | En ligne                 | Rôle                                                                                                                                                             |
| ---------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`                | **Obligatoire, secrète** | Clé de l'API Anthropic. Sans elle, Claude renvoie « ANTHROPIC_API_KEY manquante ».                                                                               |
| `CLAUDE_MODEL`                     | **Obligatoire**          | Nom du modèle. Le code n'a pas de valeur par défaut : si vide, l'appel échoue. `.env.example` propose `claude-sonnet-4-5`, **à vérifier** dans la doc Anthropic. |
| `PORT`                             | Fourni par l'hébergeur   | Ne pas le fixer sur Render.                                                                                                                                      |
| `NODE_VERSION`                     | Recommandé (`20`)        | Spécifique à Render.                                                                                                                                             |
| `OLLAMA_URL`, `MODEL_A`, `MODEL_B` | Inutiles en ligne        | Ollama non joignable. Laisser les valeurs par défaut ou ne pas les définir.                                                                                      |

Ne jamais coller la clé dans un chat, un ticket, un compte-rendu ou une capture d'écran. En cas de fuite : révoquer la clé dans la console Anthropic et en créer une nouvelle.

## 4. Alternatives (brièvement)

- **Railway / Fly.io / VPS** : même principe (Node, `npm install`, `npm start`, mêmes variables). Adaptés à un serveur toujours actif. Conditions gratuites à vérifier.
- **Vercel** : pensé pour le front et les fonctions serverless. Le serveur Express actuel devrait être adapté (fonctions serverless), ce qui sort du MVP. Non recommandé sans travail supplémentaire.
- **Machine locale + tunnel HTTPS** (ex. Cloudflare Tunnel, ngrok) : seule option pour montrer Ollama en démo en ligne. Dépend d'un PC allumé, à réserver à la démonstration.

## 5. Contrôle de sécurité (résultats réels, 2026-09-29)

Commandes exécutées à la racine du projet :

| Contrôle                  | Résultat                                                                                                                                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env` ignoré par Git     | **OK.** `git check-ignore -v .env` renvoie la règle `.gitignore:1:.env`. `git ls-files` ne contient pas `.env`. Aucun fichier `.env` n'existe actuellement dans le dossier.                                                                                           |
| Historique Git            | **OK.** 1 seul commit (`275561b`). `git log --all -p` filtré sur `sk-ant`, `sk-...`, `AKIA`, `api_key = "..."`, `ANTHROPIC_API_KEY=<valeur>` : aucune correspondance. Seuls `.env.example` et `.claude/agents/secretaire.md` ont un nom contenant « env/key/secret ». |
| Clés dans le code et docs | **OK.** Recherche `sk-ant` / `sk-...` sur `server/`, `public/`, `docs/`, `.claude/` : aucune correspondance. `ANTHROPIC_API_KEY` n'apparaît que comme nom de variable (`claude.js`, README, CLAUDE.md, `.env.example`).                                               |
| `.env.example`            | **OK.** `ANTHROPIC_API_KEY=` vide, pas de secret.                                                                                                                                                                                                                     |
| Logs                      | **OK.** Le seul `console.log` du serveur affiche l'URL locale. Aucune conversation ni clé loguée.                                                                                                                                                                     |

Limites de ce contrôle : recherche par motifs (une clé au format inhabituel passerait), portée limitée à un seul commit local. À refaire avant chaque mise en ligne et avant le premier push. `node_modules/` n'a pas été analysé.

## 6. Coûts et quotas : à vérifier (aucun tarif n'est cité ici)

- **Anthropic API** : facturation à l'usage, par tokens. Tarifs du modèle choisi, limites de débit et solde/plafond de dépenses : voir la console et la page de tarification Anthropic. Recommandé : fixer un plafond de dépense mensuel dans la console et surveiller la consommation. Le départage Claude / OpenAI / Gemini de la matrice attend ces chiffres vérifiés.
- **Render** : vérifier sur la page de tarification Render les types d'instance, l'existence d'une offre gratuite et ses limites. Point à contrôler en particulier : une offre gratuite peut mettre le service en veille après inactivité, avec un premier chargement lent. À tester avant la démo devant le jury.
- **Protection du coût côté code** : entrée limitée à 2000 caractères, corps JSON limité à 50 ko, 20 requêtes/minute/IP, 3 modèles maximum par requête. Cela limite le risque mais ne remplace pas un plafond côté Anthropic.

## 7. Rate limit derrière un proxy : point à corriger

`server/index.js` compte les requêtes par `req.ip`. Sur Render (comme sur tout hébergeur avec reverse proxy), sans `app.set("trust proxy", 1)`, Express voit l'IP du proxy pour tous les visiteurs. Conséquences probables : **tous les utilisateurs partagent un seul quota de 20 requêtes/minute** (blocage rapide en démo). Le réglage `trust proxy` n'est pas présent dans le code à ce jour. À faire par `dev-backend` (hors périmètre de cet agent) : ajouter `app.set("trust proxy", 1)` avant le middleware, puis tester avec l'en-tête `X-Forwarded-For`. Ne pas mettre `true` sans réfléchir : une valeur trop permissive permet de falsifier l'IP et de contourner la limite. La Map `hits` est en mémoire : elle est remise à zéro à chaque redémarrage et ne fonctionne pas avec plusieurs instances.

## 8. Points signalés hors périmètre (non corrigés)

1. **Nouvelle route `/api/agents` et `/api/agents/chat`** (`server/agents.js`, non versionné) : elle lit `.claude/agents/*.md` et `CLAUDE.md` et appelle les modèles. Publiée en ligne, elle serait ouverte à tout visiteur : exposition du contenu interne du projet et consommation de la clé Claude (le rate limit est le seul garde-fou, cf. section 7). À décider avant déploiement : la désactiver en production ou la protéger. Décision à passer par l'équipe.
2. **Fichiers non versionnés** : `server/agents.js`, `public/agents.html`, `public/agents.js`, `package-lock.json`. `server/index.js` (modifié, non commité) importe `agents.js` : si `index.js` est commité sans `agents.js`, le serveur plantera au démarrage. Commiter les deux ensemble. Commiter aussi `package-lock.json` pour des builds reproductibles.
3. **`CLAUDE_MODEL` sans valeur par défaut** dans `claude.js` : une variable oubliée en ligne donne une erreur d'API peu claire.
4. **`npm test` non relancé** par cet agent (aucune modification de code de sa part).
5. Le PWA et les appels réels à Claude restent **non testés** (CLAUDE.md section 6).

## 9. Checklist avant mise en ligne

- [ ] Décision de l'hébergeur inscrite dans `docs/decisions.md`
- [ ] Contrôle de sécurité refait (section 5)
- [ ] `npm test` passe
- [ ] Nom exact de `CLAUDE_MODEL` vérifié, plafond de dépense Anthropic fixé
- [ ] `trust proxy` traité, route `/api/agents` tranchée
- [ ] Variables saisies dans l'hébergeur, pas dans Git
- [ ] Test sur HTTPS et sur un vrai téléphone
