# Six 1.0 — application (Seven.AI)

Next.js (App Router) + TypeScript, PWA installable. Remplace progressivement le MVP Express/HTML du dossier parent, qui reste intact.

## Lancer
1. `npm install`
2. Copier `.env.example` en `.env.local` et remplir `ANTHROPIC_API_KEY` (sans clé, un faux modèle de démonstration répond, avec un bandeau « Mode démonstration »).
3. `npm run dev` puis ouvrir http://localhost:3000 (si la page refuse de se connecter, c'est que le serveur n'est pas lancé).
4. Contrôles : `npm test` (vitest), `npm run typecheck`, et avec le serveur lancé `npm run e2e` (parcours complet et confidentialité dans un vrai navigateur). Hors-ligne et partage WhatsApp : version de production puis `BASE_URL=http://localhost:3000 npm run e2e:hors-ligne`. Navigateur : Edge par défaut, `BROWSER_CHANNEL=chrome` pour Chrome.
5. Production : `npm run build` puis `npm start`. Le service worker (hors-ligne) ne s'active qu'en production.

## Parcours (écrans)
Interface « Six 3 » (2026-10-10, inspirée de Claude Mobile et Gemini) : accueil avec salutation au centre et barre de saisie en bas (« + » pour coller, importer des captures ou un export), menu latéral, bouton rond de profil (mode invité), Réglages en liste groupée. Système visuel : `DESIGN.md` ; produit : `PRODUCT.md`.

Parcours en 4 étapes : Coller (texte, fichier `.txt` ou `.zip`, captures, partage depuis WhatsApp) → Protéger (données masquées) → Comprendre (lecture, second degré, alerte arnaque, objectif) → Répondre (trois réponses, ton et longueur changés sur place, ajustement, copie).
Autres pages : Sujets (« Quoi dire ? »), Réglages (apparence, mon style d'écriture), Confidentialité, Conditions d'utilisation, Mentions légales.

## Import depuis WhatsApp
WhatsApp n'offre aucune interface pour lire les discussions d'un utilisateur : une application ne peut pas aller chercher une conversation toute seule. Le bouton WhatsApp ouvre donc un écran guidé : l'utilisateur ouvre WhatsApp (`whatsapp://`), choisit lui-même la personne et la discussion, puis fait Plus > Exporter la discussion > Sans médias > Six.
Pour que Six apparaisse dans cette liste, la PWA doit être installée (Android). Le manifeste déclare une cible de partage (`share_target`, POST avec fichier) que le service worker (`public/sw.js`) intercepte : le fichier reste dans le navigateur (cache `six-share`), l'app le lit puis le supprime. La route `app/share-target` ne lit jamais le contenu : c'est un simple repli de redirection.
Limites : pas de cible de partage sur iPhone (Enregistrer dans Fichiers, puis « choisir le fichier ») ; le service worker ne s'active qu'en production (`npm run build` puis `npm start`) et sur HTTPS ou localhost.

## Import
- **Masquage** (`lib/anonymize.ts`, prénoms dans `lib/prenoms.ts`) : e-mails, liens, pseudos @, codes PIN/OTP, numéros de compte, téléphones, adresses, noms des interlocuteurs, prénoms courants (même en minuscules), noms après un titre ou une salutation, noms complets en milieu de phrase. Détection automatique, donc imparfaite : l'écran « Données protégées » le dit et permet d'ajouter un nom.
- **Export WhatsApp `.txt` ou `.zip`** : formats Android et iPhone, derniers messages gardés dans la limite de 2000 caractères.
- **Captures d'écran** (jusqu'à 4) : lues sur le téléphone (OCR Tesseract.js, français), jamais envoyées. Le texte lu apparaît avec « Moi » (bulles à droite) et « Autre » (bulles à gauche), à relire et corriger. Les fichiers OCR (~4 Mo utiles) sont copiés dans `public/ocr` par `scripts/copy-ocr.mjs` (lancé par `npm run dev` et `npm run build`, dossier ignoré par Git).

## IA et clés d'API
- Deux fournisseurs : Claude (Anthropic) et ChatGPT (OpenAI), dans `lib/ai.ts`. `AI_PROVIDERS=claude,openai` fixe l'ordre : si le premier échoue, le suivant prend le relais. Sans aucune clé, un faux modèle répond (bandeau « Mode démonstration »).
- Les clés sont celles de Seven.AI, placées dans `.env.local` (ou dans les variables d'environnement de l'hébergeur). Elles ne vont jamais dans le code, le navigateur ni les logs. L'utilisateur final ne saisit jamais de clé.
- Enregistrer une clé sans la montrer (Windows) : `powershell -ExecutionPolicy Bypass -File scripts/set-key.ps1 claude` (ou `openai`). Alternative : `node scripts/set-key.mjs claude`. Ne pas passer par `npm run` pour cette étape : certaines versions de npm ne transmettent pas le clavier au script.
- `npm run check-ai` teste chaque clé et chaque nom de modèle avec une toute petite demande, sans afficher les clés.
- Claude : `CLAUDE_MODEL_ANALYSE` (défaut `claude-haiku-4-5-20251001`) pour l'analyse, les retouches et les sujets ; `CLAUDE_MODEL_REDACTION` (défaut `claude-sonnet-5-5`) pour les 3 réponses.
- ChatGPT : pas de modèle par défaut. Renseigner `OPENAI_MODEL_ANALYSE` et `OPENAI_MODEL_REDACTION` (ou `OPENAI_MODEL`) après lecture de la doc OpenAI.
- Coût maîtrisé par : limite de 2000 caractères, 20 requêtes/minute/IP, petit modèle pour l'analyse. Fixer aussi une limite de dépense dans la console de chaque fournisseur.
- Appels Claude par le SDK officiel `@anthropic-ai/sdk` (`lib/ai.ts`). Pour Sonnet 5.5, le repli serveur en cas de refus est activé (`fallbacks: "default"`, bêta `server-side-fallback-2026-07-01`).
- **Mise en cache du prompt** : `cache_control` est posé sur le bloc système, pas sur la conversation (qui change à chaque fois et ne serait jamais relue). Le prompt de rédaction (`REDACTION_SYSTEM` dans `lib/prompt.ts`) est identique pour toutes les requêtes et fait environ 1270 tokens, au-dessus du minimum de 512 de Sonnet 5.5 : il est relu depuis le cache pendant 5 minutes, à environ 0,1x du prix. Ne jamais y insérer de contenu variable (date, nom, ton, objectif) : tout ce qui varie va dans le message utilisateur. Les prompts d'analyse (Haiku 4.5) sont sous le minimum de 4096 tokens : le marqueur y est ignoré sans frais.
- `npm run check-cache` (payant, environ 1 à 2 centimes) vérifie avec de vrais appels que le prompt dépasse le minimum et que la seconde demande relit le cache. Le serveur journalise pour chaque appel les nombres de tokens (entrée, cache écrit, cache lu, sortie), jamais le contenu. À relancer après toute modification d'un prompt.
- L'alerte arnaque combine des règles locales (`lib/scam.ts`) et le score donné par l'IA : le plus élevé gagne.
- Le style d'écriture de l'utilisateur (Réglages) reste dans son navigateur et n'est envoyé que comme consigne de rédaction.

## Protection de l'API et du budget
- Les routes `/api/*` refusent les appels venant d'un autre site (en-tête `Origin` ou `Sec-Fetch-Site`) et les requêtes sans aucun des deux (403). `ALLOWED_ORIGINS` ajoute d'autres domaines du site.
- Limite de 20 requêtes par minute et par adresse. L'adresse n'est lue dans `X-Forwarded-For` que si `TRUST_PROXY` indique le nombre de relais de confiance : on prend l'adresse ajoutée par l'hébergeur, jamais celle inventée par le client. **En production, régler `TRUST_PROXY`** (souvent 1), sinon tous les utilisateurs partagent une même limite.
- Plafond quotidien d'appels à l'IA par serveur (`AI_DAILY_LIMIT`, 1000 par défaut).
- Limites connues : ces protections sont en mémoire (par serveur) et un script peut imiter un navigateur. La vraie protection de la clé reste les comptes et quotas, et une limite de dépense mensuelle dans la console du fournisseur.

## Où est quoi
- `lib/anonymize.ts` masquage ; `lib/whatsapp.ts` exports WhatsApp ; `lib/zip.ts` lecture `.zip` ; `lib/ocr.ts` + `lib/ocr-layout.ts` captures ; `lib/scam.ts` règles d'arnaque ; `lib/prompt.ts` prompts et validation JSON ; `lib/ai.ts` fournisseurs Claude et ChatGPT ; `lib/providers.ts` étapes IA et faux modèle ; `lib/style.ts` style local.
- `app/api/{analyze,replies,adjust,topics}` : routes serveur (2000 caractères max, 20 requêtes/minute/IP, aucun contenu journalisé).
- `public/sw.js` : hors-ligne. Les appels `/api` ne sont jamais mis en cache.

## État
Vérifié (Edge piloté par script) : parcours complet avec import `.zip`, seul le texte masqué part vers l'API, style transmis, pages Sujets et légales, service worker et ouverture hors-ligne, `/api` jamais mis en cache. 29 tests unitaires, typage et build passent.
Vérifié aussi : écran WhatsApp, réception d'un export et d'un texte partagés par le service worker (cache vidé après lecture, rien envoyé au serveur).
NON vérifié : l'apparition de Six dans la vraie liste de partage de WhatsApp (à tester sur un téléphone Android avec la PWA installée), appels réels à Claude (pas de clé : les noms de modèles par défaut sont à contrôler au premier test), PWA et partage depuis WhatsApp sur un vrai téléphone, vraies captures WhatsApp (thèmes sombres, emojis), vitesse de l'OCR sur téléphone d'entrée de gamme.
Pas encore fait : comptes et quotas (demande un projet Supabase et une décision de l'équipe), modèles locaux (Ollama), fiches contacts et mini-jeu (décision en réunion), compléter les passages [À compléter] des pages légales.
