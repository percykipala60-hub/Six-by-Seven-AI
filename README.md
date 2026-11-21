# Six

> L'IA propose, l'humain décide. — une PWA par **7 AI**

Six aide à répondre à une conversation (WhatsApp, SMS, Messenger, e-mail) sans jamais parler à la place de l'utilisateur. Ce dépôt contient la PWA, l'API et le code partagé.

## Où trouver Six

- **Application web** : <https://effulgent-jelly-177a12.netlify.app>
- **Version web et vitrine (dépôt)** : <https://github.com/percykipala60-hub/Six-by-Seven-AI>
- **Jeu du ton juste** : `/ton-juste` dans l'application (140 devinettes, dont 100 difficiles, et 50 énigmes)

**État : Phase 1** — squelette qui tourne, sécurité de base, CI. Le parcours en 11 étapes arrive en Phases 2 à 5.

## Structure

```
apps/
  api/        API Fastify (Node 22) — GET /health pour l'instant
  web/        PWA Next.js 16 + Tailwind 4
packages/
  shared/     Contrat front/back : schémas Zod (zod/mini, léger pour la 3G)
web/
  Six-by-Seven-AI/   Version web et vitrine, reliée en sous-module (<https://github.com/percykipala60-hub/Six-by-Seven-AI>) — `git submodule update --init` après un clonage
docs/
  decisions.md   Résultats des votes de l'équipe
```

## Démarrer (Windows, macOS, Linux)

Prérequis : **Node 22.13 ou plus (Node 24 conseillé)** et **pnpm 10** (`corepack enable` suffit, il est fourni avec Node).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env          # Windows : copy apps\api\.env.example apps\api\.env
cp apps/web/.env.example apps/web/.env.local    # Windows : copy apps\web\.env.example apps\web\.env.local
pnpm dev
```

- PWA : http://localhost:3000 (la pastille doit afficher « Serveur en ligne »)
- API : http://localhost:4000/health

Avec Docker, tout d'un coup (API, PWA, Redis) : `docker compose up --build`.

## Commandes

| Commande                       | Rôle                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `pnpm dev`                     | Lance l'API et la PWA en mode développement                  |
| `pnpm check`                   | Lint + format + types + tests : **à lancer avant chaque PR** |
| `pnpm test`                    | Tests unitaires (Vitest)                                     |
| `pnpm test:e2e`                | Tests navigateur Chromium (Android) et WebKit (iPhone)       |
| `pnpm build`                   | Build de production de tout le dépôt                         |
| `pnpm --filter @six/web icons` | Régénère les icônes PWA depuis le symbole vectoriel          |

Première fois pour les tests navigateur : `pnpm --filter @six/web exec playwright install --with-deps chromium webkit`.
Connexion lente ? Un Chromium déjà installé suffit : `PW_CHROMIUM_PATH=/chemin/vers/chrome pnpm test:e2e --project=android-chromium`.

## Écrans de Six 1.0

| Où                 | Écrans                                                                                                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                | Bienvenue                                                                                                                                                                                                                                       |
| `/accueil`         | Nouvelle conversation, sources (WhatsApp, texte), outils                                                                                                                                                                                        |
| `/repondre`        | Import (texte, .txt, .zip) → Anonymisation → Analyse → Compréhension (tension, récap) → Objectif + question → Ton, longueur, langue → Trois réponses (Autres, Ajuster, Pourquoi ?) → Ajustement → Copié. Alerte arnaque et bouclier hors ligne. |
| `/ton`             | Vérificateur de ton avant envoi                                                                                                                                                                                                                 |
| `/quoi-dire`       | Idées pour lancer ou relancer une conversation (marche hors ligne)                                                                                                                                                                              |
| `/arnaques`        | Arnaques de chez nous et règle d'or                                                                                                                                                                                                             |
| `/reglages`        | Apparence, moteur de Six, réponses par défaut, mes données                                                                                                                                                                                      |
| `/confidentialite` | Ce qui se passe avec tes messages, politique, conditions, mentions                                                                                                                                                                              |

## Utiliser Six 1.0 sur ton PC (l'app complète)

1. Ouvre Ollama (le modèle choisi dans `apps/api/.env`, `OLLAMA_MODEL`, doit être téléchargé).
2. Dans le dossier du projet : `pnpm dev`, puis ouvre <http://localhost:3000> et touche « Coller une conversation ».
3. Colle quelques messages ou importe l'export WhatsApp (.txt, « sans médias »).

Ce qui se passe, dans l'ordre :

| Où        | Quoi                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| Téléphone | Lecture du fil, choix de « moi », **anti-arnaque par règles** (sans réseau)                                     |
| Téléphone | Risque élevé → **bouclier** : 3 réponses sûres, rien n'est envoyé                                               |
| Téléphone | **Masquage vérifiable** des 12 derniers messages : noms, numéros, e-mails. L'utilisateur relit, décoche, ajoute |
| Serveur   | 2e passe de masquage (numéros, e-mails), **Agent Six** (rédaction, contrôle, corrections ciblées)               |
| Téléphone | Les vrais noms sont remis dans les brouillons ; l'utilisateur choisit, modifie, copie, envoie lui-même          |

Avec une clé Claude dans `apps/api/.env` (`ANTHROPIC_API_KEY=sk-ant-…`), l'app utilise Claude au lieu d'Ollama, sans autre changement.
Les offres gratuites en ligne (Groq, Gemini) ne sont jamais utilisées par l'app : seulement par les scripts d'essai, avec `--cloud-ok`.

## Essayer l'IA sur une vraie conversation

`pnpm essai-ia <conversation.txt>` envoie une conversation (export WhatsApp ou texte copié) aux fournisseurs configurés dans `apps/api/.env`, puis affiche côte à côte le résumé, les 3 réponses et le temps de chaque modèle. Rien n'est enregistré.

**Serveur local (recommandé pour les vraies conversations : rien ne quitte le PC)**

1. Installe Ollama depuis https://ollama.com puis lance l'application.
2. `ollama pull llama3.2:3b` (PC avec 8 Go de RAM) ou `ollama pull mistral:7b` (16 Go).
3. `pnpm essai-ia ma-conversation.txt --fournisseurs=ollama`

**API gratuites en ligne** : crée une clé chez Groq (console.groq.com), Google AI Studio (Gemini) ou Mistral, colle-la dans `apps/api/.env`, puis ajoute `--cloud-ok`. Leurs offres gratuites peuvent utiliser les conversations pour entraîner leurs modèles : n'y envoie que des conversations dont les personnes sont d'accord.

**Deux IA en même temps**

- Comparer : `OLLAMA_MODEL=llama3.2:3b,mistral:7b` dans `apps/api/.env`. Les modèles rédigent en parallèle et s'affichent l'un sous l'autre (`--sequentiel` pour l'un après l'autre).
- Rédacteur + vérificateur : `--verifier=mistral:7b` fait relire chaque brouillon par un second modèle, qui valide, refuse (avec la raison) et propose une correction. Un modèle en ligne s'écrit `groq/llama-3.3-70b-versatile`.

**Agent Six : encadrer un petit modèle**

`--agent` remplace l'appel direct au modèle par l'Agent Six (`apps/api/src/agent/`) :

1. le code lit le fil (auteurs, dernier message, heures et montants cités) ;
2. des règles détectent les arnaques connues (code PIN, Mobile Money, urgence, secret, faux recrutement, lien raccourci), sans IA ;
3. le modèle reçoit une demande courte, avec un exemple ;
4. le code contrôle chaque brouillon (ton de conseiller, fait inventé, code donné, nom masqué, doublon) et renvoie les fautes au modèle, 2 fois au plus ;
5. si le modèle échoue, l'agent fournit des brouillons sûrs.

```bash
pnpm essai-ia chat.txt --moi="Damien" --agent
pnpm banc mes-conversations/ --moi="Damien"          # modèle seul contre agent, chiffres à l'appui
pnpm banc mes-conversations/ --moi="Damien" --modele=mistral:7b
```

Avec `--moi`, l'agent **apprend ta façon d'écrire** à chaque conversation (des chiffres seulement, stockés sur ton PC dans `~/.six/`) et te demande quel brouillon tu choisirais, pour retenir ton type de réponse préféré. Avant d'écrire, il réfléchit comme un ami : relation, ressenti, demande, non-dit, enjeu, tu ou vous. Voir `docs/apprentissage.md`. `--sans-apprentissage` désactive l'apprentissage.

Dans le dossier du banc, nomme `arnaque-….txt` les conversations qui contiennent une arnaque : le banc vérifie qu'elles sont signalées.

Options : `--moi="Ton nom dans WhatsApp"`, `--ton=amical|professionnel|ferme|chaleureux|court`, `--langue=fr|en|ln`, `--objectif="gagner du temps"`.

## Règles non négociables

1. **Aucune conversation stockée ni journalisée.** Les logs de l'API n'écrivent ni corps, ni query string, ni en-têtes, ni IP (test `apps/api/test/logs.test.ts`).
2. **Les secrets restent côté serveur.** Seules les variables `NEXT_PUBLIC_*` arrivent dans le navigateur ; `.env` n'est jamais commité ; gitleaks bloque la CI si une clé fuit.
3. **Le texte de l'IA s'affiche en texte**, jamais en HTML (`dangerouslySetInnerHTML` est interdit par ESLint).
4. **Tout marche sur iPhone ET Android bas de gamme** : chaque test navigateur tourne sur WebKit et Chromium.
5. Une fonctionnalité non terminée le 13 octobre ne part pas en production.

## Hooks Git

Installés automatiquement par `pnpm install` (Husky) :

- avant chaque commit : ESLint et Prettier sur les fichiers modifiés ;
- avant chaque push : types et tests.

## Mettre en ligne la version de test

1. **API** sur [Render](https://render.com) : New → Web Service → ce dépôt → Docker, chemin `apps/api/Dockerfile`, contexte `.`. Variables : `CORS_ORIGINS=https://<ton-site>.vercel.app`, `NODE_ENV=production`.
2. **PWA** sur [Vercel](https://vercel.com) : New Project → ce dépôt → Root Directory `apps/web`. Variable : `NEXT_PUBLIC_API_URL=https://<ton-api>.onrender.com`.
3. Ouvre le site sur un téléphone : la pastille doit passer au vert.

À vérifier avant le lancement public : l'offre gratuite de Vercel est réservée à un usage non commercial, et l'offre gratuite de Render se met en veille (premier appel lent). Voir `docs/decisions.md`.

## Contribuer

Une branche par tâche (`feat/import-whatsapp`), une PR relue par un autre membre, la CI au vert. `main` est protégée.
