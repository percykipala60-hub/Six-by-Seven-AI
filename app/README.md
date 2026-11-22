# Six

> L'IA propose, l'humain décide. — une application de **Seven.AI**

Six aide à répondre à une conversation (WhatsApp, SMS, Messenger, e-mail) sans jamais parler à la place de l'utilisateur : il explique ce que l'autre veut dire, repère les arnaques et propose trois réponses au ton juste. L'utilisateur choisit, ajuste et envoie lui-même. Seven AI, l'assistant de discussion, vit dans la même app.

## Où trouver Six

- **Application** : <https://app.sixbysevenai.com> (navigateur, et apps Android et iOS qui l'ouvrent)
- **Site de présentation** : <https://sixbysevenai.com> (dossier [`../site`](../site))
- **Dépôt** : <https://github.com/percykipala60-hub/Six-by-Seven-AI>

Produit et public : [`apps/web/PRODUCT.md`](apps/web/PRODUCT.md). Système visuel : [`apps/web/DESIGN.md`](apps/web/DESIGN.md). Décisions de l'équipe : [`docs/decisions.md`](docs/decisions.md).

## Structure

```
apps/
  web/        L'application en ligne : Next.js 16 + Tailwind 4, routes IA (app/api/), apps Android et iOS (Capacitor)
  api/        API Fastify (Node 22) et Agent Six : sert aux essais d'IA et au banc, pas déployée en production
packages/
  shared/     Contrat front/back : schémas Zod (zod/mini, léger pour la 3G)
jeu-du-ton-juste/   Le jeu du ton juste (client Vite et serveur), intégré sur /ton-juste
kin-rush-app/       Kin Rush, jeu autonome en un fichier HTML, intégré sur /jeu
banc/               Conversations d'exemple pour `pnpm banc`
docs/               Décisions, faisabilité, apprentissage du style
setup_complet_supabase.sql   Création de la base Supabase (comptes, mémoire)
```

En production, seule `apps/web` tourne : elle appelle elle-même les fournisseurs d'IA (Claude, puis OpenAI en relais).

## Démarrer (Windows, macOS, Linux)

Prérequis : **Node 22.13 ou plus (Node 24 conseillé)** et **pnpm 10** (`corepack enable` suffit, il est fourni avec Node).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env          # Windows : copy apps\api\.env.example apps\api\.env
cp apps/web/.env.example apps/web/.env.local    # Windows : copy apps\web\.env.example apps\web\.env.local
pnpm dev
```

- Application : http://localhost:3000
- API d'essai : http://localhost:4000/health

Dans `apps/web/.env.local` :

- `ANTHROPIC_API_KEY` (ou `OPENAI_API_KEY`) : sans clé, Six répond avec un faux modèle (bandeau « Mode démonstration »). `pnpm --filter @six/web check-ai` teste chaque clé.
- `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` : un compte est obligatoire à l'ouverture de l'app, il faut donc un projet Supabase (base créée avec `setup_complet_supabase.sql`).

Avec Docker, tout d'un coup (API, application, Redis) : `docker compose up --build`.

## Commandes

| Commande                               | Rôle                                                                 |
| -------------------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                             | Lance l'API et l'application en mode développement                   |
| `pnpm check`                           | Lint + format + types + tests : **à lancer avant chaque PR**         |
| `pnpm test`                            | Tests unitaires (Vitest)                                             |
| `pnpm test:e2e`                        | Parcours et jeux dans un vrai navigateur (serveur déjà lancé)        |
| `pnpm build`                           | Build de production de tout le dépôt                                 |
| `pnpm verifier`                        | Vérifie qu'un clone neuf démarre                                     |
| `pnpm --filter @six/web apk`           | Construit l'APK Android de test                                      |
| `pnpm --filter @six/web android:store` | Construit l'AAB signé pour le Play Store (voir `apps/web/README.md`) |

Tests navigateur : Edge est utilisé par défaut sous Windows, Chromium ailleurs (`pnpm --filter @six/web exec playwright-core install chromium` la première fois). `BASE_URL` change le serveur visé, `BROWSER_CHANNEL=chrome` utilise Chrome.

## Écrans

| Où                                                    | Écrans                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                   | Six : connexion obligatoire, puis un seul écran comme une messagerie d'IA. On colle ou importe une conversation (texte, `.txt`, `.zip`, captures), Six la masque, l'explique, signale les arnaques et propose trois réponses à ajuster et copier. |
| `/seven-ai`                                           | Seven AI : plusieurs discussions (menu « Nouvelle discussion »), documents, micro, export PDF                                                                                                                                                     |
| `/sujets`                                             | « Quoi dire ? » : idées pour lancer ou relancer une conversation                                                                                                                                                                                  |
| `/rapide`                                             | Page ouverte par la bulle et le clavier Android                                                                                                                                                                                                   |
| `/reglages`                                           | Apparence (thèmes, polices), style d'écriture, notifications des apps, mémoire et compte                                                                                                                                                          |
| `/espace-jeu`, `/jeu`, `/ton-juste`, `/coupe-arnaque` | Les jeux : Kin Rush, Le jeu du ton juste, Coupe l'arnaque                                                                                                                                                                                         |
| `/confidentialite`, `/conditions`, `/mentions`        | Textes légaux                                                                                                                                                                                                                                     |

Le choix entre Six et Seven AI se fait par les deux icônes de la barre du haut.

## Agent Six et essais d'IA

L'Agent Six (`apps/api/src/agent/`) encadre un petit modèle (Ollama sur le PC, ou Claude avec `ANTHROPIC_API_KEY` dans `apps/api/.env`) :

1. le code lit le fil (auteurs, dernier message, heures et montants cités) ;
2. des règles détectent les arnaques connues (code PIN, Mobile Money, urgence, secret, faux recrutement, lien raccourci), sans IA ;
3. le modèle reçoit une demande courte, avec un exemple ;
4. le code contrôle chaque brouillon (ton de conseiller, fait inventé, code donné, nom masqué, doublon) et renvoie les fautes au modèle, 2 fois au plus ;
5. si le modèle échoue, l'agent fournit des brouillons sûrs.

```bash
pnpm essai-ia chat.txt --moi="Damien" --agent         # une conversation, modèles côte à côte
pnpm banc banc/ --moi="Damien"                         # modèle seul contre agent, chiffres à l'appui
pnpm banc banc/ --moi="Damien" --modele=mistral:7b
```

- **Ollama (recommandé pour les vraies conversations, rien ne quitte le PC)** : installe-le depuis https://ollama.com, puis `ollama pull llama3.2:3b` (8 Go de RAM) ou `ollama pull mistral:7b` (16 Go).
- **API gratuites en ligne** (Groq, Gemini, Mistral) : clé dans `apps/api/.env`, puis `--cloud-ok`. Leurs offres gratuites peuvent utiliser les conversations pour entraîner leurs modèles : n'y envoie que des conversations dont les personnes sont d'accord. L'application ne les utilise jamais.
- **Deux modèles** : `OLLAMA_MODEL=llama3.2:3b,mistral:7b` pour comparer ; `--verifier=mistral:7b` pour faire relire chaque brouillon par un second modèle (un modèle en ligne s'écrit `groq/llama-3.3-70b-versatile`).
- **Apprentissage** : avec `--moi`, l'agent apprend ta façon d'écrire (des chiffres seulement, stockés dans `~/.six/`) et retient ton type de réponse préféré. Voir [`docs/apprentissage.md`](docs/apprentissage.md). `--sans-apprentissage` le désactive.
- Dans le dossier du banc, nomme `arnaque-….txt` les conversations qui contiennent une arnaque : le banc vérifie qu'elles sont signalées.

Options : `--moi="Ton nom dans WhatsApp"`, `--ton=amical|professionnel|ferme|chaleureux|court`, `--langue=fr|en|ln`, `--objectif="gagner du temps"`.

## Règles non négociables

1. **Aucune conversation stockée ni journalisée.** Les conversations et les discussions Seven AI restent sur l'appareil ; le compte ne garde que la mémoire de Six (habitudes, notes), et seulement si la personne l'autorise. Les logs n'écrivent ni corps, ni query string, ni en-têtes, ni IP (test `apps/api/test/logs.test.ts`).
2. **Les secrets restent côté serveur.** Seules les variables `NEXT_PUBLIC_*` arrivent dans le navigateur ; `.env` et les clés Apple (`*.p8`) ne sont jamais commités ; gitleaks bloque la CI si une clé fuit.
3. **Le texte de l'IA s'affiche en texte**, jamais en HTML (`dangerouslySetInnerHTML` est interdit par ESLint).
4. **Tout marche sur iPhone ET Android bas de gamme**, avec un réseau faible.

## Hooks Git

Installés automatiquement par `pnpm install` (Husky) :

- avant chaque commit : ESLint et Prettier sur les fichiers modifiés ;
- avant chaque push : types et tests.

## Mise en ligne

Six tourne sur notre serveur (DigitalOcean, Francfort), derrière Caddy : l'application sur https://app.sixbysevenai.com et le site sur https://sixbysevenai.com. Installation et mises à jour : voir [`deploy/LISEZMOI.md`](../deploy/LISEZMOI.md) à la racine du dépôt. Apps Android et iOS : voir [`apps/web/README.md`](apps/web/README.md).

## Contribuer

Une branche par tâche (`feat/import-whatsapp`), une PR relue par un autre membre, la CI au vert. `main` est protégée.
